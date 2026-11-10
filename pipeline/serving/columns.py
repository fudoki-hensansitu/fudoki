"""D1 に写す表の契約と、API が読む `apps/api/src/columns.json` の生成器（ADR 0022）。

D1 の表は marts の表を同名・同列・同順で写したもの。列・順序・型は warehouse の information_schema から、
説明は marts の `_models.yml`（財政・自治体マスタ・人口・事業評価）から引く。warehouse は read_only で開く（構築は dbt:build）。

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
MODELS = [PIPELINE / 'dbt/models/marts/fiscal/_models.yml', PIPELINE / 'dbt/models/marts/jurisdiction/_models.yml',
          PIPELINE / 'dbt/models/marts/population/_models.yml', PIPELINE / 'dbt/models/marts/project/_models.yml']
WAREHOUSE = PIPELINE / '.build/warehouse.duckdb'
OUTPUT = PIPELINE.parent / 'apps/api/src/columns.json'

# D1 に写す marts の表（同期の順は sync_d1.TABLE_ORDER）
TABLES = ['jurisdiction', 'fiscal_origin', 'fiscal_expenditure_subject', 'fiscal_expenditure_detail',
          'fiscal_expenditure_location', 'fiscal_coverage', 'population_origin', 'population',
          'project_origin', 'project_evaluation_sheet', 'project_evaluation_indicator', 'project_evaluation_indicator_value',
          'project_evaluation_result', 'project_budget_initiative']
PRIMARY_KEYS = {'jurisdiction': 'jurisdiction_code', 'fiscal_origin': 'origin_id',
                'fiscal_expenditure_subject': 'subject_id', 'fiscal_expenditure_detail': 'detail_id',
                'fiscal_expenditure_location': 'row_id', 'fiscal_coverage': 'coverage_id',
                'population_origin': 'origin_id', 'population': 'population_id',
                'project_origin': 'origin_id', 'project_evaluation_sheet': 'sheet_id', 'project_evaluation_indicator': 'indicator_id',
                'project_evaluation_indicator_value': 'value_id', 'project_evaluation_result': 'origin_id', 'project_budget_initiative': 'initiative_id'}
# index（docs/prd/fiscal-serving-tables/dd.md）。科目は自治体の一覧・比較・COFOG・子、内訳は科目の下・子・自治体の事業。
# 収録範囲と人口は自治体のページごとに自治体コードで引く
INDEXES = {
    'fiscal_expenditure_subject': [['fiscal_year', 'document_kind', 'jurisdiction_code', 'level'],
                                   ['fiscal_year', 'document_kind', 'cofog_code'], ['parent_subject_id']],
    'fiscal_expenditure_detail': [['subject_id', 'breakdown', 'depth'], ['parent_detail_id'],
                                  ['fiscal_year', 'document_kind', 'jurisdiction_code', 'breakdown']],
    'fiscal_coverage': [['jurisdiction_code']],
    'population': [['jurisdiction_code']],
    'project_evaluation_sheet': [['jurisdiction_code', 'fiscal_year'], ['detail_id']],
    'project_evaluation_indicator': [['sheet_id']],
    'project_evaluation_indicator_value': [['indicator_id']],
    'project_evaluation_result': [['jurisdiction_code']],
    'project_budget_initiative': [['jurisdiction_code', 'fiscal_year'], ['detail_id']],
}

TYPES = {'VARCHAR': 'string', 'INTEGER': 'integer', 'BIGINT': 'integer', 'HUGEINT': 'integer', 'BOOLEAN': 'boolean',
         'DOUBLE': 'number', 'FLOAT': 'number'}
SQL_TYPES = {'string': 'text', 'integer': 'integer', 'boolean': 'integer', 'number': 'real'}


def json_type(table: str, column: str, data_type: str) -> str:
    """DuckDB の型を JSON の型にする。対応が無い型は黙って string にせず止める。"""
    if data_type in TYPES:
        return TYPES[data_type]
    if data_type.startswith('DECIMAL'):
        return 'number'
    raise SystemExit(f'{table}.{column}: 対応の無い型 {data_type}（columns.py の TYPES に足す）')


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
            out[table] = [(name, json_type(table, name, type_)) for name, type_ in rows]
        return out
    finally:
        if own:
            con.close()


def models() -> list[dict]:
    return [m for path in MODELS for m in yaml.safe_load(path.read_text(encoding='utf-8'))['models']]


def model_descriptions() -> dict[str, dict[str, str | None]]:
    return {m['name']: {c['name']: c.get('description') for c in m.get('columns', [])} for m in models()}


def model_not_null() -> dict[str, set[str]]:
    """data_tests に not_null がある列。"""
    return {m['name']: {c['name'] for c in m.get('columns', []) if 'not_null' in (c.get('data_tests') or [])}
            for m in models()}


def build(columns: dict[str, list[tuple[str, str]]] | None = None) -> dict:
    columns = columns or warehouse_columns()
    descriptions = model_descriptions()
    not_null = model_not_null()
    tables = {}
    for table in TABLES:
        spec: dict = {'primary_key': PRIMARY_KEYS[table], 'indexes': INDEXES.get(table, [])}
        spec['columns'] = [{'name': name, 'type': type_, 'nullable': name not in not_null[table],
                            'description': descriptions[table].get(name)}
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
