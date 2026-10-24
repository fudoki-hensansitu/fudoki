"""Create an unadopted measurement manifest from a historical manifest or a selected scan account.

--manifest reads an old fiscal manifest (e.g. git show 73eb1c9:... > /tmp/old.json).
--target takes the fiscal target as JSON; --account chooses its selected scan originals.
The ten-page OCR requests make acquisition restartable. --keep names conversions whose pinned inputs
still exist; other inputs get new IDs so acquiring them cannot overwrite adopted observations.
"""
from __future__ import annotations

import argparse
from copy import deepcopy
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[4] / 'pipeline'))
from ingestion.fiscal import manifest  # noqa: E402


def plan(document: dict, keep: list[str], *, generic: bool = False, account: str | None = None) -> dict:
    result = deepcopy(document)
    result['tables'] = []
    for conversion in result['conversions']:
        if conversion['id'] in keep:
            continue
        conversion['options'].pop('amount_corrections', None)
        inputs = []
        for old in conversion['ocr_inputs']:
            pages = old['request']['pages']
            for index, first in enumerate(range(0, len(pages), 10), 1):
                request = {**old['request'], 'pages': pages[first:first + 10], 'vlm_fallback': False}
                inputs.append({'id': f'{old["id"]}-paddle-{index}', 'origin_sha256': old['origin_sha256'], 'request': request})
        conversion['ocr_inputs'] = inputs
    if generic:
        selected_files = manifest.selection_for(result)['candidates'][0]['files']
        for conversion in result['conversions']:
            origin = manifest.resolved_inputs(result, conversion)[0]
            name = account or origin['scope'][0]['account']
            options = {'account': name, **conversion['options']}
            copies = sum(any(s['direction'] == result['direction'] and s['account'] == name
                             for s in f.get('scope', []) or []) for f in selected_files)
            if copies > 1:
                options['partial'] = True
            conversion.update(converter='fiscal/layouts/generic_scan/convert.py', options=options)
    return manifest.validate(result)


def selected(target: dict, account: str, page_limit: int | None) -> dict:
    document = {'schema_version': 1, 'target': target, 'direction': 'expenditure', 'conversions': [], 'tables': []}
    selection = manifest.selection_for(document)
    candidate = selection['candidates'][0]
    for file in candidate['files']:
        scopes = [s for s in file.get('scope', []) if s['direction'] == 'expenditure' and s['account'] == account]
        if not scopes or file.get('pdf_type') != 'scan':
            continue
        pages = [p for span in scopes[0]['pages'] for p in range(span['start'], span['end'] + 1)]
        if page_limit:
            pages = pages[:page_limit]
        ident = f'scan-{len(document["conversions"]) + 1}'
        document['conversions'].append({'id': ident, 'converter': 'fiscal/layouts/settlement_statement/convert.py',
            'inputs': [{'sha256': file['sha256']}], 'options': {'table_id': ident},
            'ocr_inputs': [{'id': f'{ident}-ocr', 'origin_sha256': file['sha256'],
                            'request': {'engine': 'paddle', 'pages': pages}}],
            'expected_tables': [{'table_id': ident}]})
    if not document['conversions']:
        raise ValueError('No selected scan original for this account')
    return document


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument('--manifest', type=Path)
    source.add_argument('--target', type=json.loads)
    parser.add_argument('--account')
    parser.add_argument('--page-limit', type=int)
    parser.add_argument('--keep', action='append', default=[])
    parser.add_argument('--generic', action='store_true', help='Wire the plan to generic_scan with account/partial options')
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    if args.target and not args.account:
        parser.error('--target needs --account')
    if args.page_limit is not None and args.page_limit < 1:
        parser.error('--page-limit must be positive')
    document = json.loads(args.manifest.read_text()) if args.manifest else selected(args.target, args.account, args.page_limit)
    result = plan(document, args.keep, generic=args.generic, account=args.account)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open('x') as stream:
        stream.write(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'plan': str(args.output), 'conversions': len(result['conversions']),
                      'pages': sum(len(i['request']['pages']) for _, i in manifest.ocr_inputs(result))}))


if __name__ == '__main__':
    main()
