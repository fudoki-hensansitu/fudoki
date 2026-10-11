"""Validate declared PDF inputs and load them; optionally build the settlement slice."""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

import duckdb
import yaml

from ingestion.fiscal import manifest
from ingestion.fiscal.storage import fetch, verify
from ingestion.lib.node_tables import AMOUNT_COLUMNS, NODE_COLUMNS

DBT = Path(__file__).resolve().parents[1]
PIPELINE = DBT.parent


def identifier(value: str) -> str:
    return '"' + value.replace('"', '""') + '"'


def input_path(document: dict, table: dict, kind: str, candidate: Path | None,
               *, remote: bool = False) -> Path:
    reference = table[kind]['object']
    if candidate is None:
        return fetch(reference, remote=remote)
    path = candidate / document['target']['jurisdiction'] / f'{table["table_id"]}-{kind}.parquet'
    verify(path, reference)
    return path


def inspect(con, path: Path, reference: dict, kind: str) -> None:
    expected = NODE_COLUMNS if kind == 'nodes' else AMOUNT_COLUMNS
    columns = con.execute('describe select * from read_parquet(?)', [str(path)]).fetchall()
    if [(row[0], row[1]) for row in columns] != [(col.name, col.type) for col in expected]:
        raise ValueError(f'Unexpected {kind} columns/types: {path}')
    count = con.execute('select count(*) from read_parquet(?)', [str(path)]).fetchone()[0]
    if count != reference['row_count']:
        raise ValueError(f'Row count differs: {path}')


def prepare(warehouse: Path, candidate: Path | None = None, *, remote: bool = False) -> dict:
    sources = yaml.safe_load((DBT / 'models/staging/fiscal/_sources.yml').read_text())['sources'][0]
    documents, origins, tables = {}, {}, []
    warehouse.parent.mkdir(parents=True, exist_ok=True)
    # One transaction: a failed input never leaves a partially replaced ingestion schema.
    with duckdb.connect(str(warehouse)) as con:
        con.begin()
        con.execute('create schema if not exists ingestion')
        for declared in sources['tables']:
            spec = declared['meta']
            target = {k: spec[k] for k in ('jurisdiction', 'fiscal_year', 'document_kind')}
            key = (target['jurisdiction'], target['fiscal_year'], target['document_kind'], spec['direction'])
            if key not in documents:
                path = (candidate / target['jurisdiction'] / 'manifest.json' if candidate else
                        manifest.manifest_path(target, spec['direction']))
                document = (manifest.validate(json.loads(path.read_text()), check_code=False) if candidate
                            else manifest.read(path, check_code=False))
                if document['target'] != target or document['direction'] != spec['direction']:
                    raise ValueError(f'Manifest target differs: {path}')
                documents[key] = document
            document = documents[key]
            table = next((t for t in document['tables'] if t['table_id'] == spec['table_id']), None)
            if table is None or 'nodes' not in table:
                raise ValueError(f'Missing node table: {declared["name"]}')
            if not table.get('account') or table.get('unread_amount_count') != 0 or table.get('unresolved_parent_count') != 0:
                raise ValueError(f'Account/reading/parent contract failed: {declared["name"]}')
            conversion = next(c for c in document['conversions'] if c['id'] == table['conversion_id'])
            inputs = manifest.resolved_inputs(document, conversion)
            if len(inputs) != 1:
                raise ValueError('Each node table must have exactly one original file')
            original = inputs[0]
            if table['account'] not in {s['account'] for s in original['scope']}:
                raise ValueError('Account is outside selected original scopes')
            origin_id = original['sha256']
            selected = manifest.selection_for(document)
            choice = selected['candidates'][0]
            origin = (origin_id, target['jurisdiction'], target['fiscal_year'], target['document_kind'],
                      target.get('amendment_number'), choice['title'], original['download_url'],
                      original['format'], original['sha256'])
            if origin_id in origins and origins[origin_id] != origin:
                raise ValueError('Original SHA identifies conflicting source targets')
            origins[origin_id] = origin
            kind = spec['kind']
            path = input_path(document, table, kind, candidate, remote=remote)
            inspect(con, path, table[kind], kind)
            con.execute(f'create or replace table ingestion.{identifier(declared["name"])} as select * from read_parquet(?)', [str(path)])
            if kind == 'nodes':
                source_key = manifest.object_key(document, table['table_id']).removesuffix('.parquet')
                tables.append((source_key, declared['name'].removesuffix('_nodes'), target['jurisdiction'],
                               target['fiscal_year'], target['document_kind'], spec['direction'],
                               table['table_id'], table['account'], origin_id, json.dumps(table['notes'], ensure_ascii=False),
                               table['nodes']['row_count'], table['amounts']['row_count']))
        con.execute('create or replace table ingestion.tables (source_table_key varchar, relation_prefix varchar, jurisdiction_code varchar, fiscal_year integer, document_kind varchar, direction varchar, table_id varchar, account_name varchar, origin_id varchar, notes varchar, nodes_row_count bigint, amounts_row_count bigint)')
        con.executemany('insert into ingestion.tables values (?,?,?,?,?,?,?,?,?,?,?,?)', tables)
        con.execute('create or replace table ingestion.origin (origin_id varchar, jurisdiction_code varchar, fiscal_year integer, document_kind varchar, amendment_number integer, title varchar, url varchar, format varchar, sha256 varchar)')
        con.executemany('insert into ingestion.origin values (?,?,?,?,?,?,?,?,?)', list(origins.values()))
        con.commit()
    return {'warehouse': str(warehouse), 'tables': len(tables), 'origins': len(origins),
            'nodes': sum(t[-2] for t in tables), 'amounts': sum(t[-1] for t in tables)}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--candidate-dir', type=Path, help='Read validated candidates instead of saved objects')
    parser.add_argument('--remote', action='store_true', help='Restore missing saved objects with cf (read only)')
    parser.add_argument('--build', action='store_true', help='Build and test the settlement marts after preparation')
    args = parser.parse_args()
    if args.remote and args.candidate_dir:
        parser.error('--remote and --candidate-dir are mutually exclusive')
    # Resolve the same profile path as dbt (relative to its project directory).
    profile = yaml.safe_load((DBT / 'profiles.yml').read_text())['fudoki']['outputs']['dev']
    warehouse = (DBT / profile['path']).resolve()
    candidate = args.candidate_dir.resolve() if args.candidate_dir else None
    result = prepare(warehouse, candidate, remote=args.remote)
    if args.build:
        subprocess.run(['dbt', 'build', '--project-dir', str(DBT), '--profiles-dir', str(DBT),
                        '--select', '+settlement_expenditure_node', '+settlement_expenditure_moku', '+origin', 'cofog_master'],
                       cwd=DBT, stdout=sys.stderr, check=True)
        result['dbt_build'] = 'passed'
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    main()
