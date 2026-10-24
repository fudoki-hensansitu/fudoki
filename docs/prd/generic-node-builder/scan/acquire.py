"""Acquire the OCR inputs of a measurement plan, sequentially, pinning and saving each input.

Run from the repo root: mise exec -- uv run python docs/prd/generic-node-builder/scan/acquire.py
    --plan docs/prd/generic-node-builder/scan/plans/<target>.json --remote
Plans use the fiscal manifest schema with tables=[]; they are not adopted fiscal tables.
Pinned inputs are restored, never reacquired. --remote explicitly permits the OCR-only R2 save.
The originals are restored from the selected archive. No original is downloaded from a municipality.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import subprocess
import sys
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[4] / 'pipeline'))
from ingestion.fiscal import manifest  # noqa: E402
from ingestion.fiscal.storage import fetch, fetch_ocr, save_ocr, write_ocr  # noqa: E402
from ingestion.lib.scan_ocr import acquire  # noqa: E402
from ingestion.lib.paddle_ocr import PaddleOcrError  # noqa: E402


def acquire_plan(path: Path, *, remote: bool, inputs_dir: Path, conversion_ids: list[str] | None = None) -> None:
    document = manifest.validate(json.loads(path.read_text()))
    if document['tables']:
        raise ValueError('A measurement plan must not contain saved tables')
    selected = [c for c in document['conversions'] if conversion_ids is None or c['id'] in conversion_ids]
    if conversion_ids and set(conversion_ids) - {c['id'] for c in selected}:
        raise ValueError('Unknown conversion ID')
    for conversion in selected:
        files = {}
        for origin in manifest.resolved_inputs(document, conversion):
            for attempt in range(3):
                try:
                    files[origin['sha256']] = fetch(origin, remote=True)
                    break
                except subprocess.CalledProcessError:
                    if attempt == 2:
                        raise
        inputs_dir.mkdir(parents=True, exist_ok=True)
        inputs_path = inputs_dir / f'{document["target"]["jurisdiction"]}.json'
        local = json.loads(inputs_path.read_text()) if inputs_path.exists() else {}
        local.update({sha: str(file) for sha, file in files.items()})
        inputs_path.write_text(json.dumps(local, indent=2) + '\n')
        for item in conversion.get('ocr_inputs', []):
            started = time.monotonic()
            if item.get('sha256'):
                fetch_ocr(document, item, remote=True)
                # A previous local-only acquisition may already be pinned and cached.
                # --remote also promotes it, instead of mistaking cache presence for R2 storage.
                if remote:
                    save_ocr(document, item)
                status = 'saved' if remote else 'restored'
            else:
                for attempt in range(3):
                    try:
                        data, run = acquire(files[item['origin_sha256']], item['request'])
                        break
                    except PaddleOcrError as error:
                        if attempt == 2:
                            raise
                        print(json.dumps({'ocr': item['id'], 'retry': attempt + 1,
                                          'error': str(error)[-500:]}), flush=True)
                item['sha256'], item['bytes'] = run['observation_sha256'], len(data)
                write_ocr(document, item, data, run)
                if remote:
                    save_ocr(document, item)
                # Pin only after a successful remote save, when requested. Each input is restartable.
                manifest.validate(document)
                path.write_text(json.dumps(document, ensure_ascii=False, indent=2) + '\n')
                status = 'saved' if remote else 'pinned locally'
            print(json.dumps({'plan': path.name, 'conversion': conversion['id'], 'ocr': item['id'],
                              'pages': len(item['request']['pages']), 'status': status,
                              'seconds': round(time.monotonic() - started, 1)}, ensure_ascii=False), flush=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--plan', type=Path, action='append', required=True)
    parser.add_argument('--conversion', action='append')
    parser.add_argument('--inputs-dir', type=Path, required=True, help='Write SHA-to-local-file maps for measure.py here')
    parser.add_argument('--remote', action='store_true', help='Save each acquired OCR input to R2 before pinning')
    args = parser.parse_args()
    for path in args.plan:
        acquire_plan(path, remote=args.remote, inputs_dir=args.inputs_dir, conversion_ids=args.conversion)


if __name__ == '__main__':
    main()
