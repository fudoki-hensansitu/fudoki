"""What the build reads, packed into a few R2 objects so that a lost CI cache comes back in a few reads
(docs/prd/ci-flow/dd.md, 2).

Two bundles: the tables the receipts list points at, and the project readings and page texts of the declared
evaluation sheets. Each is a tar.gz named by the sha of its contents; `bundles/index.json` names the current
pair and is written last, so a reader never sees a half-written pair. Bundles the index does not name are
removed after it moves; a reader that loses the race falls back to fetching objects one by one.

`restore` only fills the cache: it never overwrites a file (a pull request's candidate tables stay), and the
build still checks every table against its receipt, so a stale or partial bundle costs time, never correctness.
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import io
import json
import subprocess
import sys
import tarfile
import tempfile
from pathlib import Path

from ingestion import r2
from ingestion.fiscal import storage
from ingestion.fiscal.manifest import BUCKET, table_references
from ingestion.paths import CACHE

PREFIX = 'fiscal/ingestion/bundles/'
INDEX_KEY = PREFIX + 'index.json'
# cf goes through the REST API, which takes at most 300MB an object.
LIMIT = 300_000_000


def table_files(receipts: dict[str, dict]) -> list[Path]:
    """The Parquet files of the receipts list, each checked against its receipt (fetched when not cached)."""
    return sorted({storage.fetch(reference.get('object', reference), remote=True)
                   for receipt in receipts.values() for reference in table_references(receipt).values()})


def project_files() -> list[Path]:
    """The cached readings and page texts of the declared evaluation sheets (those not cached are left out)."""
    from ingestion.project import run as project

    paths = set()
    for origin in project.sheet_sources(project.origins()['sheets']):
        for path in (project.reading_cache(origin), project.page_text_cache(origin['sha256'])):
            if path.is_file():
                paths.add(path)
    return sorted(paths)


def pack(paths: list[Path]) -> tuple[bytes, str]:
    """A reproducible tar.gz of the files (paths relative to the cache) and the sha of its member list."""
    digest = hashlib.sha256()
    stream = io.BytesIO()
    with gzip.GzipFile(fileobj=stream, mode='wb', compresslevel=6, mtime=0) as zipped, tarfile.open(fileobj=zipped, mode='w') as tar:
        for path in paths:
            name = str(path.relative_to(CACHE))
            data = path.read_bytes()
            digest.update(name.encode() + b'\0' + hashlib.sha256(data).digest())
            info = tarfile.TarInfo(name)
            info.size = len(data)
            info.mode = 0o644
            tar.addfile(info, io.BytesIO(data))
    return stream.getvalue(), digest.hexdigest()


def read_index() -> dict | None:
    try:
        shown = r2.objects('get', INDEX_KEY, '--bucket-name', BUCKET, '--quiet', quiet=True)
    except subprocess.CalledProcessError as error:
        if b'10007' in error.stderr or b'does not exist' in error.stderr:
            return None
        raise
    return json.loads(shown.stdout)


def put(key: str, data: bytes) -> None:
    with tempfile.NamedTemporaryFile(delete=False) as stream:
        stream.write(data)
        path = Path(stream.name)
    try:
        r2.objects('put', key, '--bucket-name', BUCKET, '--file', str(path), '--quiet', stdout=subprocess.DEVNULL)
    finally:
        path.unlink(missing_ok=True)


def save() -> dict:
    """Pack the current tables and readings and point the index at them; unchanged bundles are not uploaded."""
    receipts = storage.read_receipts() or {}
    before = read_index() or {}
    after = {}
    for name, paths in (('tables', table_files(receipts)), ('project', project_files())):
        data, sha = pack(paths)
        if len(data) > LIMIT:
            raise ValueError(f'{name} bundle is {len(data)} bytes, over the REST upload limit')
        key = f'{PREFIX}{name}-{sha[:16]}.tar.gz'
        if before.get(name, {}).get('key') != key:
            put(key, data)
        after[name] = {'key': key, 'files': len(paths), 'bytes': len(data)}
    changed = after != before
    if changed:
        put(INDEX_KEY, json.dumps(after, indent=1).encode() + b'\n')
    return {'saved': after, 'changed': changed, 'removed': sweep({e['key'] for e in after.values()})}


def sweep(current: set[str]) -> list[str]:
    """Remove the bundles the index no longer names (also those of a run that failed before its index)."""
    listed = json.loads(r2.objects('list', '--bucket-name', BUCKET, '--prefix', PREFIX, '--per-page', '1000').stdout)
    if not isinstance(listed, list):
        raise ValueError('Unrecognized R2 listing response; no bundle removed')
    removed = []
    for key in sorted(item['key'] for item in listed):
        if key.endswith('.tar.gz') and key not in current:
            # cf can abort a non-interactive delete with exit 0 unless forced.
            r2.objects('delete', key, '--bucket-name', BUCKET, '--force', '--quiet', stdout=subprocess.DEVNULL)
            removed.append(key)
    return removed


def extract(data: bytes) -> int:
    """Write the members that are not in the cache yet; returns how many were written."""
    written = 0
    with tarfile.open(fileobj=io.BytesIO(data), mode='r:gz') as tar:
        for member in tar:
            if not member.isfile():
                continue
            path = CACHE / storage.safe_relative(member.name)
            if path.exists():
                continue
            path.parent.mkdir(parents=True, exist_ok=True)
            source = tar.extractfile(member)
            with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as stream:
                stream.write(source.read())
                temporary = Path(stream.name)
            temporary.replace(path)
            written += 1
    return written


def restore(names: list[str] | None = None) -> dict:
    """Fill the cache from the current bundles (or only the named ones). Any failure is reported, not raised: the
    build fetches what is missing one object at a time."""
    try:
        index = read_index()
    except Exception as error:  # noqa: BLE001 — any failure leaves the build to fetch one by one
        return {'restored': {}, 'error': f'{type(error).__name__}: {error}'[:300]}
    if not isinstance(index, dict) or not index:
        return {'restored': {}, 'error': 'no index'}
    restored = {}
    for name, entry in index.items():
        if names and name not in names:
            continue
        try:
            shown = r2.objects('get', entry['key'], '--bucket-name', BUCKET, '--quiet', quiet=True)
            restored[name] = extract(shown.stdout)
        except Exception as error:  # noqa: BLE001
            restored[name] = f'failed: {type(error).__name__}'
    return {'restored': restored}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    parser.add_argument('command', choices=('save', 'restore'))
    parser.add_argument('names', nargs='*', choices=('tables', 'project'), help='restore only these bundles')
    args = parser.parse_args()
    result = save() if args.command == 'save' else restore(args.names)
    print(json.dumps(result, ensure_ascii=False))
    sys.stdout.flush()


if __name__ == '__main__':
    main()
