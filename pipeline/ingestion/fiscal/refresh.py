"""Refresh stale input fingerprints by comparing re-converted tables with the saved ones by content.

The fingerprint of the converter code only says "something may have changed". The decision is the
content: when every re-converted table equals its saved table (columns, types, rows and their order, and
the metadata the converter writes to the manifest), only ``input_fingerprint`` in the Git manifest is
rewritten. The saved Parquet, its sha256 and size stay as they are. R2 is read, never written. When any
table differs, or the current save gate would refuse it, the manifest is left untouched.

The Jev answer store is read, never written and never extended: a refresh that asked a new question
would spend money and change a tracked file from what looks like a comparison (a dry-run rewrote the
``*.digit-recheck.jsonl`` of six manifests before this was enforced). A table whose digits have no
stored answer is reported as blocked; recording answers is the job of ``convert``.
"""
from __future__ import annotations

from concurrent.futures import ProcessPoolExecutor, as_completed
from copy import deepcopy
import json
import math
import multiprocessing
import os
import re
import subprocess
from pathlib import Path
import shutil
import sys
import tempfile
import time

import duckdb

from ingestion.fiscal import manifest, run, storage, unit_checks
from ingestion.lib import heavy_lock, node_tables
from ingestion.paths import PIPELINE

CURRENT, REFRESHED, WOULD_REFRESH = 'current', 'refreshed', 'would-refresh'
DIFFERENT, BLOCKED, ERROR, NO_TABLES = 'different', 'blocked', 'error', 'no-saved-tables'
SAME = 'same'
EXAMPLES = 5


def quote(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def columns_of(con: duckdb.DuckDBPyConnection, path: Path) -> list[tuple[str, str]]:
    rows = con.execute('describe select * from read_parquet(?, hive_partitioning=false)', [str(path)]).fetchall()
    return [(row[0], row[1]) for row in rows]


def differs(left: object, right: object) -> bool:
    return left != right and not (left != left and right != right)


def compare_parquet(saved: Path, candidate: Path, *, examples: int = EXAMPLES) -> dict:
    """Compare two Parquet files by content, never by bytes.

    ``removed``/``added`` are rows only in the saved/candidate file (multiset difference);
    ``changed`` counts positions present in both files whose rows differ, so a pure reorder shows up
    as ``changed`` with nothing added or removed.
    """
    if manifest.sha_file(saved) == manifest.sha_file(candidate):
        return {'same': True, 'identical_bytes': True}
    with duckdb.connect() as con:
        old, new = columns_of(con, saved), columns_of(con, candidate)
        totals = {label: con.execute('select count(*) from read_parquet(?, hive_partitioning=false)',
                                     [str(path)]).fetchone()[0]
                  for label, path in (('saved', saved), ('candidate', candidate))}
        if old != new:
            return {'same': False, 'rows': totals,
                    'schema': {'removed': [name for name, _ in old if name not in dict(new)],
                               'added': [name for name, _ in new if name not in dict(old)],
                               'type_changed': [{'column': name, 'saved': kind, 'candidate': dict(new)[name]}
                                                for name, kind in old if name in dict(new) and dict(new)[name] != kind],
                               'reordered': sorted(n for n, _ in old) == sorted(n for n, _ in new)
                               and [n for n, _ in old] != [n for n, _ in new]}}
        names = [name for name, _ in old]
        select = ', '.join(quote(name) for name in names) or 'null'
        for label, path in (('a', saved), ('b', candidate)):
            con.execute(f'create temp table {label} as select file_row_number as __row, {select} '
                        f'from read_parquet(?, file_row_number=true, hive_partitioning=false)', [str(path)])
        removed = f'select {select} from a except all select {select} from b'
        added = f'select {select} from b except all select {select} from a'
        distinct = ' or '.join(f'a.{quote(name)} is distinct from b.{quote(name)}' for name in names) or 'false'
        counts = {'removed': con.execute(f'select count(*) from ({removed})').fetchone()[0],
                  'added': con.execute(f'select count(*) from ({added})').fetchone()[0],
                  'changed': con.execute(f'select count(*) from a join b using (__row) where {distinct}').fetchone()[0]}
        if not any(counts.values()):
            return {'same': True, 'identical_bytes': False, 'rows': totals}
        result = {'same': False, 'rows': totals, **counts, 'examples': {}}
        order = ', '.join(quote(name) for name in names) or '1'
        for label, query in (('removed', removed), ('added', added)):
            if counts[label]:
                rows = con.execute(f'select * from ({query}) order by {order} limit {examples}').fetchall()
                result['examples'][label] = [dict(zip(names, row)) for row in rows]
        if counts['changed']:
            left = ', '.join(f'a.{quote(name)}' for name in names)
            right = ', '.join(f'b.{quote(name)}' for name in names)
            rows = con.execute(f'select a.__row, {left}, {right} from a join b using (__row) '
                               f'where {distinct} order by a.__row limit {examples}').fetchall()
            result['examples']['changed'] = [
                {'row': row[0], 'columns': {name: {'saved': row[1 + index], 'candidate': row[1 + len(names) + index]}
                                            for index, name in enumerate(names)
                                            if differs(row[1 + index], row[1 + len(names) + index])}}
                for row in rows]
        return result


def receipt_shape(table: dict) -> dict:
    """The converter-written part of a table receipt; fingerprint and Parquet bytes are not content."""
    shape = deepcopy(table)
    shape.pop('input_fingerprint', None)
    for reference in manifest.table_references(shape).values():
        reference['object'].pop('sha256', None)
        reference['object'].pop('bytes', None)
    return shape


def flatten(value: dict, prefix: str = '') -> dict:
    flat = {}
    for key, item in value.items():
        if isinstance(item, dict):
            flat.update(flatten(item, f'{prefix}{key}.'))
        else:
            flat[f'{prefix}{key}'] = item
    return flat


def receipt_differences(saved: dict, candidate: dict) -> list[dict]:
    old, new = flatten(receipt_shape(saved)), flatten(receipt_shape(candidate))
    found = []
    for key in sorted(set(old) | set(new)):
        if old.get(key) == new.get(key):
            continue
        item = {'field': key}
        for label, value in (('saved', old.get(key)), ('candidate', new.get(key))):
            if value is None or isinstance(value, (str, int, float, bool)):
                item[label] = value
            else:
                item[label + '_items'] = len(value)
        found.append(item)
    return found


def compare_table(saved: dict, candidate: dict, saved_paths: dict, candidate_paths: dict | Path) -> dict:
    """Receipt and content comparison of one table. ``paths`` are keyed by reference kind (None for CSV)."""
    kinds = set(manifest.table_references(saved))
    if kinds != set(manifest.table_references(candidate)):
        return {'status': DIFFERENT, 'diff': {'structure': {'saved': sorted(map(str, kinds)),
                                                            'candidate': sorted(map(str, manifest.table_references(candidate)))}}}
    diff = {}
    receipt = receipt_differences(saved, candidate)
    if receipt:
        diff['receipt'] = receipt
    content = {}
    for kind in kinds:
        new = candidate_paths[kind] if isinstance(candidate_paths, dict) else candidate_paths
        found = compare_parquet(saved_paths[kind], new)
        if not found['same']:
            content[kind or 'table'] = found
    if content:
        diff['content'] = content
    return {'status': DIFFERENT if diff else SAME, **({'diff': diff} if diff else {})}


def rewrite_fingerprints(path: Path, document: dict, current: dict[str, str], stale: list[str],
                         original_bytes: bytes) -> None:
    updated = deepcopy(document)
    for table in updated['tables']:
        if table['conversion_id'] in stale:
            table['input_fingerprint'] = current[table['conversion_id']]
    if path.read_bytes() != original_bytes:
        raise ValueError('Saved manifest changed during refresh')
    # Recomputed now: the converter code or its inputs must not have moved while we compared.
    manifest.require_current(updated)
    manifest.write(path, updated)
    manifest.require_current(manifest.read(path))


def slug(document: dict) -> str:
    target = document['target']
    return f'{target["jurisdiction"]}-{target["fiscal_year"]}-{manifest.document_slot(target)}-{document["direction"]}'


def plan(paths: list[Path]) -> dict:
    """List stale conversions without reading originals or executing converters."""
    affected = []
    for path in paths:
        document = manifest.read(path)
        fingerprints = manifest.fingerprints(document)
        stale = {table['conversion_id'] for table in document['tables']
                 if table['input_fingerprint'] != fingerprints[table['conversion_id']]}
        if stale:
            affected.append({'manifest': str(path), 'conversions': sorted(stale),
                             'tables': [table['table_id'] for table in document['tables']
                                        if table['conversion_id'] in stale]})
    return {'manifests': affected, 'conversions': sum(len(item['conversions']) for item in affected)}


def refresh_manifest(path: Path, *, remote: bool, dry_run: bool, work: Path, everything: bool = False) -> dict:
    started = time.monotonic()
    original_bytes = path.read_bytes()
    document = manifest.read(path)
    name = slug(document)
    try:
        label = str(path.resolve().relative_to(PIPELINE))
    except ValueError:
        label = str(path)
    result = {'manifest': label, 'name': name}

    def finish(status: str, **extra) -> dict:
        result.update(status=status, elapsed_seconds=round(time.monotonic() - started, 1), **extra)
        return result

    if not document['tables']:
        return finish(NO_TABLES)
    current = manifest.fingerprints(document)
    # `everything` re-reads current conversions too: a change outside the code (the Poppler version) moves no fingerprint.
    stale = sorted({table['conversion_id'] for table in document['tables']
                    if everything or table['input_fingerprint'] != current[table['conversion_id']]})
    if not stale:
        return finish(CURRENT)
    result['stale_conversions'] = stale
    try:
        saved_paths = {table['table_id']: {kind: storage.fetch(reference['object'], remote=remote)
                                           for kind, reference in manifest.table_references(table).items()}
                       for table in document['tables']}
        originals = run.original_files(document, remote=remote, conversion_ids=set(stale))
        # The conversion below reads pinned OCR observations from the cache only.
        for conversion in document['conversions']:
            if conversion['id'] in stale:
                for item in conversion.get('ocr_inputs', []):
                    storage.fetch_ocr(document, item, remote=remote)
    except Exception as error:
        return finish(ERROR, stage='restore', reason=f'{type(error).__name__}: {error}')
    output = work / name
    shutil.rmtree(output, ignore_errors=True)
    try:
        converted = run.convert(path, originals, output, remote=False, conversion_ids=stale,
                                persist_answers=False, ask_answers=False)
        result['units'] = converted.get('units', {}).get('counts', {})
        candidate = json.loads((output / 'manifest.json').read_text())
    except Exception as error:
        # The converter or a save gate (tree check, digit coverage) refuses the table today.
        return finish(BLOCKED, stage='convert', reason=f'{type(error).__name__}: {error}', candidate=str(output))
    by_id = {table['table_id']: table for table in candidate['tables']}
    locate = run.candidate_locator(output)
    tables = []
    for table in document['tables']:
        if table['conversion_id'] not in stale:
            continue
        entry = {'table_id': table['table_id'], 'conversion_id': table['conversion_id']}
        tables.append(entry)
        try:
            new = by_id[table['table_id']]
            located = locate(new)
            storage.prepare_save(candidate, new, located, scope=unit_checks.find_scope(
                output, table['table_id'], node_tables.COVERAGE_SIDECAR_SUFFIX))
            entry['units'] = converted.get('units', {}).get('tables', {}).get(table['table_id'])
        except Exception as error:
            entry.update(status=BLOCKED, reason=f'{type(error).__name__}: {error}')
            continue
        entry.update(compare_table(table, new, saved_paths[table['table_id']], located))
    counts = {status: sum(entry['status'] == status for entry in tables) for status in (SAME, DIFFERENT, BLOCKED)}
    result['tables'] = tables
    result['counts'] = counts
    if counts[BLOCKED]:
        return finish(BLOCKED, stage='gate', candidate=str(output))
    if counts[DIFFERENT]:
        return finish(DIFFERENT, candidate=str(output))
    if not dry_run:
        try:
            rewrite_fingerprints(path, document, current, stale, original_bytes)
        except Exception as error:
            return finish(ERROR, stage='rewrite', reason=f'{type(error).__name__}: {error}')
    shutil.rmtree(output, ignore_errors=True)
    return finish(WOULD_REFRESH if dry_run else REFRESHED)


# Manifests are refreshed in parallel processes. How many is decided from the machine at the start, so the
# same command fits a laptop, a cloud container and a busy machine alike (`--jobs` overrides it).
MAX_JOBS = 4
# Peak RSS measured on 2026-11-12: 650 MB for 130001 2025 settlement (the largest), 200 MB for a typical
# manifest. The budget leaves room for scan tables and the parent.
WORKER_MEMORY = 1536 * 2 ** 20


def available_cpus() -> int:
    """CPUs this process may use: the affinity mask, narrowed by a cgroup CPU quota (containers)."""
    count = len(os.sched_getaffinity(0)) if hasattr(os, 'sched_getaffinity') else (os.cpu_count() or 1)
    try:
        quota, period = Path('/sys/fs/cgroup/cpu.max').read_text().split()
        if quota != 'max':
            count = min(count, max(1, math.ceil(int(quota) / int(period))))
    except (OSError, ValueError):
        pass
    return max(1, count)


def available_memory() -> int | None:
    """Bytes that can be used without swapping, or None when the platform does not say."""
    try:
        text = Path('/proc/meminfo').read_text()
    except OSError:
        text = None
    if text is not None:
        found = re.search(r'^MemAvailable:\s+(\d+) kB', text, re.M)
        if not found:
            return None
        value = int(found.group(1)) * 1024
        try:
            limit = Path('/sys/fs/cgroup/memory.max').read_text().strip()
            if limit != 'max':
                value = min(value, int(limit) - int(Path('/sys/fs/cgroup/memory.current').read_text()))
        except (OSError, ValueError):
            pass
        return max(0, value)
    try:  # macOS: pages the kernel can hand out without paging (free, inactive, speculative, purgeable)
        text = subprocess.run(['vm_stat'], capture_output=True, text=True, check=True, timeout=5).stdout
    except (OSError, subprocess.SubprocessError):
        return None
    size = re.search(r'page size of (\d+) bytes', text)
    pages = [re.search(rf'^{label}:\s+(\d+)', text, re.M)
             for label in ('Pages free', 'Pages inactive', 'Pages speculative', 'Pages purgeable')]
    if not size or not all(pages):
        return None
    return int(size.group(1)) * sum(int(page.group(1)) for page in pages)


def auto_jobs(*, cpus=available_cpus, memory=available_memory, pressure=heavy_lock.memory_pressure_level) -> int:
    """One CPU stays free for the machine, each process gets `WORKER_MEMORY`, never more than `MAX_JOBS`.
    Memory pressure above normal, or memory that cannot be read, falls back to one process."""
    level = pressure()
    if level is not None and level > heavy_lock.MAX_PRESSURE_LEVEL:
        return 1
    free = memory()
    if free is None:
        return 1
    return max(1, min(MAX_JOBS, cpus() - 1, free // WORKER_MEMORY))


def origin_shas(path: Path) -> set[str]:
    try:
        document = manifest.read(path)
        selected = manifest.selection_for(document)
        return {item['sha256'] for conversion in document['conversions']
                for item in manifest.resolved_inputs(document, conversion, selected)}
    except Exception:
        return set()


def groups_of(paths: list[Path]) -> list[list[Path]]:
    """Manifests that read the same original run in one process, one after another: the observation cache
    of an original is written without a lock, so two processes must not build it at once."""
    owner: dict[str, int] = {}
    groups: list[list[Path]] = []
    for path in paths:
        shas = origin_shas(path)
        joined = sorted({owner[sha] for sha in shas if sha in owner})
        if not joined:
            groups.append([path])
            index = len(groups) - 1
        else:
            index = joined[0]
            groups[index].append(path)
            for other in reversed(joined[1:]):
                groups[index].extend(groups[other])
                groups[other] = []
                for sha, value in owner.items():
                    if value == other:
                        owner[sha] = index
        for sha in shas:
            owner[sha] = index
    return [group for group in groups if group]


def refresh_one(path: Path, *, remote: bool, dry_run: bool, work: Path, everything: bool) -> dict:
    try:
        return refresh_manifest(path, remote=remote, dry_run=dry_run, work=work, everything=everything)
    except Exception as error:
        return {'manifest': str(path), 'status': ERROR, 'stage': 'read', 'reason': f'{type(error).__name__}: {error}'}


def refresh_group(paths: list[Path], **options) -> list[tuple[Path, dict]]:
    return [(path, refresh_one(path, **options)) for path in paths]


def run_manifests(paths: list[Path], jobs: int, **options) -> list[dict]:
    """Results in the order of ``paths``; progress lines as each manifest finishes."""
    def report(item: dict) -> None:
        print(f'{item["manifest"]}: {item["status"]}', file=sys.stderr, flush=True)

    groups = groups_of(paths)
    results: dict[Path, dict] = {}
    if jobs <= 1 or len(groups) <= 1:
        for path in paths:
            results[path] = refresh_one(path, **options)
            report(results[path])
        return [results[path] for path in paths]
    # spawn, not fork: DuckDB and the converters hold threads and file handles a forked child must not share.
    with ProcessPoolExecutor(max_workers=min(jobs, len(groups)), mp_context=multiprocessing.get_context('spawn')) as pool:
        futures = {pool.submit(refresh_group, group, **options): group for group in groups}
        for future in as_completed(futures):
            try:
                finished = future.result()
            except Exception as error:
                finished = [(path, {'manifest': str(path), 'status': ERROR, 'stage': 'worker',
                                    'reason': f'{type(error).__name__}: {error}'}) for path in futures[future]]
            for path, item in finished:
                results[path] = item
                report(item)
    return [results[path] for path in paths]


def refresh_all(paths: list[Path], *, remote: bool, dry_run: bool, output: Path, everything: bool = False,
                jobs: int | None = None) -> dict:
    started = time.monotonic()
    output.parent.mkdir(parents=True, exist_ok=True)
    # A caller waits for this file to appear to know the run finished. Drop a previous run's report
    # first, so an old file is never mistaken for this run's output.
    output.unlink(missing_ok=True)
    work = output.parent / 'candidates'
    jobs = auto_jobs() if jobs is None else jobs
    print(f'refresh: {len(paths)} manifests, {jobs} process(es)', file=sys.stderr, flush=True)
    manifests = run_manifests(list(paths), jobs, remote=remote, dry_run=dry_run, work=work, everything=everything)
    statuses: dict[str, int] = {}
    tables = {SAME: 0, DIFFERENT: 0, BLOCKED: 0}
    for item in manifests:
        statuses[item['status']] = statuses.get(item['status'], 0) + 1
        for status, count in item.get('counts', {}).items():
            tables[status] += count
    ok = not {DIFFERENT, BLOCKED, ERROR} & set(statuses)
    report = {'ok': ok, 'dry_run': dry_run, 'jobs': jobs, 'elapsed_seconds': round(time.monotonic() - started, 1),
              'manifests': manifests}
    # Report first, atomically, so a reader never sees a half-written file.
    with tempfile.NamedTemporaryFile('w', dir=output.parent, delete=False, suffix='.tmp') as stream:
        temporary = Path(stream.name)
        json.dump(report, stream, ensure_ascii=False, indent=1, default=str)
        stream.write('\n')
    os.replace(temporary, output)
    summary = {'ok': ok, 'dry_run': dry_run, 'jobs': jobs, 'manifests': statuses, 'tables': tables,
               'elapsed_seconds': report['elapsed_seconds'], 'report': str(output),
               'attention': [{key: item[key] for key in ('manifest', 'status', 'stage', 'reason', 'counts', 'candidate')
                              if key in item} for item in manifests if item['status'] in {DIFFERENT, BLOCKED, ERROR}]}
    return {'ok': ok, 'summary': summary, 'report': report}
