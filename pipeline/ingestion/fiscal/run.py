"""Schema-validated CSV/PDF conversion, private storage and bounded summaries."""
from __future__ import annotations

import argparse
from copy import deepcopy
import importlib.util
import json
from pathlib import Path

import duckdb

from ingestion.fiscal import manifest
from ingestion.fiscal.storage import fetch, save, cleanup, verify
from ingestion.paths import BUILD
from ingestion.lib import node_tables, jev_recheck

MATCH, MISMATCH, NOT_APPLICABLE = '一致', '不一致', '対象外'


def inspect_table(path: Path, metadata: dict | None = None) -> int:
    with duckdb.connect() as con:
        count = con.execute('select count(*) from read_parquet(?, hive_partitioning=false)', [str(path)]).fetchone()[0]
        columns = con.execute('describe select * from read_parquet(?, hive_partitioning=false)', [str(path)]).fetchall()
    if len({row[0] for row in columns}) != len(columns):
        raise ValueError('Duplicate Parquet column')
    if metadata is not None:
        manifest.validate_metadata(metadata, [row[0] for row in columns])
    return count


def originals(path: Path, output: Path, *, remote: bool = False) -> dict:
    document = manifest.read(path)
    selection = manifest.selection_for(document)
    files = {}
    for conversion in document['conversions']:
        for item in manifest.resolved_inputs(document, conversion, selection):
            if item['sha256'] not in files:
                files[item['sha256']] = str(fetch(item, remote=remote))
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open('x') as stream:
        json.dump(files, stream, ensure_ascii=False, indent=2)
        stream.write('\n')
    return {'originals': len(files), 'inputs': str(output)}


def table_receipt(document: dict, conversion: dict, table_id: str, path: Path, *, input_fingerprint: str | None = None,
                  metadata: dict | None = None) -> dict:
    fingerprint = input_fingerprint or manifest.fingerprint(document, conversion)
    sha = manifest.sha_file(path)
    previous = next((table for table in document['tables'] if table['table_id'] == table_id), None)
    if metadata is None and previous is not None and 'metadata' in previous:
        if previous['input_fingerprint'] != fingerprint or previous['object']['sha256'] != sha:
            raise ValueError('Changed annotated table requires metadata from its converter')
        metadata = previous['metadata']
    count = inspect_table(path, metadata)
    if count == 0:
        raise ValueError('Empty output is not supported')
    result = {'table_id': table_id, 'conversion_id': conversion['id'],
            'input_fingerprint': fingerprint,
            'object': {'key': manifest.object_key(document, table_id),
                       'sha256': sha, 'bytes': path.stat().st_size},
            'row_count': count}
    if metadata is not None:
        result['metadata'] = deepcopy(metadata)
    return result



def pdf_account(document: dict, conversion: dict, nodes: list[dict]) -> str:
    inputs = manifest.resolved_inputs(document, conversion)
    accounts = {scope['account'] for item in inputs for scope in item['scope']}
    account = conversion['options'].get('account')
    if account is None and len(accounts) == 1:
        account = next(iter(accounts))
    if account is None:
        pages = {node['physical_page'] for node in nodes if node['physical_page'] is not None}
        matches = {scope['account'] for item in inputs for scope in item['scope']
                   if pages and pages <= {p for first, last in scope.get('pages', [])
                                          for p in range(first, last + 1)}}
        if len(matches) == 1:
            account = next(iter(matches))
    if account not in accounts:
        raise ValueError('PDF table needs one account from selected input scopes')
    return account


def complete_subject_rows(rows: list[dict], siblings: list[list[dict]]) -> list[dict]:
    """Include printed subjects with no explanation using the same account's detail table.

    No branch or amount is invented: copy only already-extracted 款・項・目 cells.
    The declared grains deduplicate repeated ancestor cells during migration.
    """
    columns = list(rows[0]) if rows else []
    additions = [{c: row.get(c) if c.startswith(('款_', '項_', '目_')) else None for c in columns}
                 for sibling in siblings for row in sibling]
    return [*rows, *additions]


def node_receipt(document: dict, conversion: dict, table_id: str, tables: node_tables.NodeTables,
                 output: Path, *, input_fingerprint: str | None = None, notes: list[str] | None = None) -> tuple[dict, dict]:
    account = pdf_account(document, conversion, tables.nodes)
    paths = node_tables.write_tables(output, table_id, tables, document['target']['document_kind'])
    receipt = {'table_id': table_id, 'conversion_id': conversion['id'],
               'input_fingerprint': input_fingerprint or manifest.fingerprint(document, conversion),
               'account': account, 'notes': [*(notes or []), node_tables.MIGRATION_NOTE],
               'unread_amount_count': tables.unread_amount_count,
               'unresolved_parent_count': tables.unresolved_parent_count}
    for kind, path in paths.items():
        receipt[kind] = {'object': {'key': manifest.object_key(document, table_id, kind),
                                   'sha256': manifest.sha_file(path), 'bytes': path.stat().st_size},
                         'row_count': inspect_table(path)}
    return receipt, paths

def unchanged_legacy_receipt(document: dict, conversion: dict, table_id: str, file: Path,
                             fingerprint: str, *, remote: bool) -> dict:
    """Retain a failed migration only when its wide bytes match the saved object."""
    previous = next((t for t in document['tables'] if t['table_id'] == table_id), None)
    if previous is None or 'nodes' in previous or previous['conversion_id'] != conversion['id']:
        raise ValueError(f'Failed node migration has no saved legacy table: {table_id}')
    verify(file, previous['object'])
    verify(fetch(previous['object'], remote=remote), previous['object'])
    receipt = deepcopy(previous)
    receipt['input_fingerprint'] = fingerprint
    return receipt

def coverage_peers(document: dict, converted: dict) -> dict:
    """Match all adopted tables from the same original, across conversions.

    Every PDF table currently comes from one original. Physical page numbers
    are meaningful only within that original, never across different PDFs.
    """
    groups, origins = {}, {}
    for conversion in document['conversions']:
        identifiers = [item['table_id'] for item in conversion['expected_tables']
                       if item['table_id'] in converted]
        if not identifiers:
            continue
        inputs = conversion['inputs']
        if len(inputs) != 1:
            raise ValueError('Coverage requires an unambiguous original for each table')
        origin = inputs[0]['sha256']
        for ident in identifiers:
            origins[ident] = origin
            groups.setdefault(origin, []).append(converted[ident])
    pooled = {origin: node_tables.combine_coverage_tables(items) for origin, items in groups.items()}
    return {ident: pooled[origin] for ident, origin in origins.items()}


def convert(path: Path, local_files: dict[str, str], output: Path, *, remote: bool = False,
            conversion_ids: list[str] | None = None, extend_plan: Path | None = None) -> dict:
    document = manifest.read(path)
    original_bytes = None
    if extend_plan is not None:
        original_bytes = path.read_bytes()
        if json.loads(original_bytes) != document:
            raise ValueError('Saved manifest changed while preparing extension')
        plan = manifest.validate(json.loads(extend_plan.read_text()), path=path)
        old = document['conversions']
        if (plan['target'] != document['target'] or plan['direction'] != document['direction']
                or plan['tables'] or len(plan['conversions']) != len(old) + 1
                or plan['conversions'][:-1] != old):
            raise ValueError('Extension must append one conversion to the same target/direction with unchanged definitions and tables=[]')
        added = plan['conversions'][-1]
        if len(added['expected_tables']) != 1:
            raise ValueError('Extension requires exactly one new expected table')
        if conversion_ids is not None and conversion_ids != [added['id']]:
            raise ValueError('Extension conversion selection must be the one new ID')
        manifest.require_current(document)
        retained_tables = deepcopy(document['tables'])
        document = deepcopy(plan)
        document['tables'] = retained_tables
        conversion_ids = [added['id']]
    selection = manifest.selection_for(document)
    all_ids = {conversion['id'] for conversion in document['conversions']}
    chosen = set(conversion_ids) if conversion_ids is not None else all_ids
    if not chosen or not chosen <= all_ids:
        raise ValueError('Unknown or empty conversion selection')
    before = manifest.fingerprints(document)
    output.mkdir(parents=True, exist_ok=False)
    outputs = {}
    tables = []
    pending_pdf = []
    coverage_failures = []
    adopted = {}
    checked_pdf = []
    for conversion in document['conversions']:
        if conversion['id'] not in chosen:
            retained = [table for table in document['tables'] if table['conversion_id'] == conversion['id']]
            if {table['table_id'] for table in retained} != {item['table_id'] for item in conversion['expected_tables']}:
                raise ValueError('Partial conversion cannot omit unsaved expected tables')
            for table in retained:
                if table['input_fingerprint'] != before[conversion['id']]:
                    raise ValueError('An untouched table is stale; include its conversion')
                for kind, reference in manifest.storage_references(table).items():
                    stored = fetch(reference['object'], remote=remote)
                    if extend_plan is not None:
                        verify(stored, reference['object'])
                    if kind in manifest.auxiliary_references(table):
                        continue
                    count = inspect_table(stored, table.get('metadata'))
                    if extend_plan is not None and count != reference['row_count']:
                        raise ValueError('Retained table row count differs from its receipt')
            for table in retained:
                if 'nodes' in table:
                    adopted[table['table_id']] = node_tables.NodeTables(
                        node_tables.read_rows(fetch(table['nodes']['object'], remote=remote)),
                        node_tables.read_rows(fetch(table['amounts']['object'], remote=remote)))
            tables.extend(retained)
            continue
        inputs = manifest.resolved_inputs(document, conversion, selection)
        for item in inputs:
            source = Path(local_files[item['sha256']])
            if manifest.sha_file(source) != item['sha256']:
                raise ValueError('Supplied original differs from the selected byte identity')
            item['path'] = source
            item['target'] = document['target']
            item['direction'] = document['direction']
        code = manifest.code_path(conversion['converter'])
        spec = importlib.util.spec_from_file_location('ingestion_converter_' + conversion['id'], code)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        destination = output
        if {item['format'] for item in inputs} == {'pdf'}:
            # Several account conversions may use the same observation filenames.
            destination = output / conversion['id']
            destination.mkdir()
        generated = module.convert(inputs, destination, conversion['options'])
        expected = {item['table_id'] for item in conversion['expected_tables']}
        if not isinstance(generated, dict) or not expected <= set(generated):
            raise ValueError('Converter did not produce all its declared tables')
        # expected_tables is the registry's allowlist; auxiliary outputs are not adopted.
        generated = {ident: generated[ident] for ident in generated if ident in expected}
        prepared = {}
        for ident, file in generated.items():
            metadata = None
            if isinstance(file, dict):
                if 'path' not in file or set(file).difference({'path', 'metadata'}):
                    raise ValueError('Converter table descriptor requires path and optional metadata only')
                metadata = file.get('metadata')
                if 'metadata' in file and metadata is None:
                    raise ValueError('Converter metadata must be an object')
                file = file['path']
            file = Path(file)
            if not file.resolve().is_relative_to(output.resolve()) or file.is_symlink():
                raise ValueError('Converter output is outside the candidate directory')
            prepared[ident] = (file, metadata)
        if {item['format'] for item in inputs} == {'pdf'}:
            for ident, (file, metadata) in prepared.items():
                inspect_table(file, metadata)
                rows = node_tables.read_rows(file)
                # Conversions may separate details and notes for the same account.
                try:
                    initial = node_tables.migrate_rows(rows, metadata or {})
                except ValueError:
                    tables.append(unchanged_legacy_receipt(document, conversion, ident, file,
                                  before[conversion['id']], remote=remote))
                    outputs[ident] = file
                    continue
                account = pdf_account(document, conversion, initial.nodes)
                pending_pdf.append((conversion, ident, rows, metadata, account, file))
        else:
            for ident, (file, metadata) in prepared.items():
                outputs[ident] = file
                tables.append(table_receipt(document, conversion, ident, file,
                                            input_fingerprint=before[conversion['id']], metadata=metadata))
    for conversion, ident, rows, metadata, account, file in pending_pdf:
        siblings = [other_rows for _, other_ident, other_rows, _, other_account, _ in pending_pdf
                    if other_ident != ident and other_account == account]
        rows = complete_subject_rows(rows, siblings)
        try:
            migrated = node_tables.migrate_rows(rows, metadata or {})
        except ValueError:
            migrated = None
        checked = node_tables.check_tree(migrated.nodes, migrated.amounts, document['target']['document_kind']) if migrated else {'passed': False}
        if (migrated is None or not migrated.nodes or not migrated.amounts or migrated.issues or migrated.unread_amount_count
                or migrated.unresolved_parent_count or not checked['passed']):
            tables.append(unchanged_legacy_receipt(document, conversion, ident, file,
                          before[conversion['id']], remote=remote))
            outputs[ident] = file
            continue
        adopted[ident] = migrated
        checked_pdf.append((conversion, ident, migrated, metadata, file))
    peers = coverage_peers(document, adopted)
    jev_entries = {}
    for conversion, ident, migrated, metadata, file in checked_pdf:
        inputs = manifest.resolved_inputs(document, conversion, selection)
        text_only = all(item['format'] == 'pdf' and item.get('pdf_type') == 'text' for item in inputs)
        try:
            scope_path = node_tables.coverage_sidecar(file)
            if scope_path.is_file():
                scope = json.loads(scope_path.read_text())
                coverage = node_tables.check_digit_coverage(
                    scope['words'], peers[ident], control_tables=[adopted[ident]],
                    exclusions=scope.get('excluded_regions', ()),
                    amount_columns=scope.get('amount_columns', ()))
                jev_path = jev_recheck.sidecar(file)
                jev = jev_recheck.recheck(scope['words'], coverage, jev_path, allow_api=True, scope=scope, shared_entries=jev_entries)
                report_path = file.with_name(file.stem + '.coverage-uncovered.json')
                report_path.write_text(json.dumps({**coverage, 'jev': jev}, ensure_ascii=False) + '\n')
                if not jev['passed']:
                    raise ValueError(f"Digit coverage: {len(coverage['uncovered'])} blocked; "
                                     f"Jev: {len(jev['stopped'])} additional stops; details: {report_path}")
            else:
                node_tables.check_table_coverage(file, peers[ident], require=text_only,
                                                 control_tables=[adopted[ident]])
        except ValueError as error:
            coverage_failures.append(f'{ident}: {error}')
            continue
        receipt, pair = node_receipt(document, conversion, ident, migrated, output,
                                     input_fingerprint=before[conversion['id']],
                                     notes=[n['text'] for n in (metadata or {}).get('notes', [])])
        jev_path = jev_recheck.sidecar(file)
        if jev_path.is_file():
            receipt['jev'] = {'object': {'key': manifest.object_key(document, ident, 'jev'),
                                       'sha256': manifest.sha_file(jev_path), 'bytes': jev_path.stat().st_size}}
            pair['jev'] = jev_path
        outputs[ident] = pair
        tables.append(receipt)
    if coverage_failures:
        raise ValueError('Digit coverage failed:\n' + '\n'.join(coverage_failures))
    result = deepcopy(document)
    result['tables'] = tables
    manifest.validate(result)
    used_originals = {item['sha256'] for conversion in document['conversions']
                      if conversion['id'] in chosen for item in conversion['inputs']}
    for sha in sorted(used_originals):
        if manifest.sha_file(Path(local_files[sha])) != sha:
            raise ValueError('Supplied original changed during conversion')
    if before != manifest.fingerprints(result):
        raise ValueError('Input conditions changed during conversion')
    candidate = output / 'manifest.json'
    # Candidate is not a saved manifest; it stays outside the Git registry.
    candidate.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    if remote:
        if original_bytes is not None and path.read_bytes() != original_bytes:
            raise ValueError('Saved manifest changed before extension upload')
        for table in tables:
            if table['conversion_id'] not in chosen:
                continue
            save(result, table, outputs[table['table_id']], remote=True)
        manifest.require_current(result)
        if original_bytes is not None and path.read_bytes() != original_bytes:
            raise ValueError('Saved manifest changed before extension registration')
        manifest.write(path, result)
        # Deletion is always a separate operation, including legacy-only documents.
    return {'status': 'saved' if remote else 'candidate', 'tables': len(tables),
            'rows': sum(r['row_count'] for t in tables for r in manifest.table_references(t).values()), 'candidate': str(candidate)}


def verify_sums(document: dict, locate) -> list[dict]:
    """Tree checks of every PDF table; ``locate(table)`` gives its verified Parquet."""
    selection = manifest.selection_for(document)
    formats = {conversion['id']: {item['format'] for item in manifest.resolved_inputs(document, conversion, selection)}
               for conversion in document['conversions']}
    results = []
    for table in document['tables']:
        if formats[table['conversion_id']] == {'csv'}:
            results.append({'table_id': table['table_id'], 'status': NOT_APPLICABLE,
                            'reason': 'CSVは変換時の全セル保持検査で確認する',
                            'counts': {}, 'checks': [], 'results': []})
            continue
        pair = locate(table)
        checked = node_tables.check_tree(node_tables.read_rows(pair['nodes']), node_tables.read_rows(pair['amounts']), document['target']['document_kind'])
        passed = (checked['passed'] and not table['unread_amount_count'] and not table['unresolved_parent_count'])
        results.append({'table_id': table['table_id'], 'status': MATCH if passed else MISMATCH,
                        'counts': checked['counts'], 'issues': checked['issues'], 'checks': [],
                        'results': checked['results']})
    return results


def candidate_locator(directory: Path):
    """Find candidate Parquet files by the SHA-256 recorded in the candidate manifest."""
    by_sha = {manifest.sha_file(path): path for path in directory.rglob('*.parquet') if not path.is_symlink()}

    def locate(table: dict):
        found = {}
        for kind, reference in manifest.table_references(table).items():
            if reference['object']['sha256'] not in by_sha:
                raise FileNotFoundError(f'Candidate Parquet missing: {table["table_id"]}')
            found[kind] = by_sha[reference['object']['sha256']]
        return found if 'nodes' in table else found[None]
    return locate


def verify_coverage(document: dict, locate, directory, *, remote=False) -> dict:
    """Replay digit coverage and Jev from candidate/saved evidence without API calls.

    Older saved tables lack the evidence sidecar and retain their tree-only check.
    Every peer from the same original participates, including older peers.
    """
    outcome = {}
    adopted = {}
    for table in document['tables']:
        if 'nodes' in table and (directory is not None or any('jev' in t for t in document['tables'])):
            try:
                pair = locate(table)
                adopted[table['table_id']] = node_tables.NodeTables(
                    node_tables.read_rows(pair['nodes']), node_tables.read_rows(pair['amounts']))
            except Exception as error:
                outcome[table['table_id']] = {'status': MISMATCH, 'reason': str(error) or type(error).__name__}
    peers = coverage_peers(document, adopted)
    for table in document['tables']:
        if 'nodes' not in table or (directory is None and 'jev' not in table) or table['table_id'] in outcome:
            continue
        sidecars = sorted(directory.rglob(table['table_id'] + node_tables.COVERAGE_SIDECAR_SUFFIX)) if directory else []
        if not sidecars and 'jev' not in table:
            outcome[table['table_id']] = {'status': NOT_APPLICABLE, 'reason': '網羅検査の対象範囲がない'}
            continue
        try:
            if directory is None:
                jev_path = fetch(table['jev']['object'], remote=remote)
                cache = jev_recheck.load_cache(jev_path)
                scope = jev_recheck.cached_scope(cache)
            else:
                if len(sidecars) > 1:
                    raise ValueError('Ambiguous coverage scopes for candidate table')
                cache_paths = sorted(directory.rglob(table['table_id'] + jev_recheck.SIDECAR_SUFFIX))
                if len(cache_paths) != 1:
                    raise ValueError('Jev cache missing or ambiguous for candidate table')
                jev_path = cache_paths[0]
                if 'jev' in table:
                    verify(jev_path, table['jev']['object'])
                cache = jev_recheck.load_cache(jev_path)
                scope = json.loads(sidecars[0].read_text()) if sidecars else jev_recheck.cached_scope(cache)
                if 'scope' in cache and jev_recheck.digest(scope) != jev_recheck.digest(cache['scope']):
                    raise ValueError('Jev cached scope differs from candidate coverage scope')
            result = node_tables.check_digit_coverage(
                scope['words'], peers[table['table_id']], control_tables=[adopted[table['table_id']]],
                exclusions=scope.get('excluded_regions', ()),
                amount_columns=scope.get('amount_columns', ()))
            jev = jev_recheck.recheck(scope['words'], result, jev_path, cache=cache)
            outcome[table['table_id']] = {'status': MATCH if jev['passed'] else MISMATCH,
                                          'jev': jev,
                                          'counts': result['counts'],
                                          'uncovered': result['uncovered'][:10],
                                          'reported': result['reported'][:10],
                                          'bands_from': result['bands_from'],
                                          'exclusions': result['exclusions'],
                                          'elapsed': result['elapsed']}
        except Exception as error:
            outcome[table['table_id']] = {'status': MISMATCH, 'reason': str(error) or type(error).__name__}
    return outcome


def verify_report(path: Path, document: dict, results: list[dict], output: Path) -> dict:
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps({'manifest': str(path), 'target': document['target'], 'direction': document['direction'],
                                  'tables': results}, ensure_ascii=False, indent=1, default=str) + '\n')
    return {'manifest': str(path), 'output': str(output),
            'tables': {item['table_id']: {'status': item['status'], **item['counts']} for item in results}}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    sub.add_parser('schema')
    origin = sub.add_parser('originals', help='Restore selected originals and write a local input-path map')
    origin.add_argument('--manifest', type=Path, required=True)
    origin.add_argument('--output', type=Path, required=True)
    origin.add_argument('--remote', action='store_true')
    check = sub.add_parser('check')
    check.add_argument('--manifest', type=Path)
    run = sub.add_parser('convert')
    run.add_argument('--manifest', type=Path, required=True)
    run.add_argument('--inputs', type=Path, required=True, help='JSON: original SHA-256 to local file path')
    run.add_argument('--output', type=Path, required=True)
    run.add_argument('--remote', action='store_true')
    run.add_argument('--conversion', action='append', help='Re-run these conversion IDs, preserving all untouched tables')
    run.add_argument('--extend-plan', type=Path,
                     help='JSON in the existing manifest schema: same target/direction, unchanged existing conversions plus one new conversion/table, tables=[]. Retains verified saved tables and converts/uploads only the new table; registers only after full success. Local mode writes the candidate only.')
    restore = sub.add_parser('restore')
    restore.add_argument('--manifest', type=Path, required=True)
    restore.add_argument('--remote', action='store_true')
    check_sums = sub.add_parser('verify', help='Hierarchy sum checks of saved or candidate PDF tables; details go to files')
    check_sums.add_argument('--manifest', type=Path, action='append', help='Saved manifest(s); default: all')
    check_sums.add_argument('--candidate', type=Path, help='Candidate directory from convert (uses its manifest.json)')
    check_sums.add_argument('--output', type=Path, help='Detail directory (default: .build/ingestion-verify)')
    check_sums.add_argument('--remote', action='store_true', help='Restore missing saved tables from R2')
    clean = sub.add_parser('cleanup')
    clean.add_argument('--manifest', type=Path, required=True)
    args = parser.parse_args()
    if args.command == 'schema':
        print(manifest.SCHEMA.read_text())
    elif args.command == 'check':
        paths = [args.manifest] if args.manifest else manifest.paths()
        count = ready = tables = 0
        for path in paths:
            document = manifest.read(path)
            for conversion in document['conversions']:
                manifest.resolved_inputs(document, conversion)
            if document['tables']:
                manifest.require_current(document)
                ready += 1
            count += 1
            tables += len(document['tables'])
        print(json.dumps({'valid': True, 'manifests': count, 'ready': ready, 'saved_tables': tables}))
    elif args.command == 'originals':
        print(json.dumps(originals(args.manifest, args.output, remote=args.remote)))
    elif args.command == 'convert':
        print(json.dumps(convert(args.manifest, json.loads(args.inputs.read_text()), args.output,
                                 remote=args.remote, conversion_ids=args.conversion, extend_plan=args.extend_plan)))
    elif args.command == 'verify':
        output = args.output or BUILD / 'ingestion-verify'
        if args.candidate is not None:
            if args.manifest:
                raise ValueError('Use either --candidate or --manifest')
            document = manifest.validate(json.loads((args.candidate / 'manifest.json').read_text()))
            runs = [(args.candidate / 'manifest.json', document, candidate_locator(args.candidate))]
        else:
            runs = []
            for path in args.manifest or manifest.paths():
                document = manifest.read(path)
                runs.append((path, document, lambda table: ({kind: fetch(ref['object'], remote=args.remote)
                    for kind, ref in manifest.table_references(table).items()} if 'nodes' in table
                    else fetch(table['object'], remote=args.remote))))
        summary = {}
        failed = False
        for path, document, locate in runs:
            target = document['target']
            name = f'{target["jurisdiction"]}-{target["fiscal_year"]}-{manifest.document_slot(target)}-{document["direction"]}'
            results = verify_sums(document, locate)
            coverage = verify_coverage(document, locate, args.candidate, remote=args.remote)
            for item in results:
                if item['table_id'] in coverage:
                    item['coverage'] = coverage[item['table_id']]
            print(json.dumps(verify_report(path, document, results, output / f'{name}.json'), ensure_ascii=False))
            for item in results:
                summary[item['status']] = summary.get(item['status'], 0) + 1
                failed |= item['status'] == MISMATCH
                # Candidate and saved evidence replays stop on either check.
                failed |= item.get('coverage', {}).get('status') == MISMATCH
        print(json.dumps({'manifests': len(runs), 'tables': summary}, ensure_ascii=False))
        raise SystemExit(1 if failed else 0)
    elif args.command == 'restore':
        document = manifest.read(args.manifest)
        manifest.require_current(document)
        for table in document['tables']:
            for kind, reference in manifest.storage_references(table).items():
                restored = fetch(reference['object'], remote=args.remote)
                if kind in manifest.auxiliary_references(table):
                    continue
                if inspect_table(restored, table.get('metadata')) != reference['row_count']:
                    raise ValueError('Restored table row count differs from receipt')
        print(json.dumps({'restored': len(document['tables'])}))
    else:
        print(json.dumps({'removed': cleanup(manifest.read(args.manifest))}))


if __name__ == '__main__':
    main()
