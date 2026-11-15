"""Upload the tables recorded in Git since a commit (ADR 0045).

A thread converts and records a table's sha256 and size in its manifest; the bytes stay on its machine.
After merge, CI re-converts each recorded table whose reference changed, from the originals and OCR
observations already in R2, and uploads it when the whole receipt (keys, sha256, sizes, row counts,
metadata) equals the record. The input fingerprint is not compared (a stale one is allowed, ADR 0027).

A pull request (``dry_run``) must match its records. After merge, a table whose conversion was declared or
changed in this range is uploaded as main converts it, even when it differs from the record: a converter
merged after the pull request's check makes the record stale, and the receipts list in R2 (which builds read
when the Git record is not in R2) then holds the uploaded table (docs/prd/ingestion-receipts/dd.md, stage 3).
A table whose declaration did not change must still match, so a converter regression is not uploaded unseen.

The Jev answers are read from Git and never asked (no API key in CI). A pull request builds dbt from the
verified tables left in the cache.
"""
from __future__ import annotations

from concurrent.futures import ProcessPoolExecutor
import json
import multiprocessing
import subprocess
import sys
import tempfile
from pathlib import Path

from ingestion.fiscal import manifest, refresh, run, storage
from ingestion.paths import PIPELINE


def references(document: dict) -> dict[str, dict]:
    """Table ID to its references, as recorded."""
    return {table['table_id']: {str(kind): reference for kind, reference in manifest.table_references(table).items()}
            for table in document.get('tables', [])}


def comparable(table: dict | None) -> dict | None:
    """A receipt without its input fingerprint: a stale fingerprint is allowed until `refresh` rewrites it
    (ADR 0027), while the bytes, sizes, row counts and metadata must match."""
    return None if table is None else {key: value for key, value in table.items() if key != 'input_fingerprint'}


def previous(path: Path, since: str) -> dict:
    relative = path.resolve().relative_to(PIPELINE.parent.resolve())
    shown = subprocess.run(['git', 'show', f'{since}:{relative.as_posix()}'], capture_output=True, text=True)
    return json.loads(shown.stdout) if shown.returncode == 0 else {'tables': []}


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


def stored(reference: dict) -> bool:
    """R2 already holds exactly the recorded bytes (fetch verifies sha256 and size)."""
    try:
        storage.fetch(reference, remote=True)
        return True
    except (ValueError, FileNotFoundError, subprocess.CalledProcessError):
        return False


def store_manifest(path: Path, since: str, *, dry_run: bool) -> dict:
    document = manifest.read(path)
    earlier = previous(path, since)
    before = references(earlier)
    recorded = {table['table_id']: table for table in document['tables']}
    changed = {ident for ident, refs in references(document).items() if before.get(ident) != refs}
    # Tables a thread uploaded before this flow, or a previous run already stored, are not converted again.
    changed = {ident for ident in changed if not all(stored(reference['object'])
                                                    for reference in manifest.table_references(recorded[ident]).values())}
    if not changed:
        return {'manifest': str(path), 'tables': []}
    # convert refuses to retain a stale table untouched, so stale conversions are re-read too (and not uploaded).
    current = manifest.fingerprints(document)
    stale = {table['conversion_id'] for table in document['tables'] if table['input_fingerprint'] != current[table['conversion_id']]}
    conversions = sorted({recorded[ident]['conversion_id'] for ident in changed} | stale)
    originals = run.original_files(document, remote=True, conversion_ids=set(conversions))
    with tempfile.TemporaryDirectory(prefix='ingestion-store-') as directory:
        result = run.convert(path, originals, Path(directory) / 'candidate', remote=True, record=False,
                             conversion_ids=conversions, persist_answers=False, ask_answers=False)
        candidate = {table['table_id']: table for table in json.loads(Path(result['candidate']).read_text())['tables']}
        differing = sorted(ident for ident in changed if comparable(candidate.get(ident)) != comparable(recorded[ident]))
        replaced = {}
        if differing:
            new_declarations = declared(earlier, document)
            refused = [ident for ident in differing if dry_run or recorded[ident]['conversion_id'] not in new_declarations]
            if refused:
                raise ValueError(f'{path}: re-converted tables differ from their records: {", ".join(refused)}')
            converted = json.loads(Path(result['candidate']).read_text())
            for ident in differing:
                table = candidate[ident]
                files = {kind: Path(result['files'][reference['object']['key']])
                         for kind, reference in manifest.table_references(table).items()}
                storage.prepare_save(converted, table, files[None] if None in files else files)
                replaced[ident] = table
        uploads = [(reference['object']['key'], Path(result['files'][reference['object']['key']]), reference['object'])
                   for ident in sorted(changed)
                   for reference in manifest.table_references(replaced.get(ident, recorded[ident])).values()]
        for key, file, reference in uploads:
            storage.verify(file, reference)
        # The cache then holds exactly the uploaded bytes, so the dbt build that follows reads them without
        # fetching from R2 (where a pull request's tables are not yet stored). An upload caches only after it
        # succeeds: `stored` trusts the cache, so a table must not be cached that R2 lacks.
        for key, file, reference in uploads:
            if not dry_run:
                storage.upload(key, file, reference)
            storage.cache(key, file)
    report = {'manifest': str(path), 'tables': sorted(changed), 'uploaded': not dry_run}
    if replaced:
        # Uploaded as main converts them, not as recorded in Git; the receipts list takes these.
        report['replaced'] = {storage.receipt_id(document, ident): table for ident, table in replaced.items()}
    return report


def mirrored(path: Path) -> tuple[dict, dict[str, dict]]:
    """A manifest's table records as receipts, keyed like the receipts list."""
    document = manifest.read(path)
    return document, {storage.receipt_id(document, table['table_id']): table for table in document['tables']}


def update_receipts(stored_paths: list[Path], replaced: dict[str, dict] | None = None) -> dict:
    """Mirror the Git records into the receipts list in R2 (stage 1 of docs/prd/ingestion-receipts/dd.md).

    The first run seeds it from every manifest, keeping only tables whose recorded bytes R2 holds. Later runs
    replace the entries of the manifests this run stored; a manifest that failed keeps its previous entries,
    since nothing of it was uploaded. ``replaced`` holds the tables uploaded as main converted them instead of
    as recorded in Git (their recorded bytes are not in R2)."""
    replaced = replaced or {}
    receipts = storage.read_receipts()
    seeded = receipts is None
    if seeded:
        receipts, stored_paths = {}, manifest.paths()
    else:
        # A deleted or renamed manifest leaves no path to walk, so its entries are dropped here.
        prefixes = tuple(storage.receipt_id(manifest.read(path), '') for path in manifest.paths())
        for ident in [ident for ident in receipts if not ident.startswith(prefixes)]:
            del receipts[ident]
    missing = []
    for path in stored_paths:
        document, records = mirrored(path)
        prefix = storage.receipt_id(document, '')
        for ident in [ident for ident in receipts if ident.startswith(prefix) and ident not in records]:
            del receipts[ident]
        for ident, table in records.items():
            if ident in replaced:
                receipts[ident] = replaced[ident]
                continue
            if not all(stored(reference['object']) for reference in manifest.table_references(table).values()):
                missing.append(ident)
                continue
            receipts[ident] = table
    storage.write_receipts(receipts)
    return {'seeded': seeded, 'tables': len(receipts), 'missing': missing}


def store_group(paths: list[Path], since: str, dry_run: bool) -> list[tuple[Path, dict | str]]:
    """Each manifest's report, or its error as text (a worker reports every manifest, then the caller fails)."""
    outcomes: list[tuple[Path, dict | str]] = []
    for path in paths:
        try:
            outcomes.append((path, store_manifest(path, since, dry_run=dry_run)))
        except Exception as error:
            outcomes.append((path, str(error) or type(error).__name__))
    return outcomes


def store(since: str, *, dry_run: bool = False) -> dict:
    paths = changed_manifests(since)
    # Manifests are re-converted in parallel processes, sized like `refresh` (manifests that read the same
    # original stay in one process, since its observation cache is written without a lock).
    groups = refresh.groups_of(paths)
    jobs = min(refresh.auto_jobs(), len(groups))
    if jobs <= 1:
        outcomes = [outcome for group in groups for outcome in store_group(group, since, dry_run)]
    else:
        # spawn, not fork: DuckDB and the converters hold threads and file handles a forked child must not share.
        with ProcessPoolExecutor(max_workers=jobs, mp_context=multiprocessing.get_context('spawn')) as pool:
            futures = [pool.submit(store_group, group, since, dry_run) for group in groups]
            outcomes = [outcome for future in futures for outcome in future.result()]
    found = dict(outcomes)
    reports = [found[path] for path in paths if isinstance(found[path], dict)]
    failures = [found[path] for path in paths if isinstance(found[path], str)]
    if not dry_run:
        # Only this (parent) process writes the list, once, after every upload.
        # Failing to write it fails the store only when it holds replaced tables: builds read the other tables
        # from their Git records, but a replaced table only from the list.
        replaced = {ident: table for report in reports for ident, table in report.get('replaced', {}).items()}
        try:
            receipts = update_receipts([path for path in paths if isinstance(found[path], dict)], replaced)
        except Exception as error:
            receipts = {'error': str(error) or type(error).__name__}
            if replaced:
                failures.append(f'receipts list not written; replaced tables unreadable: {receipts["error"]}')
        print(json.dumps({'receipts': receipts}, ensure_ascii=False), file=sys.stderr, flush=True)
    if failures:
        raise SystemExit('\n'.join(failures))
    shown = [{**report, 'replaced': sorted(report['replaced'])} if 'replaced' in report else report
             for report in reports if report['tables']]
    return {'since': since, 'dry_run': dry_run, 'manifests': shown}
