"""Validate declared PDF and CSV inputs and load them; optionally build the marts."""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import unicodedata
from pathlib import Path

import duckdb
import yaml

from ingestion.fiscal import manifest
from ingestion.fiscal.storage import fetch, verify
from ingestion.lib.node_tables import AMOUNT_COLUMNS, NODE_COLUMNS
from ingestion.lib.source_inconsistencies import declared_for
from ingestion.project import run as project
from ingestion.population import run as population

DBT = Path(__file__).resolve().parents[1]
PIPELINE = DBT.parent
JURISDICTIONS = PIPELINE.parent / 'packages/jurisdictions/jurisdictions.json'
SELECTIONS = PIPELINE / 'source_selection'


def identifier(value: str) -> str:
    return '"' + value.replace('"', '""') + '"'


def candidate_root(candidate: Path | None, target: dict, direction: str) -> Path | None:
    if candidate is None:
        return None
    nested = candidate / target['jurisdiction'] / str(target['fiscal_year']) / manifest.document_slot(target) / direction
    legacy = candidate / target['jurisdiction']
    return next((p for p in (nested, legacy) if (p / 'manifest.json').is_file()), None)


def input_path(document: dict, table: dict, kind: str, candidate: Path | None,
               *, remote: bool = False) -> Path:
    reference = table[kind]['object'] if kind in ('nodes', 'amounts') else table['object']
    root = candidate_root(candidate, document['target'], document['direction'])
    if root is None:
        return fetch(reference, remote=remote)
    path = root / f'{table["table_id"]}-{kind}.parquet'
    verify(path, reference)
    return path


# The yen of one printed unit, as the rows model reads `unit_text` (int_fiscal__settlement_expenditure_rows).
UNIT_YEN = {'円': 1, '千円': 1000}


def declared_factor(con, nodes: str, key: tuple) -> int:
    """The yen of one unit the declared parent prints in: a declaration (`source_inconsistencies`) gives the
    printed values as the original prints them (`728,067` in a 千円 column), the test compares them in yen."""
    amounts = nodes.removesuffix('_nodes') + '_amounts'
    *_, axis, page, code, name = key
    query = (f'select distinct a.unit_text from ingestion.{identifier(nodes)} n join ingestion.{identifier(amounts)} a'
             ' using (node_key) where n.axis_header = ?')
    units = {row[0] for row in con.execute(query + ' and n.physical_page = ? and n.name_text = ?', [axis, page, name]).fetchall()}
    if not units:  # the parent's printed name or page reads otherwise: the unit the axis prints in
        units = {row[0] for row in con.execute(query, [axis]).fetchall()}
    if len(units) != 1 or next(iter(units)) not in UNIT_YEN:
        raise ValueError(f'Declared inconsistency has no single printed unit: {nodes} p{page} {name} {sorted(map(str, units))}')
    return UNIT_YEN[next(iter(units))]


def inspect(con, path: Path, reference: dict, kind: str, amount_column: str | None = None) -> None:
    if kind == 'csv':
        columns = [row[0] for row in con.execute('describe select * from read_parquet(?)', [str(path)]).fetchall()]
        for required in (amount_column, 'source_line_start', 'source_line_end'):
            if required not in columns:
                raise ValueError(f'Missing CSV column {required}: {path}')
    else:
        expected = NODE_COLUMNS if kind == 'nodes' else AMOUNT_COLUMNS
        columns = con.execute('describe select * from read_parquet(?)', [str(path)]).fetchall()
        if [(row[0], row[1]) for row in columns] != [(col.name, col.type) for col in expected]:
            raise ValueError(f'Unexpected {kind} columns/types: {path}')
    count = con.execute('select count(*) from read_parquet(?)', [str(path)]).fetchone()[0]
    if count != reference['row_count']:
        raise ValueError(f'Row count differs: {path}')


def track_origin(origins: dict, target: dict, direction: str, original: dict, document: dict) -> str:
    origin_id = original['sha256']
    selected = manifest.selection_for(document)
    choice = selected['candidates'][0]
    origin = (origin_id, target['jurisdiction'], target['fiscal_year'], target['document_kind'],
              target.get('amendment_number'), choice['title'], original['download_url'],
              original['format'], original['sha256'])
    if origin_id in origins and origins[origin_id] != origin:
        raise ValueError('Original SHA identifies conflicting source targets')
    origins[origin_id] = origin
    return origin_id


def write_relations(declarations: list[dict]) -> None:
    # Generate before dbt parsing so source dependencies remain visible in its DAG.
    pdf = [s for s in declarations if s['name'] == 'fiscal_pdf']
    if len(pdf) != 1:
        raise ValueError('Expected exactly one fiscal_pdf source declaration')
    write_macro('fiscal_pdf_relations',
                sorted(t['name'].removesuffix('_nodes') for t in pdf[0]['tables']
                       if t['meta']['kind'] == 'nodes'))
    csv = [s for s in declarations if s['name'] == 'fiscal_csv']
    if len(csv) > 1:
        raise ValueError('Expected at most one fiscal_csv source declaration')
    # Each CSV relation carries the amount column its conversion declares.
    write_macro('fiscal_csv_relations',
                sorted(({'relation': t['name'], 'amount_column': t['meta']['amount_column']}
                        for t in csv[0]['tables']), key=lambda r: r['relation']) if csv else [])


def write_macro(macro_name: str, relations: list[str]) -> None:
    macro = DBT / f'macros/{macro_name}.sql'
    macro.parent.mkdir(parents=True, exist_ok=True)
    macro.write_text('-- Generated by scripts/prepare.py from models/staging/fiscal/_sources.yml.\n'
                     '{% macro ' + macro_name + '() %}\n'
                     '    {{ return(' + json.dumps(relations) + ') }}\n'
                     '{% endmacro %}\n')


def load_document(documents: dict, spec: dict, candidate: Path | None) -> dict:
    target = {k: spec[k] for k in ('jurisdiction', 'fiscal_year', 'document_kind')}
    key = (target['jurisdiction'], target['fiscal_year'], target['document_kind'], spec['direction'])
    if key not in documents:
        root = candidate_root(candidate, target, spec['direction'])
        path = root / 'manifest.json' if root else manifest.manifest_path(target, spec['direction'])
        document = (manifest.validate(json.loads(path.read_text()), check_code=False) if root
                    else manifest.read(path, check_code=False))
        if document['target'] != target or document['direction'] != spec['direction']:
            raise ValueError(f'Manifest target differs: {path}')
        documents[key] = document
    return documents[key]


def original_for(document: dict, table: dict) -> dict:
    conversion = next((c for c in document['conversions'] if c['id'] == table['conversion_id']), None)
    if conversion is None:
        raise ValueError(f'Unknown conversion {table["conversion_id"]} for table {table["table_id"]}')
    inputs = manifest.resolved_inputs(document, conversion)
    if len(inputs) != 1:
        raise ValueError('Each table must have exactly one original file')
    return inputs[0]


def load_jurisdictions(path: Path, selections: Path = SELECTIONS) -> list[tuple[str, str, str, str | None]]:
    """自治体マスタ（ADR 0015）の自治体コード・名称・OCD ID と、出典の選定にある公式サイトの URL。自治体コードの検査は dbt の marts が持つ。

    API は入力の自治体名だけを NFKC で揃えて部分一致で引くので、マスタの名称が NFKC で変わる字を含むと当たらない。そのときは止める。
    """
    registry = json.loads(path.read_text(encoding='utf-8'))['jurisdictions']
    changed = [code for code, entry in registry.items() if unicodedata.normalize('NFKC', entry['name']) != entry['name']]
    if changed:
        raise ValueError(f'Jurisdiction names must be NFKC-normalized: {sorted(changed)}')
    def official_url(code: str) -> str | None:
        selection = selections / f'{code}.json'
        return json.loads(selection.read_text(encoding='utf-8')).get('official_url') if selection.is_file() else None
    return [(code, entry['name'], entry['ocdId'], official_url(code)) for code, entry in sorted(registry.items())]


def prepare(warehouse: Path, candidate: Path | None = None, *, remote: bool = False) -> dict:
    declarations = yaml.safe_load((DBT / 'models/staging/fiscal/_sources.yml').read_text())['sources']
    write_relations(declarations)
    provided = set(candidate.rglob('manifest.json')) if candidate is not None else set()
    if candidate is not None and not provided:
        raise ValueError('Candidate directory contains no manifest.json')
    pdf_sources = [s for s in declarations if s['name'] == 'fiscal_pdf']
    csv_sources = [s for s in declarations if s['name'] == 'fiscal_csv']
    sources = pdf_sources[0]
    documents, origins, tables, csv_tables, inconsistencies = {}, {}, [], [], []
    warehouse.parent.mkdir(parents=True, exist_ok=True)
    # One transaction: a failed input never leaves a partially replaced ingestion schema.
    with duckdb.connect(str(warehouse)) as con:
        con.begin()
        con.execute('create schema if not exists ingestion')
        for declared in sources['tables']:
            spec = declared['meta']
            target = {k: spec[k] for k in ('jurisdiction', 'fiscal_year', 'document_kind')}
            document = load_document(documents, spec, candidate)
            table = next((t for t in document['tables'] if t['table_id'] == spec['table_id']), None)
            if table is None or 'nodes' not in table:
                raise ValueError(f'Missing node table: {declared["name"]}')
            if not table.get('account') or table.get('unread_amount_count') != 0 or table.get('unresolved_parent_count') != 0:
                raise ValueError(f'Account/reading/parent contract failed: {declared["name"]}')
            original = original_for(document, table)
            if table['account'] not in {s['account'] for s in original['scope']}:
                raise ValueError('Account is outside selected original scopes')
            origin_id = track_origin(origins, target, spec['direction'], original, document)
            kind = spec['kind']
            path = input_path(document, table, kind, candidate, remote=remote)
            inspect(con, path, table[kind], kind)
            con.execute(f'create or replace table ingestion.{identifier(declared["name"])} as select * from read_parquet(?)', [str(path)])
            if kind == 'nodes':
                source_key = manifest.object_key(document, table['table_id']).removesuffix('.parquet')
                for entry in declared_for(document, table['table_id']):
                    inconsistencies.append((declared['name'], (target['jurisdiction'], target['fiscal_year'], target['document_kind'],
                                            table['account'], entry['axis'], entry['page'], entry['parent']['code'],
                                            entry['parent']['name']), entry['printed'], entry['children_sum']))
                tables.append((source_key, declared['name'].removesuffix('_nodes'), target['jurisdiction'],
                               target['fiscal_year'], target['document_kind'], spec['direction'],
                               table['table_id'], table['account'], table.get('division'), origin_id,
                               json.dumps(table['notes'], ensure_ascii=False),
                               table['nodes']['row_count'], table['amounts']['row_count']))
        for csv_source in csv_sources:
            for declared in csv_source['tables']:
                spec = declared['meta']
                target = {k: spec[k] for k in ('jurisdiction', 'fiscal_year', 'document_kind')}
                document = load_document(documents, spec, candidate)
                table = next((t for t in document['tables'] if t['table_id'] == spec['table_id']), None)
                if table is None or 'object' not in table:
                    raise ValueError(f'Missing raw CSV table: {declared["name"]}')
                original = original_for(document, table)
                origin_id = track_origin(origins, target, spec['direction'], original, document)
                path = input_path(document, table, 'csv', candidate, remote=remote)
                inspect(con, path, table, 'csv', spec['amount_column'])
                con.execute(f'create or replace table ingestion.{identifier(declared["name"])} as select * from read_parquet(?)', [str(path)])
                # The account column of each CSV layout (numbered 01会計, named 会計名称); see fiscal_csv_layouts.sql.
                columns = {row[0] for row in con.execute(f'describe ingestion.{identifier(declared["name"])}').fetchall()}
                account_column = next((c for c in ('01会計', '会計名称') if c in columns), None)
                if account_column is None:
                    raise ValueError(f'CSV without a known account column: {declared["name"]}')
                accounts = [row[0] for row in con.execute(
                    f'select distinct {identifier(account_column)} from ingestion.{identifier(declared["name"])}').fetchall()]
                stripped = {re.sub(r'^\d+', '', account) for account in accounts}
                scope_accounts = {s['account'] for s in original['scope']}
                if not stripped or not stripped <= scope_accounts:
                    raise ValueError(f'CSV accounts outside selected original scopes: {declared["name"]} {sorted(stripped)}')
                source_key = manifest.object_key(document, table['table_id']).removesuffix('.parquet')
                csv_tables.append((source_key, declared['name'], target['jurisdiction'],
                                   target['fiscal_year'], target['document_kind'], spec['direction'],
                                   table['table_id'], origin_id, table['row_count'],
                                   spec['amount_column'], spec['amount_unit']))
        con.execute('create or replace table ingestion.tables (source_table_key varchar, relation_prefix varchar, jurisdiction_code varchar, fiscal_year integer, document_kind varchar, direction varchar, table_id varchar, account_name varchar, division varchar, origin_id varchar, notes varchar, nodes_row_count bigint, amounts_row_count bigint)')
        con.executemany('insert into ingestion.tables values (?,?,?,?,?,?,?,?,?,?,?,?,?)', tables)
        con.execute('create or replace table ingestion.csv_tables (source_table_key varchar, relation_prefix varchar, jurisdiction_code varchar, fiscal_year integer, document_kind varchar, direction varchar, table_id varchar, origin_id varchar, row_count bigint, amount_column varchar, amount_unit varchar)')
        if csv_tables:
            con.executemany('insert into ingestion.csv_tables values (?,?,?,?,?,?,?,?,?,?,?)', csv_tables)
        con.execute('create or replace table ingestion.source_inconsistencies (jurisdiction_code varchar, fiscal_year integer, document_kind varchar, account_name varchar, axis varchar, page integer, parent_code varchar, parent_name varchar, printed_yen bigint, children_sum_yen bigint)')
        if inconsistencies:
            con.executemany('insert into ingestion.source_inconsistencies values (?,?,?,?,?,?,?,?,?,?)',
                            [(*key, printed * factor, children * factor) for key, printed, children, factor in
                             ((key, printed, children, declared_factor(con, nodes, key))
                              for nodes, key, printed, children in inconsistencies)])
        con.execute('create or replace table ingestion.origin (origin_id varchar, jurisdiction_code varchar, fiscal_year integer, document_kind varchar, amendment_number integer, title varchar, url varchar, format varchar, sha256 varchar)')
        con.executemany('insert into ingestion.origin values (?,?,?,?,?,?,?,?,?)', list(origins.values()))
        jurisdictions = load_jurisdictions(JURISDICTIONS)
        con.execute('create or replace table ingestion.jurisdiction (jurisdiction_code varchar, name varchar, ocd_id varchar, official_url varchar)')
        con.executemany('insert into ingestion.jurisdiction values (?,?,?,?)', jurisdictions)
        population_origins, residents = [], []
        for origin in population.origins():
            path = population.fetch(origin, remote=remote)
            population_origins.append((population.origin_id(origin), origin['reference_date'], origin['url']))
            residents += [(population.origin_id(origin), *row) for row in population.read(con, path, origin['reference_date'])]
        con.execute('create or replace table ingestion.population_origin (origin_id varchar, reference_date date, url varchar)')
        con.execute('create or replace table ingestion.resident_register (origin_id varchar, jurisdiction_code varchar, male bigint, female bigint, population bigint, households bigint)')
        if population_origins:
            con.executemany('insert into ingestion.population_origin values (?,?,?)', population_origins)
            con.executemany('insert into ingestion.resident_register values (?,?,?,?,?,?)', residents)
        project_tables = project.load(remote=remote)
        project.write(con, project_tables)
        used = {root / 'manifest.json' for document in documents.values()
                if (root := candidate_root(candidate, document['target'], document['direction'])) is not None}
        if provided - used:
            raise ValueError(f'Unused candidate manifests: {sorted(str(p) for p in provided - used)}')
        con.commit()
    return {'warehouse': str(warehouse), 'tables': len(tables), 'csv_tables': len(csv_tables),
            'origins': len(origins), 'jurisdictions': len(jurisdictions), 'population_origins': len(population_origins),
            'evaluation_sheets': len(project_tables['project_evaluation_sheet']), 'budget_measures': len(project_tables['project_budget_measure']),
            'nodes': sum(t[-2] for t in tables), 'amounts': sum(t[-1] for t in tables)}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--candidate-dir', type=Path,
                        help='Overlay candidates at jurisdiction/year/document-slot/direction/manifest.json '
                             '(legacy jurisdiction/manifest.json also supported); other targets use cached saved objects')
    parser.add_argument('--remote', action='store_true', help='Restore missing saved objects with cf (read only)')
    parser.add_argument('--build', action='store_true', help='Build and test the expenditure marts after preparation')
    args = parser.parse_args()
    if args.remote and args.candidate_dir:
        parser.error('--remote and --candidate-dir are mutually exclusive')
    # Resolve the same profile path as dbt (relative to its project directory).
    profile = yaml.safe_load((DBT / 'profiles.yml').read_text())['fudoki']['outputs']['dev']
    warehouse = (DBT / profile['path']).resolve()
    candidate = args.candidate_dir.resolve() if args.candidate_dir else None
    result = prepare(warehouse, candidate, remote=args.remote)
    if args.build:
        # --full-refresh: a seed that gains a column would otherwise fail against the table of an earlier build.
        subprocess.run(['dbt', 'build', '--full-refresh', '--project-dir', str(DBT), '--profiles-dir', str(DBT),
                        '--select', 'marts.expenditure+', '+marts.expenditure', '+jurisdiction',
                        '+marts.population', 'cofog_master', '+marts.evaluation', '+marts.budget_proposal'],
                       cwd=DBT, stdout=sys.stderr, check=True)
        result['dbt_build'] = 'passed'
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    main()
