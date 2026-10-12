"""Private current-table storage; only completed target/direction sets are published."""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path, PurePosixPath

import gzip
import hashlib

from ingestion.fiscal.manifest import BUCKET, object_key, ocr_key, sha_file, table_references
from ingestion.paths import CACHE

OBJECTS = CACHE / 'objects'


def verify(path: Path, reference: dict) -> None:
    if ('bytes' in reference and path.stat().st_size != reference['bytes']) or sha_file(path) != reference['sha256']:
        raise ValueError('Stored object hash/size differs')


def verify_ocr(path: Path, reference: dict) -> bytes:
    """OCR observations are stored gzipped; their SHA and size are of the JSON bytes."""
    data = gzip.decompress(path.read_bytes())
    if len(data) != reference['bytes'] or hashlib.sha256(data).hexdigest() != reference['sha256']:
        raise ValueError('OCR observation hash/size differs')
    return data


def write_ocr(document: dict, item: dict, data: bytes, run: dict) -> Path:
    """Cache a freshly acquired observation at its fixed key; uploading happens with the tables."""
    path = OBJECTS / safe_relative(ocr_key(document, item['id']))
    path.parent.mkdir(parents=True, exist_ok=True)
    # mtime=0 keeps the gzip bytes stable for identical observations.
    path.write_bytes(gzip.compress(data, mtime=0))
    path.with_name(item['id'] + '.run.json').write_text(json.dumps(run, ensure_ascii=False, indent=1) + '\n')
    return path


def fetch_ocr(document: dict, item: dict, *, remote: bool = False) -> Path:
    if 'sha256' not in item:
        raise ValueError(f'OCR input is not pinned; run ingestion:ocr: {item["id"]}')
    path = OBJECTS / safe_relative(ocr_key(document, item['id']))
    if not path.exists():
        if not remote:
            raise FileNotFoundError(f'OCR observation is not cached: {item["id"]}')
        path.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as stream:
            temporary = Path(stream.name)
            try:
                subprocess.run(['cf', 'r2', 'objects', 'get', ocr_key(document, item['id']), '--bucket-name',
                                BUCKET, '--quiet'], stdout=stream, check=True)
                verify_ocr(temporary, item)
                os.replace(temporary, path)
            finally:
                temporary.unlink(missing_ok=True)
    verify_ocr(path, item)
    return path


def save_ocr(document: dict, item: dict) -> None:
    """Upload a pinned observation (and its run record when cached) to its fixed key."""
    path = fetch_ocr(document, item)
    if path.stat().st_size > 300_000_000:
        raise ValueError('cf REST upload limit exceeded; configure a file-based S3 multipart transport')
    subprocess.run(['cf', 'r2', 'objects', 'put', ocr_key(document, item['id']), '--bucket-name', BUCKET,
                    '--file', str(path), '--quiet'], check=True, stdout=subprocess.DEVNULL)
    run = path.with_name(item['id'] + '.run.json')
    if run.exists():
        subprocess.run(['cf', 'r2', 'objects', 'put', ocr_key(document, item['id'], '.run.json'), '--bucket-name',
                        BUCKET, '--file', str(run), '--quiet'], check=True, stdout=subprocess.DEVNULL)


def safe_relative(value: str) -> str:
    path = PurePosixPath(value)
    if path.is_absolute() or '..' in path.parts or '\\' in value or not value or not path.parts or value != str(path) or any(ord(c) < 32 for c in value):
        raise ValueError(f'Unsafe input path: {value}')
    return str(path)


def fetch(reference: dict, *, remote: bool = False) -> Path:
    if reference.get('bucket', BUCKET) != BUCKET:
        raise ValueError('Only the private input bucket is supported')
    path = OBJECTS / safe_relative(reference['key'])
    if path.is_symlink() or not path.resolve().is_relative_to(OBJECTS.resolve()):
        raise ValueError('Object cache path escapes its root')
    if path.exists():
        verify(path, reference)
        return path
    if not remote:
        raise FileNotFoundError(f'Object is not cached: {reference["key"]}')
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as stream:
        temporary = Path(stream.name)
        try:
            subprocess.run(['cf', 'r2', 'objects', 'get', reference['key'], '--bucket-name',
                            reference.get('bucket', BUCKET), '--quiet'], stdout=stream, check=True)
        except BaseException:
            temporary.unlink(missing_ok=True)
            raise
    try:
        verify(temporary, reference)
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)
    return path


def prepare_save(document: dict, table: dict, path: Path | dict[str, Path]) -> list[tuple[str, Path]]:
    """The gate every table passes before upload: tree check, keys, hash/size and upload limit.

    ``ingestion:refresh`` applies the same gate before it rewrites a fingerprint, so a table the
    current checks would refuse to save never gets a fresh fingerprint.
    """
    if 'nodes' in table:
        from ingestion.lib.node_tables import check_tree, read_rows
        checked = check_tree(read_rows(path['nodes']), read_rows(path['amounts']), document['target']['document_kind'])
        if not checked['passed'] or table['unread_amount_count'] or table['unresolved_parent_count']:
            raise ValueError('Node table failed the mandatory pre-save tree check')
    prepared = []
    for kind, receipt in table_references(table).items():
        file = path[kind] if kind is not None else path
        reference = receipt['object']
        key = object_key(document, table['table_id'], kind)
        if reference['key'] != key:
            raise ValueError('Wrong current-table key')
        verify(file, reference)
        if file.stat().st_size > 300_000_000:
            raise ValueError('cf REST upload limit exceeded; configure a file-based S3 multipart transport')
        prepared.append((key, file))
    return prepared


def save(document: dict, table: dict, path: Path | dict[str, Path], *, remote: bool) -> None:
    if not remote:
        raise ValueError('A saved manifest requires successful private R2 uploads')
    prepared = prepare_save(document, table, path)
    for key, file in prepared:
        subprocess.run(['cf', 'r2', 'objects', 'put', key, '--bucket-name', BUCKET,
                        '--file', str(file), '--quiet'], check=True, stdout=subprocess.DEVNULL)
        cached = OBJECTS / key
        cached.parent.mkdir(parents=True, exist_ok=True)
        if cached.resolve() != file.resolve():
            shutil.copyfile(file, cached)


def cleanup(document: dict) -> int:
    from ingestion.fiscal.manifest import validate, require_current, read, manifest_path
    validate(document)
    require_current(document)
    prefix = object_key(document, 'placeholder').rsplit('/', 1)[0] + '/'
    wanted = {reference['object']['key'] for table in document['tables']
              for reference in table_references(table).values()}
    from ingestion.fiscal.manifest import ocr_inputs
    wanted |= {ocr_key(document, item['id'], suffix) for _, item in ocr_inputs(document)
               for suffix in ('.json.gz', '.run.json')}
    removed = 0
    after = None
    while True:
        if read(manifest_path(document['target'], document['direction'])) != document:
            raise ValueError('Saved manifest changed; cleanup stopped')
        command = ['cf', 'r2', 'objects', 'list', '--bucket-name', BUCKET, '--prefix', prefix, '--per-page', '1000']
        if after:
            command += ['--start-after', after]
        response = json.loads(subprocess.check_output(command))
        # cf returns an object array, without the API cursor. start-after retains pagination.
        if not isinstance(response, list):
            raise ValueError('Unrecognized R2 listing response; no objects deleted')
        if not response:
            break
        keys = [item['key'] for item in response]
        if keys != sorted(set(keys)) or after is not None and keys[0] <= after:
            raise ValueError('Non-advancing R2 pagination; no page processed')
        for item in response:
            key = item['key']
            if not key.startswith(prefix):
                raise ValueError('R2 list returned an object outside the target/direction')
            name = key[len(prefix):]
            stored_table = name.endswith('.parquet') and '/' not in name
            stored_ocr = (name.startswith('ocr/') and '/' not in name[4:]
                          and name.endswith(('.json.gz', '.run.json')))
            if key not in wanted and (stored_table or stored_ocr):
                if read(manifest_path(document['target'], document['direction'])) != document:
                    raise ValueError('Saved manifest changed; cleanup stopped')
                subprocess.run(['cf', 'r2', 'objects', 'delete', key, '--bucket-name', BUCKET, '--force', '--quiet'],
                               check=True, stdout=subprocess.DEVNULL)
                # cf can abort a non-interactive delete with exit 0; confirm absence before counting it.
                remaining = json.loads(subprocess.check_output(
                    ['cf', 'r2', 'objects', 'list', '--bucket-name', BUCKET, '--prefix', key, '--per-page', '1000']))
                if not isinstance(remaining, list):
                    raise ValueError('Unrecognized R2 listing response; deletion not confirmed')
                remaining_keys = [item['key'] for item in remaining]
                if remaining_keys != sorted(set(remaining_keys)) or any(not value.startswith(key) for value in remaining_keys):
                    raise ValueError('Invalid R2 listing response; deletion not confirmed')
                if key in remaining_keys:
                    raise ValueError(f'R2 object remains after delete: {key}')
                removed += 1
        after = keys[-1]
    return removed
