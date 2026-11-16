"""Convert the manifests changed since a commit with main's code and store the tables that pass the save gate
(docs/prd/ingestion-receipts/dd.md, stage 3).

A saved manifest declares its conversions; the tables are in R2 and the receipts list (`fiscal/ingestion/
receipts.json`) points at them. After merge, every conversion of a changed manifest whose tables the list lacks,
or holds under another declaration or a stale fingerprint, is converted from the originals and OCR observations
in R2 and checked by the save gate. Then, per table:

- the declaration changed (or the table is new): the table is stored as main converts it, and the difference
  from the previous table is reported. A converter merged after the pull request's check no longer stops this.
- the declaration is the same and only the fingerprint is stale: identical content only refreshes the
  fingerprint. Different content (converter drift brought along by a change elsewhere in the manifest) is
  stored and reported as ``drifted``. Manifests nobody touches are compared by `ingestion:refresh`.

A manifest that fails (a save gate, a missing Jev answer) stores nothing (its receipts stay); the others are stored and the job fails afterwards.
Parquet keys hold the content sha, so an upload never overwrites a table a build may be reading, and only the
parent process writes the list, once, at the end.

The Jev answers are read from Git and never asked (no API key in CI). ``dry_run`` (a pull request's check)
uploads nothing and writes `PENDING` instead: the receipts the build overlays on the list, whose tables are in
the local object cache.
"""
from __future__ import annotations

from concurrent.futures import ProcessPoolExecutor
import json
import multiprocessing
import subprocess
import sys
import tempfile
from pathlib import Path

from ingestion.fiscal import manifest, refresh, run, storage, unit_checks
from ingestion.lib import node_tables
from ingestion.paths import BUILD, PIPELINE

# The receipts a pull request's check converted, which `prepare.py --remote` overlays on the receipts list.
PENDING = BUILD / 'pending-receipts.json'


def previous(path: Path, since: str) -> dict:
    relative = path.resolve().relative_to(PIPELINE.parent.resolve())
    shown = subprocess.run(['git', 'show', f'{since}:{relative.as_posix()}'], capture_output=True, text=True)
    return json.loads(shown.stdout) if shown.returncode == 0 else {'conversions': []}


def declared(before: dict, document: dict) -> set[str]:
    """Conversions new or changed (inputs, options, expected tables) since ``before``."""
    previous_conversions = {conversion['id']: conversion for conversion in before.get('conversions', [])}
    return {conversion['id'] for conversion in document['conversions']
            if previous_conversions.get(conversion['id']) != conversion}


def changed_manifests(since: str) -> list[Path]:
    names = subprocess.run(['git', 'diff', '--name-only', since, 'HEAD', '--', '.'], cwd=PIPELINE.parent,
                           check=True, capture_output=True, text=True).stdout.split()
    current = {path.resolve() for path in manifest.paths()}
    return sorted(path for path in (PIPELINE.parent / name for name in names) if path.resolve() in current)


def shas(table: dict) -> dict:
    return {str(kind): reference['object']['sha256'] for kind, reference in manifest.table_references(table).items()}


def to_convert(document: dict, listed: dict[str, dict], fingerprints: dict[str, str]) -> list[str]:
    """Conversions whose tables the list lacks or holds under another declaration or fingerprint."""
    chosen = []
    for conversion in document['conversions']:
        declaration = manifest.declaration(document, conversion)
        for table in conversion['expected_tables']:
            stored = listed.get(storage.receipt_id(document, table['table_id']))
            if (stored is None or stored.get('conversion_id') != conversion['id']
                    or stored['input_fingerprint'] != fingerprints[conversion['id']]
                    or stored.get('declaration', declaration) != declaration):
                chosen.append(conversion['id'])
                break
    return chosen


def store_manifest(path: Path, since: str, listed: dict[str, dict], *, dry_run: bool) -> dict:
    """The new receipts of one manifest (receipt ID to receipt), uploaded unless ``dry_run``; raises when any
    table of it may not be stored."""
    document = manifest.read(path)
    stored = storage.attach(document, listed)
    fingerprints = manifest.fingerprints(document)
    conversions = to_convert(document, listed, fingerprints)
    if not conversions:
        return {'manifest': str(path), 'tables': [], 'receipts': {}}
    # Receipts without a declaration predate it (the Git records): their declaration changed when Git says so.
    changed = declared(previous(path, since), document)
    by_id = {table['table_id']: table for table in stored['tables']}
    originals = run.original_files(document, remote=True, conversion_ids=set(conversions))
    with tempfile.TemporaryDirectory(prefix='ingestion-store-') as directory:
        output = Path(directory) / 'candidate'
        result = run.convert(path, originals, output, remote=True, record=False, conversion_ids=conversions,
                             persist_answers=False, ask_answers=False,
                             retained=[table for table in stored['tables'] if table['conversion_id'] not in conversions])
        candidate = json.loads(Path(result['candidate']).read_text())
        receipts, placed, refreshed, drifted = {}, [], [], []
        uploads = []
        for table in candidate['tables']:
            if table['conversion_id'] not in conversions:
                continue
            ident = table['table_id']
            conversion = next(c for c in document['conversions'] if c['id'] == table['conversion_id'])
            before = by_id.get(ident)
            files = {kind: Path(result['files'][reference['object']['key']])
                     for kind, reference in manifest.table_references(table).items()}
            storage.prepare_save(candidate, table, files[None] if None in files else files,
                                 scope=unit_checks.find_scope(output, ident, node_tables.COVERAGE_SIDECAR_SUFFIX))
            if before is not None and shas(before) == shas(table):
                # The same bytes: only the fingerprint and declaration are refreshed; the object stays.
                receipts[storage.receipt_id(document, ident)] = {**before, 'input_fingerprint': table['input_fingerprint'],
                                                                 'declaration': table['declaration']}
                refreshed.append(ident)
                continue
            new_declaration = (before is None or before.get('conversion_id') != conversion['id']
                               or before.get('declaration', None if conversion['id'] in changed
                                             else table['declaration']) != table['declaration'])
            if not new_declaration:
                # Converter drift a change elsewhere in the manifest brought along (the thread converted the
                # whole manifest and saw it); reported, since no declaration explains it.
                drifted.append(ident)
            receipts[storage.receipt_id(document, ident)] = table
            placed.append(ident)
            uploads += [(reference['object']['key'], files[kind], reference['object'])
                        for kind, reference in manifest.table_references(table).items()]
        for key, file, reference in uploads:
            storage.verify(file, reference)
        # The cache then holds the tables at their keys, so the dbt build that follows reads them without
        # fetching. An upload caches only after it succeeds: a table must not be cached that R2 lacks.
        for key, file, reference in uploads:
            if not dry_run:
                storage.upload(key, file, reference)
            storage.cache(key, file)
    return {'manifest': str(path), 'tables': sorted(placed + refreshed), 'placed': placed, 'refreshed': refreshed,
            'drifted': drifted, 'receipts': receipts}


def updated_receipts(listed: dict[str, dict], reports: list[dict]) -> dict[str, dict]:
    """The list with the new receipts, without the tables no manifest declares any more (a deleted or renamed
    manifest, a dropped expected table)."""
    receipts = dict(listed)
    for report in reports:
        receipts.update(report['receipts'])
    declared_ids = {storage.receipt_id(document, table['table_id'])
                    for document in (manifest.read(path, check_code=False) for path in manifest.paths())
                    for conversion in document['conversions'] for table in conversion['expected_tables']}
    return {ident: receipt for ident, receipt in receipts.items() if ident in declared_ids}


def store_group(paths: list[Path], since: str, listed: dict[str, dict], dry_run: bool) -> list[tuple[Path, dict | str]]:
    """Each manifest's report, or its error as text (a worker reports every manifest, then the caller fails)."""
    outcomes: list[tuple[Path, dict | str]] = []
    for path in paths:
        try:
            outcomes.append((path, store_manifest(path, since, listed, dry_run=dry_run)))
        except Exception as error:
            outcomes.append((path, str(error) or type(error).__name__))
    return outcomes


def store(since: str, *, dry_run: bool = False) -> dict:
    paths = changed_manifests(since)
    listed = storage.read_receipts() or {}
    # Manifests are converted in parallel processes, sized like `refresh` (manifests that read the same
    # original stay in one process, since its observation cache is written without a lock).
    groups = refresh.groups_of(paths)
    jobs = min(refresh.auto_jobs(), len(groups))
    if jobs <= 1:
        outcomes = [outcome for group in groups for outcome in store_group(group, since, listed, dry_run)]
    else:
        # spawn, not fork: DuckDB and the converters hold threads and file handles a forked child must not share.
        with ProcessPoolExecutor(max_workers=jobs, mp_context=multiprocessing.get_context('spawn')) as pool:
            futures = [pool.submit(store_group, group, since, listed, dry_run) for group in groups]
            outcomes = [outcome for future in futures for outcome in future.result()]
    found = dict(outcomes)
    reports = [found[path] for path in paths if isinstance(found[path], dict)]
    failures = [found[path] for path in paths if isinstance(found[path], str)]
    pending = {ident: receipt for report in reports for ident, receipt in report['receipts'].items()}
    if dry_run:
        PENDING.parent.mkdir(parents=True, exist_ok=True)
        PENDING.write_text(json.dumps(pending, ensure_ascii=False, sort_keys=True) + '\n')
    else:
        # Only this (parent) process writes the list, once, after every upload. It is read again first, so a
        # concurrent writer's entries (refresh) are kept.
        receipts = updated_receipts(storage.read_receipts() or {}, reports)
        if receipts != listed or pending:
            storage.write_receipts(receipts)
        print(json.dumps({'receipts': {'tables': len(receipts), 'written': len(pending)}}), file=sys.stderr, flush=True)
    if failures:
        raise SystemExit('\n'.join(failures))
    return {'since': since, 'dry_run': dry_run,
            'manifests': [{key: report[key] for key in ('manifest', 'placed', 'refreshed', 'drifted')}
                          for report in reports if report['tables']]}
