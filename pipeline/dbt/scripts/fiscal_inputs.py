"""dbt に読み込む取り込みの表の一覧を、取り込みの管理 JSON から作る（prepare.py が build のたびに呼ぶ）。

一覧は手で書かず、ファイルにも保存しない。自治体や表を足すときは管理 JSON
（``ingestion/fiscal/jurisdictions/<自治体>/<年度>/{settlement,initial}/expenditure.json``）だけを足す。
PDF のノードの表は ``fiscal_pdf``、CSV の表は ``fiscal_csv`` に分ける。
"""
from __future__ import annotations

import json
from pathlib import Path


DBT = Path(__file__).resolve().parents[1]
PIPELINE = DBT.parent

# Tables the shared tree model cannot carry without per-table exceptions, so they
# stay out of the input with the reason recorded here instead of scattered code.
# 132071 下水道事業会計 (public enterprise): its kan/kou/moku nodes have no printed
# numbers, so every moku of the same account would collapse into one node_id, and the
# revenue and capital tables name their single kan differently inside one account.
EXCLUDE: dict[tuple[str, str], str] = {
    ('132071', 'akishima-enterprise-expenditure-revenue-detail'):
        'public enterprise account without kan/kou/moku numbers',
    ('132071', 'akishima-enterprise-expenditure-capital-detail'):
        'public enterprise account without kan/kou/moku numbers',
    ('132012', 'sewer-revenue-expenditure-detail'):
        'public enterprise account without kan/kou/moku numbers',
    ('132063', 'racing-expenditure'):
        'public enterprise account whose revenue and capital statements both open with 款 1 under different names',
    ('132063', 'sewerage-expenditure'):
        'public enterprise account whose revenue and capital statements both open with 款 1 under different names',
    ('132233', 'sewer-expenditure-detail'):
        'public enterprise account whose revenue and capital statements both open with 款 1 under different names',
    ('132276', 'water-revenue-expenditure-detail'):
        'public enterprise account whose revenue and capital statements both open with 款 1 under different names',
    ('132276', 'water-capital-expenditure-detail'):
        'public enterprise account whose revenue and capital statements both open with 款 1 under different names',
    ('132276', 'sewer-revenue-expenditure-detail'):
        'public enterprise account whose revenue and capital statements both open with 款 1 under different names',
    ('132276', 'sewer-capital-expenditure-detail'):
        'public enterprise account whose revenue and capital statements both open with 款 1 under different names',
    ('132021', 'sewer-revenue-expenditure-detail'):
        'public enterprise account whose revenue and capital statements both open with 款 1 under different names',
    ('132021', 'sewer-capital-expenditure-detail'):
        'public enterprise account whose revenue and capital statements both open with 款 1 under different names',
    ('132039', 'water-revenue-expenditure-detail'):
        'public enterprise account whose revenue and capital statements both open with 款 1 under different names',
    ('132039', 'water-capital-expenditure-detail'):
        'public enterprise account whose revenue and capital statements both open with 款 1 under different names',
    ('132195', 'sewer-revenue-expenditure-detail'):
        'public enterprise account whose revenue and capital statements both open with 款 1 under different names',
    ('132195', 'sewer-capital-expenditure-detail'):
        'public enterprise account whose revenue and capital statements both open with 款 1 under different names',
    # 132101 下水道事業会計: the revenue (17) and capital (12) statements both open with 款 1
    # under different names, and the report (6) prints its 款・項 without separate numbers.
    ('132101', 'expenditure-settlement-6'):
        'public enterprise report whose kan/kou carry no separate numbers',
    ('132101', 'expenditure-settlement-12'):
        'public enterprise account whose revenue and capital statements both open with 款 1 under different names',
    ('132101', 'expenditure-settlement-17'):
        'public enterprise account whose revenue and capital statements both open with 款 1 under different names',
}

# Tables of one year whose saved tree breaks the shared row contract, held out until they are converted again.
# Keyed by (jurisdiction, fiscal_year, document_kind, table_id) because the same table_id carries other years.
EXCLUDE_YEAR: dict[tuple[str, int, str, str], str] = {}

def relation_name(jurisdiction: str, fiscal_year: int, document_kind: str, table_id: str) -> str:
    # 表 ID は自治体の中で年度・資料区分をまたいで同じ名前を使えるため、relation 名に両方を含める。
    return f'j{jurisdiction}_{fiscal_year}_{document_kind}_' + table_id.replace('-', '_')


def collect() -> list[dict]:
    entries = []
    patterns = ('*/*/settlement/expenditure.json', '*/*/initial/expenditure.json')
    manifests = sorted({p for pattern in patterns
                        for p in (PIPELINE / 'ingestion/fiscal/jurisdictions').glob(pattern)})
    for path in manifests:
        document = json.loads(path.read_text())
        conversions = {c['id']: c for c in document['conversions']}
        target = document['target']
        direction = document['direction']
        for table in document['tables']:
            if (target['jurisdiction'], table['table_id']) in EXCLUDE or (
                    target['jurisdiction'], target['fiscal_year'], target['document_kind'], table['table_id']) in EXCLUDE_YEAR:
                continue
            prefix = relation_name(target['jurisdiction'], target['fiscal_year'], target['document_kind'], table['table_id'])
            meta = {'jurisdiction': target['jurisdiction'], 'fiscal_year': target['fiscal_year'],
                    'document_kind': target['document_kind'], 'direction': direction,
                    'table_id': table['table_id']}
            if 'nodes' in table:
                for kind in ('nodes', 'amounts'):
                    entries.append({'name': f'{prefix}_{kind}', 'source': 'fiscal_pdf',
                                    'meta': {**meta, 'kind': kind}})
            elif 'object' in table:
                # The amount column and its unit are declared by the CSV conversion, never fixed in SQL.
                options = conversions[table['conversion_id']]['options']
                if direction == 'expenditure' and not {'amount_column', 'amount_unit'} <= options.keys():
                    raise ValueError(f"Expenditure CSV conversion must declare amount_column and amount_unit: {path}")
                declared = {k: options[k] for k in ('amount_column', 'amount_unit') if k in options}
                entries.append({'name': prefix, 'source': 'fiscal_csv', 'meta': {**meta, **declared}})
            else:
                raise ValueError(f"Table is neither PDF nodes nor raw CSV: {path} {table.get('table_id')}")
    entries.sort(key=lambda e: e['name'])
    return entries


def declarations() -> list[dict]:
    """表の一覧を、PDF（fiscal_pdf）と CSV（fiscal_csv）に分けて返す。"""
    collected = collect()
    return [{'name': name, 'tables': [{k: v for k, v in e.items() if k != 'source'}
                                      for e in collected if e['source'] == name]}
            for name in ('fiscal_pdf', 'fiscal_csv')]
