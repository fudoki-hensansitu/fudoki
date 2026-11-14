"""Upload the tables recorded in Git since a commit (ADR 0045).

A thread converts and records a table's sha256 and size in its manifest; the bytes stay on its machine.
After merge, CI re-converts each recorded table whose reference changed, from the originals and OCR
observations already in R2, and uploads it only when the whole receipt (keys, sha256, sizes, row counts,
metadata) equals the record. The input fingerprint is not compared (a stale one is allowed, ADR 0027). Conversion is byte-deterministic for the pinned Poppler and dependencies, so a
difference means the record and the code disagree: nothing of that manifest is uploaded and the job fails.

The Jev answers are read from Git and never asked (no API key in CI). ``dry_run`` compares only; a pull
request runs it to find a mismatch before merge.
"""
from __future__ import annotations

import json
import subprocess
import tempfile
from pathlib import Path

from ingestion.fiscal import manifest, run, storage
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
    before = references(previous(path, since))
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
        if differing:
            raise ValueError(f'{path}: re-converted tables differ from their records: {", ".join(differing)}')
        uploads = [(reference['object']['key'], Path(result['files'][reference['object']['key']]), reference['object'])
                   for ident in sorted(changed) for reference in manifest.table_references(recorded[ident]).values()]
        for key, file, reference in uploads:
            storage.verify(file, reference)
        if not dry_run:
            for key, file, reference in uploads:
                storage.upload(key, file, reference)
    return {'manifest': str(path), 'tables': sorted(changed), 'uploaded': not dry_run}


def store(since: str, *, dry_run: bool = False) -> dict:
    reports, failures = [], []
    for path in changed_manifests(since):
        try:
            reports.append(store_manifest(path, since, dry_run=dry_run))
        except Exception as error:  # report every manifest, then fail
            failures.append(str(error) or type(error).__name__)
    if failures:
        raise SystemExit('\n'.join(failures))
    return {'since': since, 'dry_run': dry_run, 'manifests': [report for report in reports if report['tables']]}
