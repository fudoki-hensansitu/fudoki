"""D1 に写す表の契約と、API が読む `apps/api/src/columns.json` の生成器（ADR 0022）。

D1 の表は marts の表を同名・同列・同順で写したもの。列・順序・型は warehouse の information_schema から、
説明は marts の `_models.yml` から引く。warehouse は read_only で開く（構築は dbt:build）。

    bun run --cwd pipeline serving:columns           # columns.json を書き直す
    bun run --cwd pipeline serving:columns -- --check  # 最新かだけ検査する
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import yaml

PIPELINE = Path(__file__).resolve().parents[1]
MODELS = PIPELINE / 'dbt/models/marts/fiscal/_models.yml'
WAREHOUSE = PIPELINE / '.build/warehouse.duckdb'
OUTPUT = PIPELINE.parent / 'apps/api/src/columns.json'

# marts の表 → 資料区分（木の表）。origin は資料区分を持たない
TABLES = {
    'settlement_expenditure_node': 'settlement',
    'initial_expenditure_node': 'initial',
    'origin': None,
}
# 木の表の index（ADR 0022 の v3 改訂）。主キーは node_id、origin は origin_id
NODE_INDEXES = [
    ['fiscal_year', 'jurisdiction_code', 'node_kind'],
    ['fiscal_year', 'cofog_code'],
    ['parent_node_id'],
]
PRIMARY_KEYS = {'origin': 'origin_id'}
DEFAULT_PRIMARY_KEY = 'node_id'

TYPES = {'VARCHAR': 'string', 'INTEGER': 'integer', 'BIGINT': 'integer', 'BOOLEAN': 'boolean'}
SQL_TYPES = {'string': 'text', 'integer': 'integer', 'boolean': 'integer'}


def warehouse_columns(path: Path = WAREHOUSE, con=None) -> dict[str, list[tuple[str, str]]]:
    import duckdb

    own = con is None
    con = con or duckdb.connect(str(path), read_only=True)
    try:
        out = {}
        for table in TABLES:
            rows = con.execute(
                'select column_name, data_type from information_schema.columns '
                "where table_schema = 'main' and table_name = ? order by ordinal_position", [table]).fetchall()
            if not rows:
                raise SystemExit(f'{path} に {table} が無い')
            out[table] = [(name, TYPES[type_]) for name, type_ in rows]
        return out
    finally:
        if own:
            con.close()


def model_descriptions() -> dict[str, dict[str, str | None]]:
    models = yaml.safe_load(MODELS.read_text(encoding='utf-8'))['models']
    return {m['name']: {c['name']: c.get('description') for c in m.get('columns', [])} for m in models}


def build(columns: dict[str, list[tuple[str, str]]] | None = None) -> dict:
    columns = columns or warehouse_columns()
    descriptions = model_descriptions()
    tables = {}
    for table, document_kind in TABLES.items():
        spec: dict = {}
        if document_kind:
            spec['document_kind'] = document_kind
        spec['primary_key'] = PRIMARY_KEYS.get(table, DEFAULT_PRIMARY_KEY)
        spec['indexes'] = NODE_INDEXES if document_kind else []
        spec['columns'] = [{'name': name, 'type': type_, 'description': descriptions[table].get(name)}
                           for name, type_ in columns[table]]
        tables[table] = spec
    return {'tables': tables}


def render(columns: dict[str, list[tuple[str, str]]] | None = None) -> str:
    return json.dumps(build(columns), ensure_ascii=False, indent=2) + '\n'


def load(path: Path = OUTPUT) -> dict:
    return json.loads(path.read_text(encoding='utf-8'))['tables']


def create_table_sql(name: str, spec: dict, table_name: str | None = None) -> str:
    """列は NOT NULL を付けない（marts の検査が正で、D1 は写すだけ）。"""
    lines = []
    for column in spec['columns']:
        pk = ' primary key' if column['name'] == spec['primary_key'] else ''
        lines.append(f'  "{column["name"]}" {SQL_TYPES[column["type"]]}{pk}')
    return f'create table "{table_name or name}" (\n' + ',\n'.join(lines) + '\n)'


def index_name(table: str, columns: list[str]) -> str:
    return f'{table}_{"_".join(columns)}'


def create_index_sql(name: str, spec: dict) -> list[str]:
    return [f'create index "{index_name(name, cols)}" on "{name}" ({", ".join(f"{c}" for c in cols)})'
            for cols in spec['indexes']]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('--check', action='store_true', help='書かずに、columns.json が最新か検査する')
    args = parser.parse_args()
    text = render()
    if args.check:
        if not OUTPUT.exists() or OUTPUT.read_text(encoding='utf-8') != text:
            print(f'{OUTPUT} が古い。serving:columns で書き直す', file=sys.stderr)
            return 1
        return 0
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(text, encoding='utf-8')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
