"""Declare wider Vision tiles by grouping adjacent ruled columns within each table frame.

Run from the repo root with --plan <measurement plan> --conversion <id> --inputs <SHA/path JSON>
--output <new plan> --min-width <PDF points> --pages <physical pages...>.
Only the acquisition request changes; the converter still uses the original rules. No OCR is run here.
An existing output keeps its pinned inputs and accepts only new pages with compatible requests.
"""
from __future__ import annotations

import argparse
from copy import deepcopy
from dataclasses import replace
import json
import math
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[4] / 'pipeline'))
from ingestion.fiscal import manifest  # noqa: E402
from ingestion.generic.convert import scope_pages  # noqa: E402
from ingestion.generic.layout import _frames  # noqa: E402
from ingestion.generic.observe import Page, Rule  # noqa: E402
from ingestion.lib import pdf_rules  # noqa: E402
from ingestion.lib.scan_ocr import column_tiles  # noqa: E402


def regions(pdf: Path, number: int, width: float) -> list[dict]:
    rules = pdf_rules.detect(pdf, number)
    if not rules.vertical:
        return [{'id': 'full-page', 'bbox_normalized': [0, 0, 1, 1]}]
    top, bottom = min(r.start for r in rules.vertical), max(r.end for r in rules.vertical)
    columns = [r for r in rules.vertical if r.start <= top + .1 * (bottom - top)]
    page = Page(number, rules.width, rules.height, [],
                [Rule(r.position, r.start, r.position, r.end) for r in rules.vertical]
                + [Rule(r.start, r.position, r.end, r.position) for r in rules.horizontal])
    boundaries = set()
    for x0, x1, *_ in _frames(page):
        xs = sorted({x0, x1, *(r.position for r in columns if x0 <= r.position <= x1)})
        selected = [x0]
        for x in xs[1:-1]:
            if x - selected[-1] >= width:
                selected.append(x)
        if len(selected) > 1 and x1 - selected[-1] < width:
            selected.pop()
        boundaries.update([*selected, x1])
    if not boundaries:
        raise ValueError(f'No ruled table frame on page {number}')
    grouped = replace(rules, vertical=tuple(r for r in rules.vertical if r not in columns or r.position in boundaries))
    return [{'id': r.id, 'bbox_normalized': list(r.bbox_normalized)}
            for r in column_tiles(grouped, pdf_rules.render(pdf, number) < pdf_rules.DARK)]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--plan', type=Path, required=True)
    parser.add_argument('--conversion', required=True)
    parser.add_argument('--inputs', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--min-width', type=float, required=True, help='Minimum grouped column width in PDF points')
    parser.add_argument('--pages', type=int, nargs='+', required=True)
    args = parser.parse_args()
    if not math.isfinite(args.min_width) or args.min_width <= 0:
        parser.error('--min-width must be finite and positive')
    source = manifest.validate(json.loads(args.plan.read_text()))
    if source['tables']:
        parser.error('--plan must be a measurement plan with tables=[]')
    matches = [c for c in source['conversions'] if c['id'] == args.conversion]
    if len(matches) != 1:
        parser.error('Unknown conversion ID')
    conversion = deepcopy(matches[0])
    originals = manifest.resolved_inputs(source, conversion)
    if len(originals) != 1:
        parser.error('The selected conversion must read one original')
    original = originals[0]
    pdf = Path(json.loads(args.inputs.read_text())[original['sha256']])
    if manifest.sha_file(pdf) != original['sha256']:
        raise ValueError('Supplied PDF differs from the selected original')
    selected = set(scope_pages(original, conversion['options']['account']))
    if set(args.pages) - selected:
        parser.error('--pages must be inside the conversion account scope')
    conversion['ocr_inputs'] = []
    conversion['options'].pop('amount_corrections', None)  # corrections bind the former observation IDs
    output = {**source, 'conversions': [conversion], 'tables': []}
    if args.output.exists():
        output = manifest.validate(json.loads(args.output.read_text()))
        if output['tables'] or output['target'] != source['target'] or output['direction'] != source['direction']:
            raise ValueError('Existing output belongs to another target or contains tables')
        if len(output['conversions']) != 1 or output['conversions'][0]['id'] != conversion['id']:
            raise ValueError('Existing output belongs to another conversion')
        if output['conversions'][0]['inputs'] != conversion['inputs']:
            raise ValueError('Existing output reads another original')
        conversion = output['conversions'][0]
    for number in sorted(set(args.pages)):
        item = {'id': f'{conversion["id"]}-width{args.min_width:g}-p{number}', 'origin_sha256': original['sha256'],
                'request': {'engine': 'vision', 'pages': [number], 'config': {'region_padding_px': 60},
                            'regions': regions(pdf, number, args.min_width), 'vlm_fallback': False}}
        previous = [i for i in conversion['ocr_inputs'] if number in i['request']['pages']]
        if previous:
            if len(previous) != 1 or manifest.canonical({k: previous[0].get(k) for k in item}) != manifest.canonical(item):
                raise ValueError(f'Existing page {number} has a different acquisition request')
        else:
            conversion['ocr_inputs'].append(item)
        print(json.dumps({'page': number, 'regions': len(item['request']['regions']), 'kept': bool(previous)}), flush=True)
    manifest.validate(output)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n')


if __name__ == '__main__':
    main()
