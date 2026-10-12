"""warehouse の提供用データ（marts）の表を、同名・同列のまま D1 に写す（ADR 0022）。

    bun run --cwd pipeline serving:sync -- --database-id <uuid> [--dry-run]
    bun run --cwd pipeline serving:sync -- --local [--persist-to <dir>] [--dry-run]

手順: 表ごと（origin → 木の表）に `<表>__new` を drop → create → 全件投入し、行数と（木の表は）
団体・年度ごとの amount_yen の和を warehouse と照合する。全部合ったときだけ、1つの batch で
`drop table if exists <表>; alter table <表>__new rename to <表>;` と index の作成を行う。
合わなければ rename せず失敗する（`__new` は残り、次の実行の最初に捨てる）。

前提:
- 書き込むのはこの script だけで、同時に2つ以上実行しない（`__new` が衝突する）。
- 表の列・型・index は `apps/api/src/columns.json`（serving:columns）が正。warehouse と食い違えば止まる。
- D1 の上限（1文の SQL 100KB）を守るため、行は表・団体ごとに流し、全行を一度にメモリへ載せない。
  値は SQL の literal に埋め込む（D1 の REST は params に NULL を渡せない）。boolean は 0/1。
- `cf d1 raw --local` は「Network connection lost」で散発的に失敗する（cf 1.0.0-beta の実測）ので3回まで再試行する。
  応答が失われただけで書き込みは済んでいた場合に備え、投入は `insert or replace`（流し直しても同じ結果）にし、最後の行数照合で重複や欠落を止める。
- cf の呼び出し回数を減らすため、多数の文を1回の `cf d1 raw --batch` にまとめる（約1MBごと）。
"""
from __future__ import annotations

import argparse
import json
import os
import resource
import signal
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path
from typing import Any, Callable, Iterator

import duckdb

from serving import columns as contract

LOCAL_PERSIST_TO = contract.PIPELINE.parent / 'apps/api/.cloudflare/state'
LOCAL_DATABASE_ID = '00000000-0000-4000-8000-000000000001'

# D1 の1文 100KB の内側。1回の cf 呼び出しの大きさ
MAX_STATEMENT_BYTES = 60_000
MAX_ROWS_PER_STATEMENT = 100
MAX_BATCH_BYTES = 1_000_000
FETCH_ROWS = 500
MEMORY_LIMIT = '1GB'

# origin を先に、木の表を後に
TABLE_ORDER = ['origin', 'settlement_expenditure_node', 'initial_expenditure_node']

Table = dict  # columns.json の1表


def literal(value: Any) -> str:
    if value is None:
        return 'NULL'
    if isinstance(value, bool):
        return '1' if value else '0'
    if isinstance(value, int):
        return str(value)
    if isinstance(value, str):
        if '\x00' in value:
            raise ValueError('NUL を含む文字列は同期できない')
        return "'" + value.replace("'", "''") + "'"
    raise TypeError(f'literal にできない値: {value!r}')


def insert_statements(table: str, names: list[str], rows: Iterator[tuple]) -> Iterator[str]:
    """1文が MAX_STATEMENT_BYTES か MAX_ROWS_PER_STATEMENT に達するごとに区切る。"""
    head = f'insert or replace into "{table}" ({", ".join(chr(34) + n + chr(34) for n in names)}) values '
    parts: list[str] = []
    size = len(head)
    for row in rows:
        values = '(' + ','.join(literal(v) for v in row) + ')'
        if parts and (size + len(values) + 1 > MAX_STATEMENT_BYTES or len(parts) >= MAX_ROWS_PER_STATEMENT):
            yield head + ','.join(parts)
            parts, size = [], len(head)
        parts.append(values)
        size += len(values) + 1
    if parts:
        yield head + ','.join(parts)


def pack(statements: Iterator[str]) -> Iterator[list[dict]]:
    batch: list[dict] = []
    size = 0
    for sql in statements:
        if batch and size + len(sql) > MAX_BATCH_BYTES:
            yield batch
            batch, size = [], 0
        batch.append({'sql': sql})
        size += len(sql)
    if batch:
        yield batch


def new_name(table: str) -> str:
    return f'{table}__new'


def swap_statements(tables: dict[str, Table]) -> list[dict]:
    out = []
    for name in TABLE_ORDER:
        out.append(f'drop table if exists "{name}"')
        out.append(f'alter table "{new_name(name)}" rename to "{name}"')
        out += contract.create_index_sql(name, tables[name])
    return [{'sql': sql} for sql in out]


# warehouse

def open_warehouse(path: Path) -> duckdb.DuckDBPyConnection:
    return duckdb.connect(str(path), read_only=True, config={'memory_limit': MEMORY_LIMIT, 'threads': 2})


def table_rows(con: duckdb.DuckDBPyConnection, table: str, names: list[str], order: str) -> Iterator[tuple]:
    cursor = con.execute(f'select {", ".join(chr(34) + n + chr(34) for n in names)} from main."{table}" order by {order}')
    while chunk := cursor.fetchmany(FETCH_ROWS):
        yield from chunk


def expected(con: duckdb.DuckDBPyConnection, name: str, spec: Table) -> dict:
    count = con.execute(f'select count(*) from main."{name}"').fetchone()[0]
    sums = {}
    if spec.get('document_kind'):
        for code, year, total in con.execute(
                f'select jurisdiction_code, fiscal_year, sum(amount_yen)::hugeint from main."{name}" group by 1, 2').fetchall():
            sums[(code, year)] = int(total) if total is not None else None
    return {'count': count, 'sums': sums}


# D1

def run_until_json(command: list[str], timeout: float = 300) -> tuple[int | None, str, str]:
    """標準出力が JSON として閉じたら終了とみなす。

    `cf d1 raw --local` は応答を出したあともローカルの runtime が残り、数分プロセスが終わらない（cf 1.0.0-beta.6 の実測）。
    応答は書き込みの完了後に出るので、JSON が閉じた時点で止めてよい。
    """
    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
    errors: list[bytes] = []
    watchdog = threading.Timer(timeout, lambda: os.killpg(process.pid, signal.SIGKILL))
    watchdog.start()
    threading.Thread(target=lambda: errors.append(process.stderr.read()), daemon=True).start()
    data = b''
    while chunk := os.read(process.stdout.fileno(), 1 << 16):
        data += chunk
        if data.lstrip().startswith(b'['):
            try:
                json.loads(data)
            except ValueError:
                continue
            watchdog.cancel()
            os.killpg(process.pid, signal.SIGKILL)
            process.wait()
            return None, data.decode(), ''
    watchdog.cancel()
    code = process.wait()
    return code, data.decode(), b''.join(errors).decode()


class D1:
    """`cf d1 raw`。1回の呼び出しで複数の文を batch として流す（batch は1つのトランザクション）。"""

    def __init__(self, database_id: str, local: bool, persist_to: Path):
        self.command = ['cf', 'd1', 'raw', database_id]
        if local:
            self.command += ['--local', '--persist-to', str(persist_to)]
        self.calls = 0

    def batch(self, statements: list[dict]) -> list[dict]:
        self.calls += 1
        with tempfile.NamedTemporaryFile('w', suffix='.json', encoding='utf-8') as file:
            json.dump(statements, file, ensure_ascii=False)
            file.flush()
            for attempt in range(3):
                code, stdout, stderr = run_until_json([*self.command, '--batch', f'@{file.name}'])
                if code in (0, None):
                    break
                print(f'  cf 失敗 {attempt + 1} 回目: {stdout[-200:]}{stderr[-200:]}'.replace(chr(10), ' '), flush=True)
                if attempt == 2:
                    raise RuntimeError(f'cf d1 raw が失敗した: {stdout[:2000]}{stderr[:2000]}')
                time.sleep(5)
        results = json.loads(stdout)
        if len(results) != len(statements) or not all(r.get('success') for r in results):
            raise RuntimeError(f'cf d1 raw の結果が不正: {stdout[:2000]}')
        return results


def verify(d1: D1, tables: dict[str, Table], want: dict[str, dict]) -> list[str]:
    """`__new` の行数と、団体・年度ごとの amount_yen の和を warehouse と照合する（1回の呼び出し）。"""
    statements = []
    for name in TABLE_ORDER:
        statements.append({'sql': f'select count(*) from "{new_name(name)}"'})
        if tables[name].get('document_kind'):
            statements.append({'sql': f'select jurisdiction_code, fiscal_year, sum(amount_yen) from "{new_name(name)}" group by 1, 2'})
    results = iter(d1.batch(statements))
    problems = []
    for name in TABLE_ORDER:
        count = next(results)['results']['rows'][0][0]
        if count != want[name]['count']:
            problems.append(f'{name}: 行数 D1 {count} != warehouse {want[name]["count"]}')
        if tables[name].get('document_kind'):
            got = {(code, year): total for code, year, total in next(results)['results']['rows']}
            if got != want[name]['sums']:
                diff = sorted(k for k in got.keys() | want[name]['sums'].keys() if got.get(k) != want[name]['sums'].get(k))
                problems.append(f'{name}: amount_yen の和が違う団体・年度 {diff[:5]}')
    return problems


def rss_mb() -> float:
    return resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024 / 1024  # macOS は bytes


def sync(d1: D1 | None, warehouse: Path, dry_run: bool, log: Callable[[str], None] = lambda m: print(m, flush=True)) -> int:
    tables = contract.load()
    con = open_warehouse(warehouse)
    try:
        if contract.build(contract.warehouse_columns(warehouse, con)) != {'tables': tables}:
            raise SystemExit('columns.json が warehouse と食い違う。serving:columns で書き直す')
        want = {name: expected(con, name, tables[name]) for name in TABLE_ORDER}
        started = time.time()
        for name in TABLE_ORDER:
            spec = tables[name]
            names = [c['name'] for c in spec['columns']]
            order = 'jurisdiction_code, fiscal_year, node_id' if spec.get('document_kind') else spec['primary_key']

            def statements(name=name, spec=spec, names=names, order=order) -> Iterator[str]:
                yield f'drop table if exists "{new_name(name)}"'
                yield contract.create_table_sql(name, spec, new_name(name))
                yield from insert_statements(new_name(name), names, table_rows(con, name, names, order))

            calls = size = 0
            for batch in pack(statements()):
                calls += 1
                size += sum(len(s['sql']) for s in batch)
                if d1 and not dry_run:
                    d1.batch(batch)
            log(f'{name}: {want[name]["count"]} 行 / {calls} 回 / {size / 1e6:.1f}MB / RSS最大 {rss_mb():.0f}MB')
        if dry_run:
            log('dry-run: D1 には書いていない')
            return 0
        problems = verify(d1, tables, want)
        if problems:
            for p in problems:
                log(f'照合に失敗: {p}')
            log('rename せず中止（__new は残る）')
            return 1
        d1.batch(swap_statements(tables))
        log(f'完了: cf {d1.calls} 回 / {time.time() - started:.0f} 秒 / RSS最大 {rss_mb():.0f}MB')
        return 0
    finally:
        con.close()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('--database-id', help='D1 の database id（--local なら省略可）')
    parser.add_argument('--local', action='store_true', help='ローカルの D1（miniflare）に書く。リモートには触れない')
    parser.add_argument('--persist-to', type=Path, default=LOCAL_PERSIST_TO, help='--local の状態の置き場')
    parser.add_argument('--warehouse', type=Path, default=contract.WAREHOUSE)
    parser.add_argument('--dry-run', action='store_true', help='文を作って数えるだけで、書かない')
    args = parser.parse_args()
    database_id = args.database_id or (LOCAL_DATABASE_ID if args.local else None)
    if not database_id and not args.dry_run:
        parser.error('--database-id か --local が要る')
    d1 = D1(database_id, args.local, args.persist_to) if database_id else None
    return sync(d1, args.warehouse, args.dry_run)


if __name__ == '__main__':
    sys.exit(main())
