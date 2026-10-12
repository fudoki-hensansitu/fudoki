"""warehouse の提供用データ（marts）の表を、同名・同列のまま D1 に写す（ADR 0022）。

    bun run --cwd pipeline serving:sync -- --database-id <uuid> [--dry-run]
    bun run --cwd pipeline serving:sync -- --local [--persist-to <dir>] [--dry-run]

手順:
1. 開始時に、前回の失敗の残骸 `<表>__new`・`<表>__old` を無条件に drop する（本名の表には触らない）。
2. 表ごと（origin → 木の表）に `<表>__new` を create し、全件投入する。
3. `__new` から全行を主キーの先頭1文字ごと（sha の hex。1回の出力を抑えられる）に読み戻し、warehouse の同じ行と
   1行ずつ全列で突き合わせる（`verify`）。1つでも違えば最初の数件の主キーと列名を出して止め、入れ替えない。
4. 3表とも合ったら、1つの batch で表ごとに `drop table if exists <表>; alter table <表>__new rename to <表>;` と index の作成。

可用性は担保しない。D1 は warehouse から作り直せる写しで、失敗した同期の途中や後では、API がエラーを返したり
表の世代が混ざったりし得る（Cloudflare の公式文書は REST の query/raw に複数文を渡したときの原子性を保証していない）。
そのときはもう一度同期を流す。(1) から作り直して直る。復旧処理は持たない。入れ替えの batch は再送しない
（成功したのに応答だけ失った場合に、再送が失敗して表が欠けた状態を固定しないため）。

前提:
- 書き込むのはこの script だけで、同時に2つ以上実行しない（`__new` が衝突する）。
- 表の列・型・index は `apps/api/src/columns.json`（serving:columns）が正。warehouse と食い違えば止まる。
- D1 の上限（1文の SQL 100KB）を守るため、行は表・団体ごとに流し、全行を一度にメモリへ載せない。
  値は SQL の literal に埋め込む（D1 の REST は params に NULL を渡せない）。boolean は 0/1。
- `cf d1 raw --local` は「Network connection lost」で散発的に失敗する（cf 1.0.0-beta の実測）ので3回まで再試行する。
  応答が失われただけで書き込みは済んでいた場合に備え、投入は `insert or replace`（流し直しても同じ結果）にし、最後の行数照合で重複や欠落を止める。
- D1 の REST は1回の API 要求が30秒以内（公式 limits）。1回の cf 呼び出しは約1MBの batch と、読み戻し約4000行に抑える。
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
READ_ROWS_PER_CALL = 4000

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
    if isinstance(value, float):
        if value != value or value in (float('inf'), float('-inf')):
            raise ValueError(f'NaN・無限大は同期できない: {value!r}')
        return repr(value)  # 往復で値が変わらない最短表現（1e-05 のような指数表記を含む）
    if isinstance(value, str):
        if '\x00' in value:
            raise ValueError('NUL を含む文字列は同期できない')
        return "'" + value.replace("'", "''") + "'"
    raise TypeError(f'literal にできない値: {value!r}')


def insert_statements(table: str, names: list[str], rows: Iterator[tuple]) -> Iterator[str]:
    """1文が MAX_STATEMENT_BYTES か MAX_ROWS_PER_STATEMENT に達するごとに区切る。"""
    head = f'insert or replace into "{table}" ({", ".join(chr(34) + n + chr(34) for n in names)}) values '
    parts: list[str] = []
    size = len(head.encode())
    for row in rows:
        values = '(' + ','.join(literal(v) for v in row) + ')'
        width = len(values.encode()) + 1  # D1 の上限は UTF-8 のバイト数
        if len(head.encode()) + width > MAX_STATEMENT_BYTES:  # 位置に関係なく、1行だけで上限を超える行は止める
            raise ValueError(f'1行だけで1文の上限 {MAX_STATEMENT_BYTES} バイトを超える: {values[:80]}...')
        if parts and (size + width > MAX_STATEMENT_BYTES or len(parts) >= MAX_ROWS_PER_STATEMENT):
            yield head + ','.join(parts)
            parts, size = [], len(head.encode())
        parts.append(values)
        size += width
    if parts:
        yield head + ','.join(parts)


def pack(statements: Iterator[str]) -> Iterator[list[dict]]:
    batch: list[dict] = []
    size = 0
    for sql in statements:
        width = len(sql.encode())
        if batch and size + width > MAX_BATCH_BYTES:
            yield batch
            batch, size = [], 0
        batch.append({'sql': sql})
        size += width
    if batch:
        yield batch


def new_name(table: str) -> str:
    return f'{table}__new'


def old_name(table: str) -> str:
    return f'{table}__old'


def cleanup_statements() -> list[dict]:
    """前回の失敗の残骸を捨てる。本名の表には触らない。"""
    return [{'sql': f'drop table if exists "{suffix(name)}"'} for name in TABLE_ORDER for suffix in (new_name, old_name)]


def swap_statements(tables: dict[str, Table]) -> list[dict]:
    """照合済みの新表を本名にする。旧表を drop してから rename し、その後に index を作る（index 名の衝突を避ける）。"""
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


def d1_value(value: Any) -> Any:
    """D1 に入れた形（boolean は 0/1）にそろえる。"""
    return int(value) if isinstance(value, bool) else value


def bucket_chars(con: duckdb.DuckDBPyConnection, table: str, key: str) -> dict[str, int]:
    """主キーの先頭1文字ごとの行数。"""
    return dict(con.execute(f'select substr("{key}", 1, 1), count(*) from main."{table}" group by 1 order by 1').fetchall())


def bucket_rows(con: duckdb.DuckDBPyConnection, table: str, names: list[str], key: str, char: str) -> list[list]:
    cols = ', '.join(f'"{n}"' for n in names)
    return [[d1_value(v) for v in row] for row in con.execute(
        f'select {cols} from main."{table}" where substr("{key}", 1, 1) = {literal(char)} order by "{key}"').fetchall()]


def compare_rows(names: list[str], key: str, got: list[list], want: list[list], limit: int = 5) -> list[str]:
    """主キーで突き合わせ、全列を比べる。違い・欠け・余りを最初の数件だけ返す。"""
    k = names.index(key)
    got_by = {row[k]: row for row in got}
    want_by = {row[k]: row for row in want}
    problems = []
    if len(got_by) != len(got):
        problems.append('D1 に主キーの重複')
    for pk in sorted(want_by.keys() | got_by.keys()):
        g, w = got_by.get(pk), want_by.get(pk)
        if g is None:
            problems.append(f'{pk}: D1 に無い')
        elif w is None:
            problems.append(f'{pk}: warehouse に無い余分な行')
        else:
            problems += [f'{pk}.{n}: D1 {a!r} != warehouse {b!r}' for n, a, b in zip(names, g, w) if a != b]
        if len(problems) >= limit:
            break
    return problems[:limit]


# D1

def kill_group(process: subprocess.Popen) -> None:
    """応答と同時にプロセスが終わっていると killpg が拒まれる（macOS の実測）。終わっているなら何もしない。"""
    try:
        os.killpg(process.pid, signal.SIGKILL)
    except (ProcessLookupError, PermissionError):
        pass


def run_until_json(command: list[str], timeout: float = 300) -> tuple[int | None, str, str]:
    """標準出力が JSON として閉じたら終了とみなす。

    `cf d1 raw --local` は応答を出したあともローカルの runtime が残り、数分プロセスが終わらない（cf 1.0.0-beta.6 の実測）。
    応答は書き込みの完了後に出るので、JSON が閉じた時点で止めてよい。
    """
    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
    errors: list[bytes] = []
    watchdog = threading.Timer(timeout, lambda: kill_group(process))
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
            kill_group(process)
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

    def batch(self, statements: list[dict], retries: int = 3) -> list[dict]:
        self.calls += 1
        with tempfile.NamedTemporaryFile('w', suffix='.json', encoding='utf-8') as file:
            json.dump(statements, file, ensure_ascii=False)
            file.flush()
            for attempt in range(retries):
                code, stdout, stderr = run_until_json([*self.command, '--batch', f'@{file.name}'])
                if code in (0, None):
                    break
                print(f'  cf 失敗 {attempt + 1} 回目: {stdout[-200:]}{stderr[-200:]}'.replace(chr(10), ' '), flush=True)
                if attempt == retries - 1:
                    raise RuntimeError(f'cf d1 raw が失敗した: {stdout[:2000]}{stderr[:2000]}')
                time.sleep(5)
        results = json.loads(stdout)
        if len(results) != len(statements) or not all(r.get('success') for r in results):
            raise RuntimeError(f'cf d1 raw の結果が不正: {stdout[:2000]}')
        return results


def verify(d1: D1, con: duckdb.DuckDBPyConnection, tables: dict[str, Table]) -> list[str]:
    """`__new` の全行を主キーの先頭1文字ごとに読み戻し、warehouse の同じ行と全列で突き合わせる。

    1回の cf 呼び出しは READ_ROWS_PER_CALL 行ほどにまとめる。メモリにあるのはその分だけ。
    """
    problems = []
    for name in TABLE_ORDER:
        spec = tables[name]
        names = [c['name'] for c in spec['columns']]
        key = spec['primary_key']
        buckets = bucket_chars(con, name, key)
        cols = ', '.join(f'"{n}"' for n in names)
        total = d1.batch([{'sql': f'select count(*) from "{new_name(name)}"'}])[0]['results']['rows'][0][0]
        if total != sum(buckets.values()):
            problems.append(f'{name}: 行数 D1 {total} != warehouse {sum(buckets.values())}')
        groups: list[list[str]] = [[]]
        rows = 0
        for char, count in buckets.items():
            if groups[-1] and rows + count > READ_ROWS_PER_CALL:
                groups.append([])
                rows = 0
            groups[-1].append(char)
            rows += count
        for group in groups:
            results = d1.batch([{'sql': f'select {cols} from "{new_name(name)}" where substr("{key}", 1, 1) = {literal(c)} order by "{key}"'}
                                for c in group])
            for char, result in zip(group, results):
                got = result['results']['rows']
                problems += [f'{name}: {p}' for p in compare_rows(names, key, got, bucket_rows(con, name, names, key, char))]
        log_rows = sum(buckets.values())
        print(f'  読み戻し {name}: {log_rows} 行 / {len(groups)} 回', flush=True)
    return problems


def rss_mb() -> float:
    return resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024 / 1024  # macOS は bytes


def sync(d1: D1 | None, warehouse: Path, dry_run: bool, log: Callable[[str], None] = lambda m: print(m, flush=True)) -> int:
    tables = contract.load()
    con = open_warehouse(warehouse)
    try:
        if contract.build(contract.warehouse_columns(warehouse, con)) != {'tables': tables}:
            raise SystemExit('columns.json が warehouse と食い違う。serving:columns で書き直す')
        started = time.time()
        if d1 and not dry_run:
            d1.batch(cleanup_statements())
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
                size += sum(len(s['sql'].encode()) for s in batch)
                if d1 and not dry_run:
                    d1.batch(batch)
            log(f'{name}: {con.execute(f'select count(*) from main."{name}"').fetchone()[0]} 行 / {calls} 回 / {size / 1e6:.1f}MB / RSS最大 {rss_mb():.0f}MB')
        if dry_run:
            log('dry-run: D1 には書いていない')
            return 0
        problems = verify(d1, con, tables)
        if problems:
            for p in problems:
                log(f'照合に失敗: {p}')
            log('rename せず中止（__new は残る）')
            return 1
        d1.batch(swap_statements(tables), retries=1)  # 入れ替えは再送しない
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
