"""Generate the dbt source declarations from the ingestion management JSONs.

The table list is never written by hand: adding a jurisdiction or table only needs
its management JSON (``ingestion/fiscal/jurisdictions/<自治体>/<年度>/{settlement,initial}/expenditure.json``).
PDF node tables go to the ``fiscal_pdf`` source, raw CSV tables to ``fiscal_csv``.
Run ``uv run python dbt/scripts/generate_sources.py`` after the manifests change and
commit the result; ``--check`` only verifies the committed file matches.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import yaml

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
EXCLUDE_YEAR: dict[tuple[str, int, str, str], str] = {
    # 132098 prints kan/kou numbers without names; seed fiscal_subject_name_fill names them from the settlement where
    # every 目 under them agrees. These two R6 accounts have no R6 settlement, and the R7 one orders their 目 differently.
    **{('132098', 2024, 'initial', table): 'the book prints kan/kou numbers without names, and no settlement of the year '
       'confirms the names (the R7 settlement orders the 目 differently)'
       for table in ('national-health-insurance-initial', 'long-term-care-initial')},
    ('132080', 2026, 'initial', 'general-initial-3'): 'kou/moku numbers collide across kan (kou 5 holds both 中学校費 and 教育総務費)',
    **{(jurisdiction, year, kind, 'general-expenditure'): 'a kan-only table that prints no kan numbers; the subject table needs a kan code'
       for jurisdiction, year, kind in (('133639', 2024, 'initial'), ('133639', 2025, 'initial'), ('133817', 2024, 'settlement'))},
    ('132080', 2026, 'initial', 'general-initial-5'): 'the other volume of the account above, held out with it so the account is not counted half',
    ('132080', 2025, 'initial', 'general-initial-6'): 'the other volume of the account below, held out with it so the account is not counted half',
    ('132080', 2025, 'initial', 'general-initial-4'): 'the continuation volume loses the nesting of a transfer breakdown, so its 介護保険事務費 collides with the same-named project of the other volume',
}

HEADER = ('# Generated by scripts/generate_sources.py from the ingestion management JSONs.\n'
          '# Do not edit by hand; excluded tables are listed in EXCLUDE and EXCLUDE_YEAR with reasons.\n')


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


def render() -> str:
    collected = collect()
    declaration = {'sources': [
        {'name': 'fiscal_pdf', 'schema': 'ingestion',
         'tables': [{k: v for k, v in e.items() if k != 'source'}
                     for e in collected if e['source'] == 'fiscal_pdf']},
        {'name': 'fiscal_csv', 'schema': 'ingestion',
         'tables': [{k: v for k, v in e.items() if k != 'source'}
                     for e in collected if e['source'] == 'fiscal_csv']},
        {'name': 'fiscal_metadata', 'schema': 'ingestion',
         'tables': [{'name': 'tables'}, {'name': 'csv_tables'}, {'name': 'origin'},
                    {'name': 'source_inconsistencies'}]},
        {'name': 'registry', 'schema': 'ingestion', 'tables': [{'name': 'jurisdiction'}]}]}
    return HEADER + yaml.safe_dump(declaration, allow_unicode=True, sort_keys=False)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Verify the committed file instead of writing it')
    args = parser.parse_args()
    path = DBT / 'models/staging/fiscal/_sources.yml'
    rendered = render()
    if args.check:
        if path.read_text() != rendered:
            raise SystemExit(f'Source declarations differ; regenerate with {Path(__file__).name}')
        print(json.dumps({'sources': 'match'}))
    else:
        path.write_text(rendered)
        print(json.dumps({'sources': path.read_text().count('- name: j'), 'file': str(path)}))


if __name__ == '__main__':
    main()
