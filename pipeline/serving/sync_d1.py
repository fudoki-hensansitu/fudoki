"""warehouse の提供用データ（marts）の表を、同名・同列のまま D1 に写す（ADR 0022・ADR 0040）。

    bun run --cwd pipeline serving:sync -- --database-id <uuid> [--dry-run] [--full]
    bun run --cwd pipeline serving:sync -- --local [--persist-to <dir>] [--dry-run] [--full]
    ... --jurisdiction 131202 [--jurisdiction ...]   # その自治体の行だけを差分で書く（他の自治体の行には触れない）
    ... --table source_page_text [--table ...]       # その表だけを同期する（ほかの表には触れない）

既定は差分の同期（ADR 0040）。D1 の書き込みは行数で課金されるので、変わった行だけを書く。
1. 開始時に、前回の失敗の残骸 `<表>__new`・`<表>__old` を無条件に drop する（本名の表には触らない）。
2. 表ごとに D1 の列・index を columns.json と比べる。表が無い・列か index が違う表は作り直す（3 の手順）。
   残りの表は、主キーの範囲（warehouse の主キー順に RANGE_ROWS 行ずつ）ごとに D1 の行を読み、warehouse の同じ範囲と
   主キーで突き合わせて全列を比べ、消す行と書く行を決める。変わる行が表の REBUILD_RATIO を超えれば作り直す（そのほうが書き込みが少ない）。
3. 作り直す表は `<表>__new` を create して全件投入し、全範囲を読み戻して warehouse と全列で突き合わせる（`verify`）。
   1つでも違えば最初の数件の主キーと列名を出して止める。この時点では本名の表に何も書いていない。
4. 差分の表に、消す行の delete と、書く行の `insert or replace` を流す。変わった範囲を読み戻して突き合わせ、行数も比べる。
5. 作り直した表を、1つの batch で `drop table if exists <表>; alter table <表>__new rename to <表>;` と index の作成で入れ替える。
`--snapshot <file>` は、前回の同期が成功したときに D1 へ入れた表の写し（DuckDB の file）と warehouse を手元で比べて差分を決め、
D1 を全行は読まない（2 の差分を写しで決める）。写しは同期が成功するたびに書き直す。写しが D1 の今の中身と同じであることは、
D1 の `sync_state` に置く印（token）で確かめる。同期は書き始める前に印を消し、成功したら新しい印を D1 と写しの両方に置く。
印が無い・合わない（途中で落ちた同期、写しを持たない同期の後、cache が消えたなど）表は、今までどおり D1 を読んで比べる。
`--verify-all` は写しがあっても D1 を全行読んで比べる（定期実行で、写しと D1 のずれを直す）。
差分の表の読み戻しは、書いた主キーと消した主キーだけを読み、行数は表全体で比べる。
`--full` は全表を作り直す。`--dry-run` は書かずに、書く予定の行数を出す（D1 を指定すれば D1 を読んで差分を数える）。
`--jurisdiction` は、表ごとにその自治体の行だけを D1 と warehouse の両方から選んで突き合わせ、差を書く。他の自治体の行は読むだけで
消さないので、その自治体だけを build した warehouse から本番へ流せる。自治体コードを持たない表は親の表の自治体で絞る（`PARENT_SCOPE`）。
列・index が違う表があれば止める（作り直しは全自治体の行が要る）。

可用性は担保しない。D1 は warehouse から作り直せる写しで、失敗した同期の途中や後では、API がエラーを返したり
表の世代が混ざったりし得る（Cloudflare の公式文書は REST の query/raw に複数文を渡したときの原子性を保証していない）。
そのときはもう一度同期を流す。差分は D1 の今の中身と比べて決めるので、途中で止まった同期の続きも次の同期で埋まる。
復旧処理は持たない。入れ替えの batch は再送しない（成功したのに応答だけ失った場合に、再送が失敗して表が欠けた状態を固定しないため）。

前提:
- 書き込むのはこの script だけで、同時に2つ以上実行しない（`__new` が衝突する）。
- 表の列・型・index は `apps/api/src/columns.json`（serving:columns）が正。warehouse と食い違えば止まる。
- D1 の上限（1文の SQL 100KB）を守るため、行は表ごとに流し、全行を一度にメモリへ載せない。
  値は SQL の literal に埋め込む（D1 の REST は params に NULL を渡せない）。boolean は 0/1。
- 主キーの範囲は DuckDB と SQLite で同じ式（`>=`・`<` の文字列比較）で切る。主キーは sha の hex なので両者の順序は一致する。
  一致しない文字があっても、ある範囲で消して別の範囲で書くだけになるよう、全範囲の delete を先に流してから書く。
- `cf d1 raw --local` は「Network connection lost」で散発的に失敗する（cf 1.0.0-beta の実測）ので3回まで再試行する。
  応答が失われただけで書き込みは済んでいた場合に備え、投入は `insert or replace`（流し直しても同じ結果）にし、最後の照合で重複や欠落を止める。
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
import uuid
from pathlib import Path
from typing import Any, Callable, Iterator, Sequence

import duckdb

from serving import columns as contract

LOCAL_PERSIST_TO = contract.PIPELINE.parent / 'apps/api/.cloudflare/state'
LOCAL_DATABASE_ID = 'b9b6f209-083e-45b3-a896-1014a17a15f9'

# D1 の1文 100KB の内側。1回の cf 呼び出しの大きさ
MAX_STATEMENT_BYTES = 60_000
MAX_ROWS_PER_STATEMENT = 100
MAX_BATCH_BYTES = 1_000_000
FETCH_ROWS = 500
MEMORY_LIMIT = '1GB'
READ_ROWS_PER_CALL = 4000
# 突き合わせの1範囲の行数。1回の cf 呼び出しで READ_ROWS_PER_CALL // RANGE_ROWS 範囲を読む
RANGE_ROWS = 1000
# 1行が大きい表の、1回の cf 呼び出しで読み戻す行数（1範囲もこの行数にする）。頁の文字は1行が最大約 36KB
READ_ROWS_BY_TABLE = {'source_page_text': 200}
# 変わる行が表のこの割合を超えたら、差分ではなく作り直す（既存の行の置き換えは delete と insert の2回分書く）
REBUILD_RATIO = 0.5
# delete の1文に入れる主キーの数
DELETE_KEYS_PER_STATEMENT = 500

# 写しが D1 と同じかを確かめる印を置く表（D1 の中だけに置き、columns.json の表ではない）
SYNC_STATE = 'sync_state'
SNAPSHOT_KEY = 'snapshot'
# 写しを attach する名前
SNAPSHOT_CATALOG = 'snap'
SNAPSHOT_META = '_snapshot'

# 参照される表（自治体マスタ・根・出典）を先に、参照する表を後に
TABLE_ORDER = ['jurisdiction',
               'expenditure', 'expenditure_origin', 'expenditure_origin_link', 'expenditure_subject', 'expenditure_detail',
               'expenditure_location',
               'evaluation', 'evaluation_origin', 'evaluation_sheet', 'evaluation_indicator', 'evaluation_indicator_value',
               'budget_proposal', 'budget_proposal_origin', 'budget_measure', 'project', 'project_year',
               'evaluation_sheet_project', 'source_page_text']
# 集約ごとの作り直し（docs/prd/aggregate-api/dd.md）より前の表。新しい Worker の deploy を確かめてから --drop-legacy で消す
LEGACY_TABLES = ['fiscal_origin', 'fiscal_expenditure_subject', 'fiscal_expenditure_detail', 'fiscal_expenditure_location',
                 'fiscal_coverage', 'project_origin', 'project_evaluation_sheet', 'project_evaluation_indicator',
                 'project_evaluation_indicator_value', 'project_evaluation_result', 'project_budget_initiative',
                 'jurisdiction_master', 'origin', 'settlement_expenditure_node', 'initial_expenditure_node',
                 'expenditure_coverage', 'jurisdiction_population',
                 # 人口は web の D1 へ移した（ADR 0042）
                 'population_origin', 'population']

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
    for name in [n for n in TABLE_ORDER if n in tables]:
        out.append(f'drop table if exists "{name}"')
        out.append(f'alter table "{new_name(name)}" rename to "{name}"')
        out += contract.create_index_sql(name, tables[name])
    return [{'sql': sql} for sql in out]


# warehouse

def open_warehouse(path: Path) -> duckdb.DuckDBPyConnection:
    return duckdb.connect(str(path), read_only=True, config={'memory_limit': MEMORY_LIMIT, 'threads': 2})


# 自治体コードの列を持たない表を、どの列でどの親の表の自治体に絞るか。親の表はその列を主キーか自治体で絞れる列に持つ
PARENT_SCOPE = {
    'expenditure_origin_link': ('origin_id', 'expenditure_origin'),
    'expenditure_location': ('origin_id', 'expenditure_origin'),
    'evaluation_indicator': ('sheet_id', 'evaluation_sheet'),
    'evaluation_indicator_value': ('indicator_id', 'evaluation_indicator'),
}


def scope_condition(table: str, names: list[str], jurisdictions: Sequence[str], prefix: str = '') -> str:
    """その自治体の行を選ぶ条件。DuckDB と SQLite のどちらでも同じ行を選ぶ（親の表は同じ側の表を読む）。
    prefix は親の表の前に付ける名前（DuckDB で写しや別の DB の表を読むとき。例: `snap.main.`）。"""
    if table in PARENT_SCOPE:
        column, parent = PARENT_SCOPE[table]
        return (f'"{column}" in (select "{column}" from {prefix}"{parent}" '
                f'where {scope_condition(parent, ["jurisdiction_code"], jurisdictions, prefix)})')
    if 'jurisdiction_code' not in names:
        raise SystemExit(f'{table}: 自治体で絞る列が無い（PARENT_SCOPE に親の表を足す）')
    return '"jurisdiction_code" in (' + ', '.join(literal(j) for j in jurisdictions) + ')'


def table_rows(con: duckdb.DuckDBPyConnection, table: str, names: list[str], order: str, where: str = '') -> Iterator[tuple]:
    cursor = con.execute(f'select {", ".join(chr(34) + n + chr(34) for n in names)} from main."{table}"{where} order by {order}')
    while chunk := cursor.fetchmany(FETCH_ROWS):
        yield from chunk


def d1_value(value: Any) -> Any:
    """D1 に入れた形（boolean は 0/1）にそろえる。"""
    return int(value) if isinstance(value, bool) else value


def and_where(where: str, condition: str) -> str:
    """` where ...` に条件を足す。where が空なら ` where <条件>`。"""
    return f'{where} and {condition}' if where else f' where {condition}'


def range_rows_of(table: str) -> int:
    return min(RANGE_ROWS, READ_ROWS_BY_TABLE.get(table, RANGE_ROWS))


def key_ranges(con: duckdb.DuckDBPyConnection, table: str, key: str, where: str = '') -> list[tuple[str | None, str | None]]:
    """warehouse の主キー順に、表の範囲の行数（range_rows_of）ずつの範囲 [lo, hi)。両端は開いていて、D1 にだけある行もどれかの範囲に入る。"""
    bounds = [r[0] for r in con.execute(
        f'select "{key}" from (select "{key}", row_number() over (order by "{key}") - 1 as i from main."{table}"{where}) '
        f'where i > 0 and i % {range_rows_of(table)} = 0 order by 1').fetchall()]
    edges: list[str | None] = [None, *bounds, None]
    return list(zip(edges, edges[1:]))


def range_condition(key: str, lo: str | None, hi: str | None) -> str:
    """DuckDB と SQLite のどちらでも同じ範囲を選ぶ式。"""
    parts = ([f'"{key}" >= {literal(lo)}'] if lo is not None else []) + ([f'"{key}" < {literal(hi)}'] if hi is not None else [])
    return ' and '.join(parts) or '1 = 1'


def range_rows(con: duckdb.DuckDBPyConnection, table: str, names: list[str], key: str, lo: str | None, hi: str | None,
               where: str = '') -> list[list]:
    cols = ', '.join(f'"{n}"' for n in names)
    return [[d1_value(v) for v in row] for row in con.execute(
        f'select {cols} from main."{table}"{and_where(where, range_condition(key, lo, hi))} order by "{key}"').fetchall()]


def diff_rows(names: list[str], key: str, got: list[list], want: list[list]) -> tuple[list[str], list[str]]:
    """D1 の行（got）を warehouse の行（want）にするために、消す主キーと書く主キー（新しい行・全列のどれかが違う行）。"""
    k = names.index(key)
    got_by = {row[k]: row for row in got}
    want_by = {row[k]: row for row in want}
    deletes = sorted(got_by.keys() - want_by.keys())
    writes = sorted(pk for pk, row in want_by.items() if got_by.get(pk) != row)
    return deletes, writes


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
        self.local = local
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


def delete_statements(table: str, key: str, keys: Sequence[str]) -> Iterator[str]:
    for i in range(0, len(keys), DELETE_KEYS_PER_STATEMENT):
        chunk = keys[i:i + DELETE_KEYS_PER_STATEMENT]
        yield f'delete from "{table}" where "{key}" in ({", ".join(literal(k) for k in chunk)})'


def schema_statements(names: Sequence[str]) -> list[dict]:
    """表ごとの列と、全 index の名前を読む文。"""
    return ([{'sql': f"select name, type, pk from pragma_table_info({literal(name)})"} for name in names]
            + [{'sql': "select tbl_name, name from sqlite_master where type = 'index' and name not like 'sqlite_%'"}])


def schema_matches(name: str, spec: Table, columns: list[list], indexes: set[str]) -> bool:
    """D1 の表の列（名前・型・主キー）と index が columns.json と同じか。表が無ければ columns は空。"""
    want = [[c['name'], contract.SQL_TYPES[c['type']], 1 if c['name'] == spec['primary_key'] else 0] for c in spec['columns']]
    got = [[n, (t or '').lower(), 1 if pk else 0] for n, t, pk in columns]
    return got == want and indexes == {contract.index_name(name, cols) for cols in spec['indexes']}


def ordered(tables: dict[str, Table]) -> list[str]:
    """同期する表を TABLE_ORDER の順に（--table で絞ったときはその表だけ）。"""
    return [name for name in TABLE_ORDER if name in tables]


def read_schemas(d1: D1, tables: dict[str, Table]) -> dict[str, bool]:
    """表ごとに、D1 の列と index が columns.json と同じか。"""
    results = d1.batch(schema_statements(ordered(tables)))
    indexes: dict[str, set[str]] = {}
    for tbl, idx in results[-1]['results']['rows']:
        indexes.setdefault(tbl, set()).add(idx)
    return {name: schema_matches(name, tables[name], result['results']['rows'], indexes.get(name, set()))
            for name, result in zip(ordered(tables), results)}


class TableDiff:
    """1表の warehouse と D1 の差。書いたあとは deletes・writes の主キーだけを読み戻す。"""

    def __init__(self) -> None:
        self.deletes: list[str] = []
        self.writes: list[str] = []
        self.problems: list[str] = []

    @property
    def changes(self) -> int:
        return len(self.deletes) + len(self.writes)


def diff_table(d1: D1, con: duckdb.DuckDBPyConnection, name: str, spec: Table, d1_table: str, scope: str = '') -> TableDiff:
    """主キーの範囲ごとに D1 の d1_table を読み、warehouse の name と全列で突き合わせる。

    1回の cf 呼び出しは READ_ROWS_PER_CALL 行（1行が大きい表は READ_ROWS_BY_TABLE の行数）ほどにまとめる。メモリにあるのはその分と、差のある主キーだけ。
    scope（自治体の条件）は D1 と warehouse の両方に掛ける。範囲の外の D1 の行は読まず、消す行にも出ない。
    """
    names = [c['name'] for c in spec['columns']]
    key = spec['primary_key']
    cols = ', '.join(f'"{n}"' for n in names)
    where = and_where('', scope) if scope else ''
    d1_scope = f' and {scope}' if scope else ''
    ranges = key_ranges(con, name, key, where)
    per_call = max(1, READ_ROWS_BY_TABLE.get(name, READ_ROWS_PER_CALL) // range_rows_of(name))
    diff = TableDiff()
    for i in range(0, len(ranges), per_call):
        group = ranges[i:i + per_call]
        results = d1.batch([{'sql': f'select {cols} from "{d1_table}" where {range_condition(key, lo, hi)}{d1_scope} order by "{key}"'}
                            for lo, hi in group])
        for (lo, hi), result in zip(group, results):
            got = result['results']['rows']
            want = range_rows(con, name, names, key, lo, hi, where)
            deletes, writes = diff_rows(names, key, got, want)
            if deletes or writes:
                diff.deletes += deletes
                diff.writes += writes
                diff.problems += [f'{name}: {p}' for p in compare_rows(names, key, got, want)]
    return diff


def snapshot_diff(con: duckdb.DuckDBPyConnection, name: str, spec: Table, jurisdictions: Sequence[str] | None = None) -> TableDiff:
    """写し（前回の同期で D1 に入れた行）と warehouse を手元で比べる。D1 は読まない。"""
    names = [c['name'] for c in spec['columns']]
    key = spec['primary_key']
    cols = ', '.join(f'"{n}"' for n in names)
    snapshot = f'{SNAPSHOT_CATALOG}.main.'
    ws = and_where('', scope_condition(name, names, jurisdictions)) if jurisdictions else ''
    ss = and_where('', scope_condition(name, names, jurisdictions, snapshot)) if jurisdictions else ''
    diff = TableDiff()
    diff.deletes = [r[0] for r in con.execute(
        f'select "{key}" from {snapshot}"{name}"{ss} except select "{key}" from main."{name}"{ws} order by 1').fetchall()]
    diff.writes = [r[0] for r in con.execute(
        f'select "{key}" from (select {cols} from main."{name}"{ws} except select {cols} from {snapshot}"{name}"{ss}) order by 1'
    ).fetchall()]
    return diff


def count_rows(d1: D1, table: str, scope: str = '') -> int:
    return d1.batch([{'sql': f'select count(*) from "{table}"{and_where("", scope) if scope else ""}'}])[0]['results']['rows'][0][0]


def warehouse_count(con: duckdb.DuckDBPyConnection, table: str, where: str = '') -> int:
    return con.execute(f'select count(*) from main."{table}"{where}').fetchone()[0]


def verify(d1: D1, con: duckdb.DuckDBPyConnection, name: str, spec: Table, d1_table: str) -> list[str]:
    """作り直した D1 の d1_table を全範囲読み戻し、warehouse と同じか。"""
    problems = []
    total, want = count_rows(d1, d1_table), warehouse_count(con, name)
    if total != want:
        problems.append(f'{name}: 行数 D1 {total} != warehouse {want}')
    problems += diff_table(d1, con, name, spec, d1_table).problems[:5]
    print(f'  読み戻し {name}: 全件', flush=True)
    return problems


def verify_keys(d1: D1, con: duckdb.DuckDBPyConnection, name: str, spec: Table, keys: Sequence[str], scope: str = '') -> list[str]:
    """書いた・消した主キーの行だけを D1 から読み戻して warehouse と比べ、行数は（scope の）全体で比べる。"""
    problems = []
    where = and_where('', scope) if scope else ''
    total, want = count_rows(d1, name, scope), warehouse_count(con, name, where)
    if total != want:
        problems.append(f'{name}: 行数 D1 {total} != warehouse {want}')
    names = [c['name'] for c in spec['columns']]
    key = spec['primary_key']
    cols = ', '.join(f'"{n}"' for n in names)
    d1_scope = f' and {scope}' if scope else ''
    per_call = READ_ROWS_BY_TABLE.get(name, READ_ROWS_PER_CALL)
    per_statement = min(DELETE_KEYS_PER_STATEMENT, per_call)
    chunks = [list(keys[i:i + per_statement]) for i in range(0, len(keys), per_statement)]
    group_size = max(1, per_call // per_statement)
    for i in range(0, len(chunks), group_size):
        group = chunks[i:i + group_size]
        results = d1.batch([{'sql': f'select {cols} from "{name}" where "{key}" in ({", ".join(literal(k) for k in chunk)})'
                                    f'{d1_scope} order by "{key}"'} for chunk in group])
        for chunk, result in zip(group, results):
            want_rows = [[d1_value(v) for v in row] for row in con.execute(
                f'select {cols} from main."{name}"{and_where(where, f"{chr(34)}{key}{chr(34)} in ({", ".join(literal(k) for k in chunk)})")} '
                f'order by "{key}"').fetchall()]
            problems += [f'{name}: {p}' for p in compare_rows(names, key, result['results']['rows'], want_rows)]
    print(f'  読み戻し {name}: {len(keys)} 行', flush=True)
    return problems[:5]


def rows_written(rows: int, spec: Table) -> int:
    """D1 が数える書き込み行数の目安。1行は表と主キーの index と各 index に1回ずつ書く。"""
    return rows * (2 + len(spec['indexes']))


def rss_mb() -> float:
    return resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024 / 1024  # macOS は bytes


# 写し（前回の同期で D1 に入れた表）

def spec_json(spec: Table) -> str:
    return json.dumps(spec, sort_keys=True, ensure_ascii=False)


class Snapshot:
    """写しの file と、それが D1 の今の中身と同じか（D1 の印と写しの印が一致するか）。

    all_tables は columns.json の全表。写しは全表がそろい、表の定義が columns.json と同じときだけ、次の同期の写しの元にできる。
    """

    def __init__(self, path: Path, all_tables: dict[str, Table], verify_all: bool = False):
        self.path = path
        self.all_tables = all_tables
        self.verify_all = verify_all
        self.attached = False
        self.token: str | None = None
        self.specs: dict[str, str] = {}
        self.d1_token: str | None = None
        self.new_token: str | None = None

    def attach(self, con: duckdb.DuckDBPyConnection) -> None:
        if not self.path.is_file():
            return
        try:
            con.execute(f'attach {literal(str(self.path))} as {SNAPSHOT_CATALOG} (read_only)')
            rows = con.execute(f'select table_name, spec, token from {SNAPSHOT_CATALOG}.main.{SNAPSHOT_META}').fetchall()
        except duckdb.Error as error:
            print(f'写しを読めない（D1 を読んで比べる）: {error}', flush=True)
            return
        self.attached = True
        self.specs = {name: spec for name, spec, _ in rows}
        self.token = rows[0][2] if rows else None

    def valid(self) -> bool:
        """写しが D1 の今の中身と同じか。"""
        return self.attached and self.token is not None and self.token == self.d1_token

    def usable(self, name: str, spec: Table) -> bool:
        """この表の差分を写しで決めてよいか。"""
        return not self.verify_all and self.valid() and self.specs.get(name) == spec_json(spec)

    def complete_after(self, synced: Sequence[str], scoped: bool) -> bool:
        """同期が成功したら、全表がそろった写しを作れるか。全表を全自治体で同期すれば warehouse から作れる。
        一部の表・自治体だけの同期は、ほかの行を今の写しから写すので、今の写しが D1 と同じで全表の定義が合っていること。"""
        if not scoped and set(synced) == set(self.all_tables):
            return True
        return self.valid() and all(self.specs.get(n) == spec_json(s) for n, s in self.all_tables.items())

    def save(self, warehouse: Path, synced: Sequence[str], jurisdictions: Sequence[str] | None) -> None:
        """同期が成功した後の D1 の中身の写しを書く（今の写しを読むので、別の file に書いてから置き換える）。"""
        assert self.new_token
        self.path.parent.mkdir(parents=True, exist_ok=True)
        new = self.path.with_name(self.path.name + '.new')
        new.unlink(missing_ok=True)
        con = duckdb.connect(str(new), config={'memory_limit': MEMORY_LIMIT, 'threads': 2})
        try:
            con.execute(f'attach {literal(str(warehouse))} as w (read_only)')
            if self.path.is_file():
                con.execute(f'attach {literal(str(self.path))} as s (read_only)')
            for name in TABLE_ORDER:
                if name not in self.all_tables:
                    continue
                names = [c['name'] for c in self.all_tables[name]['columns']]
                cols = ', '.join(f'"{n}"' for n in names)
                if name in synced and not jurisdictions:
                    query = f'select {cols} from w.main."{name}"'
                elif name in synced:
                    # 範囲の外の行を写しから残す。主キーが範囲をまたいだ行（同じ PDF の頁が別の自治体に付き直したなど）は、
                    # D1 では範囲の中の行で置き換わっているので、写しからも主キーで除く
                    key = self.all_tables[name]['primary_key']
                    inside = scope_condition(name, names, jurisdictions, 'w.main.')
                    query = (f'select {cols} from s.main."{name}" '
                             f'where not coalesce({scope_condition(name, names, jurisdictions, "s.main.")}, false) '
                             f'and "{key}" not in (select "{key}" from w.main."{name}" where {inside}) '
                             f'union all select {cols} from w.main."{name}" where {inside}')
                else:
                    query = f'select {cols} from s.main."{name}"'
                con.execute(f'create table main."{name}" as {query}')
            con.execute(f'create table main.{SNAPSHOT_META} (table_name varchar, spec varchar, token varchar)')
            con.executemany(f'insert into main.{SNAPSHOT_META} values (?, ?, ?)',
                            [(name, spec_json(spec), self.new_token) for name, spec in self.all_tables.items()])
        finally:
            con.close()
        os.replace(new, self.path)


def begin(d1: D1, snapshot: Snapshot | None) -> None:
    """前回の失敗の残骸を捨て、写しの印を読んでから消す（この同期が終わるまで、D1 は写しと同じとは言えない）。"""
    statements = cleanup_statements() + [
        {'sql': f'create table if not exists "{SYNC_STATE}" ("key" text primary key, "value" text not null)'},
        {'sql': f'select "value" from "{SYNC_STATE}" where "key" = {literal(SNAPSHOT_KEY)}'},
        {'sql': f'delete from "{SYNC_STATE}" where "key" = {literal(SNAPSHOT_KEY)}'},
    ]
    rows = d1.batch(statements)[-2]['results']['rows']
    if snapshot:
        snapshot.d1_token = rows[0][0] if rows else None
        if snapshot.attached and not snapshot.valid():
            print('写しの印が D1 と合わない（D1 を読んで比べる）', flush=True)


def finish(d1: D1, snapshot: Snapshot | None, synced: Sequence[str], scoped: bool) -> None:
    """成功した同期の印を D1 に置く。写しはこの後に同じ印で書く（書けなければ印が合わず、次の同期は D1 を読む）。"""
    if snapshot and snapshot.complete_after(synced, scoped):
        snapshot.new_token = uuid.uuid4().hex
        d1.batch([{'sql': f'insert or replace into "{SYNC_STATE}" ("key", "value") '
                          f'values ({literal(SNAPSHOT_KEY)}, {literal(snapshot.new_token)})'}])


def sync(d1: D1 | None, warehouse: Path, dry_run: bool, jurisdictions: Sequence[str] | None = None, full: bool = False,
         log: Callable[[str], None] = lambda m: print(m, flush=True), only: Sequence[str] | None = None,
         snapshot_path: Path | None = None, verify_all: bool = False) -> int:
    tables = contract.load()
    con = open_warehouse(warehouse)
    snapshot = Snapshot(snapshot_path, tables, verify_all) if snapshot_path and d1 and not dry_run else None
    try:
        if contract.build(contract.warehouse_columns(warehouse, con)) != {'tables': tables}:
            raise SystemExit('columns.json が warehouse と食い違う。serving:columns で書き直す')
        if only:
            unknown = sorted(set(only) - tables.keys())
            if unknown:
                raise SystemExit(f'columns.json に無い表: {", ".join(unknown)}')
            tables = {name: spec for name, spec in tables.items() if name in only}
        if snapshot:
            snapshot.attach(con)
        code = run(d1, con, tables, dry_run, jurisdictions, full, log, snapshot)
    finally:
        con.close()
    if code == 0 and snapshot and snapshot.new_token:
        started = time.time()
        snapshot.save(warehouse, list(tables), jurisdictions)
        log(f'写しを書いた: {snapshot.path}（{time.time() - started:.0f} 秒）')
    return code


def run(d1: D1 | None, con: duckdb.DuckDBPyConnection, tables: dict[str, Table], dry_run: bool,
        jurisdictions: Sequence[str] | None, full: bool, log: Callable[[str], None], snapshot: Snapshot | None = None) -> int:
    if jurisdictions:
        if full:
            raise SystemExit('--jurisdiction と --full は一緒に使えない（作り直しは全自治体の行が要る）')
        return run_scoped(d1, con, tables, dry_run, jurisdictions, log, snapshot)
    started = time.time()
    if d1 and not dry_run:
        begin(d1, snapshot)

    # 1. 作り直す表と、差分で書く表を決める（D1 を読むか、写しと比べる）
    matches = read_schemas(d1, tables) if d1 and not full else {name: False for name in ordered(tables)}
    rebuild: list[str] = []
    diffs: dict[str, TableDiff] = {}
    for name in ordered(tables):
        spec = tables[name]
        rows = warehouse_count(con, name)
        if not matches[name]:
            rebuild.append(name)
            reason = '--full' if full else 'D1 に無いか列・index が違う' if d1 else 'D1 を指定していない'
            log(f'{name}: 作り直す（{reason}）{rows} 行 / 書き込み約 {rows_written(rows, spec):,} 行')
            continue
        from_snapshot = bool(snapshot and snapshot.usable(name, spec))
        diff = snapshot_diff(con, name, spec) if from_snapshot else diff_table(d1, con, name, spec, name)
        if diff.changes > REBUILD_RATIO * max(rows, 1):
            rebuild.append(name)
            log(f'{name}: 変わる行 {diff.changes} が多いので作り直す {rows} 行 / 書き込み約 {rows_written(rows, spec):,} 行')
            continue
        diffs[name] = diff
        cost = rows_written(len(diff.deletes), spec) + 2 * rows_written(len(diff.writes), spec)
        log(f'{name}: 消す {len(diff.deletes)} 行・書く {len(diff.writes)} 行 / 書き込み約 {cost:,} 行（{rows} 行中）'
            f'{"・写しと比べた" if from_snapshot else ""}')
    if dry_run or not d1:
        log('dry-run: D1 には書いていない')
        return 0

    # 2. 作り直す表を __new に入れて照合する。ここまで本名の表には書いていない
    for name in rebuild:
        spec = tables[name]
        names = [c['name'] for c in spec['columns']]

        def statements(name=name, spec=spec, names=names) -> Iterator[str]:
            yield f'drop table if exists "{new_name(name)}"'
            yield contract.create_table_sql(name, spec, new_name(name))
            yield from insert_statements(new_name(name), names, table_rows(con, name, names, spec['primary_key']))

        calls = 0
        for batch in pack(statements()):
            calls += 1
            d1.batch(batch)
        log(f'{name}: __new に投入 / {calls} 回 / RSS最大 {rss_mb():.0f}MB')
    problems = [p for name in rebuild for p in verify(d1, con, name, tables[name], new_name(name))]
    if problems:
        for p in problems:
            log(f'照合に失敗: {p}')
        log('本名の表に書かずに中止（__new は残る）')
        return 1

    # 3. 差分の表に書く
    problems += write_diffs(d1, con, tables, diffs)
    if problems:
        for p in problems:
            log(f'照合に失敗: {p}')
        log('作り直す表を入れ替えずに中止。もう一度同期を流す')
        return 1

    # 4. 作り直した表を入れ替える。リモートの入れ替えは再送しない。ローカルの miniflare は batch が1つのトランザクションで、
    # 失敗は応答を失う散発エラー（起動時）なので再送する
    if rebuild:
        d1.batch(swap_statements({name: tables[name] for name in rebuild}), retries=3 if d1.local else 1)
    finish(d1, snapshot, ordered(tables), scoped=False)
    log(f'完了: 作り直し {len(rebuild)} 表・差分 {sum(1 for d in diffs.values() if d.changes)} 表 / cf {d1.calls} 回 / '
        f'{time.time() - started:.0f} 秒 / RSS最大 {rss_mb():.0f}MB')
    return 0


def write_diffs(d1: D1, con: duckdb.DuckDBPyConnection, tables: dict[str, Table], diffs: dict[str, TableDiff],
                scopes: dict[str, str] | None = None) -> list[str]:
    """差分の表に書いて、書いた・消した主キーを読み戻す。

    消す行は参照する表から（TABLE_ORDER の逆順）、書く行は参照される表から流す。途中で止まっても、親より先に
    子が消えるので、親の消えた子の行（自治体で絞った同期では親の自治体で選ぶので、次の差分に出ない）が残らない。
    """
    problems: list[str] = []
    changed = [name for name in TABLE_ORDER if name in diffs and diffs[name].changes]
    for name in reversed(changed):
        key = tables[name]['primary_key']
        for batch in pack(delete_statements(name, key, diffs[name].deletes)):
            d1.batch(batch)
    for name in changed:
        diff = diffs[name]
        spec = tables[name]
        names = [c['name'] for c in spec['columns']]
        key = spec['primary_key']
        scope = (scopes or {}).get(name, '')
        writes = set(diff.writes)
        rows = (row for row in table_rows(con, name, names, key, and_where('', scope) if scope else '')
                if row[names.index(key)] in writes)
        for batch in pack(insert_statements(name, names, rows)):
            d1.batch(batch)
    for name in changed:
        problems += verify_keys(d1, con, name, tables[name], sorted(diffs[name].writes + diffs[name].deletes),
                                (scopes or {}).get(name, ''))
    return problems


def run_scoped(d1: D1 | None, con: duckdb.DuckDBPyConnection, tables: dict[str, Table], dry_run: bool,
               jurisdictions: Sequence[str], log: Callable[[str], None], snapshot: Snapshot | None = None) -> int:
    """その自治体の行だけを差分で書く。表を作り直さず、他の自治体の行を消さない。"""
    log(f'自治体を絞って同期する: {", ".join(jurisdictions)}（その自治体の行だけを書き、他の自治体の行には触れない）')
    started = time.time()
    scopes = {name: scope_condition(name, [c['name'] for c in tables[name]['columns']], jurisdictions) for name in ordered(tables)}
    if not d1:
        for name in ordered(tables):
            log(f'{name}: {warehouse_count(con, name, and_where("", scopes[name]))} 行')
        log('dry-run: D1 には書いていない')
        return 0
    if not dry_run:
        begin(d1, snapshot)
    matches = read_schemas(d1, tables)
    existing = {r[0] for r in d1.batch([{'sql': "select name from sqlite_master where type = 'table'"}])[0]['results']['rows']}
    skipped = []
    for name in [n for n in ordered(tables) if not matches[n]]:
        # 列・index が違っても（表が無くても）、その自治体の行がどちらにも無い表は触らずに済む。
        # 親で絞る表は親の表も D1 に要る
        parent = PARENT_SCOPE.get(name, (None, None))[1]
        in_d1 = name in existing and (parent is None or parent in existing) and count_rows(d1, name, scopes[name])
        if warehouse_count(con, name, and_where('', scopes[name])) or in_d1:
            log(f'{name}: D1 の列・index が違い、その自治体の行がある。自治体を絞った同期では作り直さない。--jurisdiction なしで流す')
            return 1
        skipped.append(name)
        log(f'{name}: D1 の列・index が違うが、その自治体の行がどちらにも無いので触らない')
    diffs: dict[str, TableDiff] = {}
    for name in [n for n in ordered(tables) if n not in skipped]:
        spec = tables[name]
        from_snapshot = bool(snapshot and snapshot.usable(name, spec))
        diff = diffs[name] = (snapshot_diff(con, name, spec, jurisdictions) if from_snapshot
                              else diff_table(d1, con, name, spec, name, scopes[name]))
        rows = warehouse_count(con, name, and_where('', scopes[name]))
        cost = rows_written(len(diff.deletes), spec) + 2 * rows_written(len(diff.writes), spec)
        log(f'{name}: 消す {len(diff.deletes)} 行・書く {len(diff.writes)} 行 / 書き込み約 {cost:,} 行（その自治体の {rows} 行中）'
            f'{"・写しと比べた" if from_snapshot else ""}')
    if dry_run:
        log('dry-run: D1 には書いていない')
        return 0
    if problems := write_diffs(d1, con, tables, diffs, scopes):
        for p in problems:
            log(f'照合に失敗: {p}')
        log('中止。もう一度同期を流す')
        return 1
    finish(d1, snapshot, ordered(tables), scoped=True)
    log(f'完了: 差分 {sum(1 for d in diffs.values() if d.changes)} 表 / cf {d1.calls} 回 / {time.time() - started:.0f} 秒')
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('--database-id', help='D1 の database id（--local なら省略可）')
    parser.add_argument('--local', action='store_true', help='ローカルの D1（miniflare）に書く。リモートには触れない')
    parser.add_argument('--persist-to', type=Path, default=LOCAL_PERSIST_TO, help='--local の状態の置き場')
    parser.add_argument('--warehouse', type=Path, default=contract.WAREHOUSE)
    parser.add_argument('--jurisdiction', action='append', metavar='自治体コード',
                        help='その自治体の行だけを差分で書く（複数指定可）。他の自治体の行には触れない。省略は全件')
    parser.add_argument('--dry-run', action='store_true', help='書かずに、書く予定の行数を出す（D1 を指定すれば D1 を読んで差分を数える）')
    parser.add_argument('--full', action='store_true', help='差分ではなく全表を作り直す')
    parser.add_argument('--snapshot', type=Path, metavar='file',
                        help='前回の同期の写し（DuckDB）。印が D1 と合えば、写しと比べて差分を決め D1 を全行は読まない。成功したら書き直す')
    parser.add_argument('--verify-all', action='store_true', help='写しがあっても D1 を全行読んで比べる（写しは書き直す）')
    parser.add_argument('--table', action='append', metavar='表',
                        help='その表だけを同期する（複数指定可）。ほかの表には触れない。省略は全表')
    parser.add_argument('--drop-legacy', action='store_true',
                        help='同期せず、作り直し前の表（LEGACY_TABLES）を drop する。新しい Worker の deploy を確かめてから流す')
    args = parser.parse_args()
    database_id = args.database_id or (LOCAL_DATABASE_ID if args.local else None)
    if not database_id and not args.dry_run:
        parser.error('--database-id か --local が要る')
    d1 = D1(database_id, args.local, args.persist_to) if database_id else None
    if args.drop_legacy:
        statements = [{'sql': f'drop table if exists "{name}"'} for name in LEGACY_TABLES]
        if d1 and not args.dry_run:
            d1.batch(statements)
        print('\n'.join(s['sql'] for s in statements) + ('\ndry-run: D1 には書いていない' if args.dry_run or not d1 else ''))
        return 0
    return sync(d1, args.warehouse, args.dry_run, args.jurisdiction, args.full, only=args.table,
                snapshot_path=args.snapshot, verify_all=args.verify_all)


if __name__ == '__main__':
    sys.exit(main())
