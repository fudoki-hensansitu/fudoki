"""Queria 用の marts（`dbt/models/marts/queria/`）を Queria の公開データセット fudoki（FDL 形式の DuckLake）に写す。

表は marts と同名・同列のまま写す（モデル名 queria_<スキーマ>__<テーブル> → <スキーマ>.<テーブル>）。
`fdl checkout` で作った作業用カタログに表を書き、作業ディレクトリに `dataset.yml`・`tables/<スキーマ>.<テーブル>.table.yml`・`README.md` を書く。
宣言の説明・主キー・キーは marts の `_models.yml` から引く。公開（`queria validate` → `uvx --from fdl-cli fdl commit` → `fdl push`）は手で流す。手順は pipeline/AGENTS.md の「Queria への配布」。

    bun run --cwd pipeline serving:queria                          # 全自治体
    bun run --cwd pipeline serving:queria -- --jurisdiction 131091  # 試しに一部の自治体だけ
"""
from __future__ import annotations

import argparse
import os
from pathlib import Path

import yaml

PIPELINE = Path(__file__).resolve().parents[1]
MODELS = PIPELINE / 'dbt/models/marts/queria/_models.yml'
WAREHOUSE = PIPELINE / '.build/warehouse.duckdb'
WORKDIR = PIPELINE / '.build/queria'
CODE = 'local_government_code'
DATASET = {
    'name': 'fudoki',
    'title': '風土記 自治体の歳出（款・項・目と内訳）',
    'description': '自治体が公開した予算書・決算書から、歳出を款・項・目と、その下の事業・節の内訳まで取り込んだデータです。'
                   '出典は各自治体の公開資料で、取り込み・分類は風土記（https://fudoki.dev）が行っています。',
    'language': 'ja',
    'licenses': [{
        'id': 'other',
        'title': '出典は各自治体の公開資料（著作権は各自治体）。取り込み・分類は風土記。利用は風土記の利用規約と各出典の利用条件に従う',
        'url': 'https://docs.fudoki.dev/terms',
        'commercial_use': True,
        'attribution_required': True,
    }],
    'contributors': [{'title': '風土記', 'roles': ['publisher']}],
    'keywords': ['予算', '決算', '歳出', '款項目', '予算書', '決算書', '事業', '節', '自治体財政', '風土記', 'fudoki'],
    'annotations': {'queria': {'title_kana': 'フドキ ジチタイノサイシュツ', 'themes': ['government_finance']}},
}


def models(path: Path = MODELS) -> list[dict]:
    return yaml.safe_load(path.read_text(encoding='utf-8'))['models']


def queria_name(model: str) -> tuple[str, str]:
    """queria_<スキーマ>__<テーブル> を (スキーマ, テーブル) にする。"""
    schema, _, table = model.removeprefix('queria_').partition('__')
    if not model.startswith('queria_') or not table:
        raise SystemExit(f'{model}: モデル名は queria_<スキーマ>__<テーブル> にする')
    return schema, table


def queria_meta(node: dict) -> dict:
    return ((node.get('config') or {}).get('meta') or {}).get('queria') or {}


def select_sql(model: str, columns: list[str], codes: list[str]) -> tuple[str, list]:
    """表を写す select。codes を渡すとその自治体の行だけにする（試しに載せるとき）。"""
    sql = f'select * from w.main.{model}'
    if not codes:
        return sql, []
    marks = ', '.join('?' for _ in codes)
    if CODE in columns:
        return f'{sql} where {CODE} in ({marks})', codes
    if 'expenditure_id' in columns:  # 根と出典の組は自治体の列を持たないので、根から絞る
        return (f'{sql} where expenditure_id in (select expenditure_id from w.main.queria_expenditure__expenditure '
                f'where {CODE} in ({marks}))'), codes
    raise SystemExit(f'{model}: 自治体で絞る列が無い')


def write_tables(working: Path, codes: list[str], specs: list[dict], warehouse: Path = WAREHOUSE) -> dict:
    """作業用カタログに表を書き、表ごとの行数と、収録の自治体・年度を返す。"""
    import duckdb

    def literal(path: Path) -> str:  # SQL の文字列リテラルの中に置くので ' を二重にする
        return str(path).replace("'", "''")

    con = duckdb.connect()
    con.execute('install ducklake; install sqlite; load ducklake; load sqlite')
    con.execute(f"attach '{literal(warehouse)}' as w (read_only)")
    con.execute(f"attach 'ducklake:{literal(working)}' as q (data_path '{literal(working)}.data/', "
                "override_data_path true, meta_type 'sqlite', data_inlining_row_limit 0)")
    # 作業用カタログを書き換える前に全部の表を確かめ、止まるときは checkout した版を残す
    rows, selects = {}, {}
    for spec in specs:
        model = spec['name']
        columns = [r[0] for r in con.execute(
            "select column_name from information_schema.columns where table_catalog = 'w' and table_schema = 'main' "
            'and table_name = ? order by ordinal_position', [model]).fetchall()]
        if not columns:
            raise SystemExit(f'warehouse に {model} が無い（dbt:build を先に流す）')
        declared = [c['name'] for c in spec.get('columns', [])]
        if columns != declared:
            raise SystemExit(f'{model}: warehouse の列と _models.yml の列が食い違う\n  {columns}\n  {declared}')
        sql, params = selects[model] = select_sql(model, columns, codes)
        rows[model] = con.execute(f'select count(*) from ({sql})', params).fetchone()[0]
        if rows[model] == 0 and model != 'queria_expenditure__detail':  # 内訳を印字しない資料もある
            raise SystemExit(f'{model}: 行が無い（自治体コードを確かめる）')
    wanted = {queria_name(spec['name']) for spec in specs}
    # checkout した前の版に、宣言から消した・改名した表が残らないようにする
    for schema, table in con.execute(
            "select schema_name, table_name from duckdb_tables() where database_name = 'q'").fetchall():
        if (schema, table) not in wanted:
            con.execute(f'drop table q.{schema}.{table}')
    for model, (sql, params) in selects.items():
        schema, table = queria_name(model)
        con.execute(f'create schema if not exists q.{schema}')
        con.execute(f'create or replace table q.{schema}.{table} as {sql}', params)
    found = [r[0] for r in con.execute(
        f'select distinct {CODE} from q.expenditure.expenditure order by 1').fetchall()]
    years = con.execute('select min(fiscal_year), max(fiscal_year) from q.expenditure.expenditure').fetchone()
    con.close()
    return {'rows': rows, 'codes': found, 'years': years}


def table_yaml(specs: list[dict]) -> list[dict]:
    """表ごとの宣言。1表1ファイル（*.table.yml）にする。fdl は `tables:` で複数表をまとめた形を読まない。"""
    tables = []
    for spec in specs:
        schema, table = queria_name(spec['name'])
        fields = []
        for column in spec.get('columns', []):
            field = {'name': column['name'], 'description': column['description']}
            if semantic := queria_meta(column).get('semantic'):
                field['annotations'] = {'queria': {'semantic': semantic}}
            fields.append(field)
        key = queria_meta(spec)['primary_key']
        tables.append({'schema': schema, 'name': table, 'description': spec['description'],
                       'primary_key': [key] if isinstance(key, str) else key, 'fields': fields})
    return tables


def readme(specs: list[dict], written: dict) -> str:
    lines = [f'# {DATASET["title"]}', '', DATASET['description'], '',
             '## 出典と利用条件', '',
             '出典は各自治体が公開した予算書・決算書です（資料名と URL は `expenditure.origin`）。著作権は各自治体にあります。',
             '会計の種類・COFOG・内訳の分け方・繰出の印は風土記の判断で、自治体が作成・承認したものではありません。',
             '利用は[風土記の利用規約](https://docs.fudoki.dev/terms)と各出典の利用条件に従ってください。',
             '紹介・再配布するときは、出典の自治体名・資料名・年度・URL と、風土記で取り込み・分類を行った旨を表示してください。', '',
             '## テーブル', '', '| テーブル | 内容 | 行数 |', '|---|---|---|']
    for spec in specs:
        schema, table = queria_name(spec['name'])
        summary = spec['description'].split('\n')[0]
        lines.append(f'| `{schema}.{table}` | {summary} | {written["rows"][spec["name"]]:,} |')
    lines += ['', '## 使い方', '', '```sql',
              '-- 一般会計の決算の、款ごとの支出済額',
              'SELECT local_government_code, fiscal_year, kan_name, amount_yen FROM fudoki.expenditure.subject',
              "WHERE document_kind = 'settlement' AND account_kind = '一般会計' AND level = '款'",
              'ORDER BY local_government_code, fiscal_year, kan_code;', '```', '',
              '## 注意', '',
              '- 決算（`document_kind = settlement`）と当初予算（`initial`）の金額は意味が違うので、必ずどちらかに絞ってください。',
              '- 内訳（`detail`）は科目（`subject`）の下の行です。科目と足さないでください。',
              '- 同じ自治体・年度の当初予算と決算の科目は `node_key` で突き合わせられます。内訳は見出し・名称が同じときだけ一致します。',
              '- 収録していない自治体・年度・会計は 0 ではなく、データがありません。', '']
    return '\n'.join(lines)


def write_declarations(workdir: Path, specs: list[dict], written: dict) -> None:
    dataset = dict(DATASET)
    dataset['spatial_coverage'] = written['codes']
    dataset['temporal_coverage'] = {'start': str(written['years'][0]), 'end': str(written['years'][1])}
    (workdir / 'tables').mkdir(parents=True, exist_ok=True)

    class Dumper(yaml.SafeDumper):
        def ignore_aliases(self, data):  # 同じ semantic を &id で参照させない
            return True

    def dump(data):
        return yaml.dump(data, Dumper=Dumper, allow_unicode=True, sort_keys=False, width=1000)

    (workdir / 'dataset.yml').write_text(dump(dataset), encoding='utf-8')
    for stale in (workdir / 'tables').glob('*.table.yml'):
        stale.unlink()
    for table in table_yaml(specs):
        (workdir / f'tables/{table["schema"]}.{table["name"]}.table.yml').write_text(dump(table), encoding='utf-8')
    (workdir / 'README.md').write_text(readme(specs, written), encoding='utf-8')


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('--jurisdiction', action='append', default=[], help='試しに載せる自治体コード（6桁）。公開する版は省略して全自治体で作る')
    parser.add_argument('--workdir', type=Path, default=WORKDIR, help='宣言ファイルを書く作業ディレクトリ')
    parser.add_argument('--ducklake', type=Path, default=None,
                        help='作業用カタログ（fdl checkout の出力）。省略すると $FDL_WORKING か <workdir>/.fdl/work.sqlite')
    args = parser.parse_args()
    working = args.ducklake or Path(os.environ.get('FDL_WORKING') or args.workdir / '.fdl/work.sqlite')
    if not working.exists():
        raise SystemExit(f'{working} が無い。先に fdl checkout で作る（pipeline/AGENTS.md の配信）')
    specs = models()
    written = write_tables(working.resolve(), args.jurisdiction, specs)
    write_declarations(args.workdir, specs, written)
    for spec in specs:
        schema, table = queria_name(spec['name'])
        print(f'{schema}.{table}: {written["rows"][spec["name"]]} 行')
    print(f'宣言: {args.workdir}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
