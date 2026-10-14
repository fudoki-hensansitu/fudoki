"""Bounded VLM recheck of failing amount cells, outside the generic scan converter.

The declaration and reader are shared with settlement_statement.recheck. Only a cell bound to
one OCR observation is read; the frozen observation is unchanged. A retained batch must reduce
tree failures/unowned or unread cells and preserve all existing matches before --write.
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
from types import SimpleNamespace

from ingestion.fiscal import manifest
from ingestion.fiscal.layouts.settlement_statement.convert import ocr_boxes
from ingestion.fiscal.layouts.settlement_statement.recheck import LIMIT, MODEL, MARGIN, PROMPT, failing_cells, read_cell, rule
from ingestion.fiscal.storage import fetch_ocr
from ingestion.generic.scan import build_table, logical_units
from ingestion.generic.layout import normalize
from ingestion.generic.layout_settings import load
from ingestion.lib.node_tables import NodeTables
from ingestion.lib.paddle_ocr import recognize_crops
from ingestion.lib import pdf_rules
from ingestion.lib.tree_checks import check_tree
from shared.amount import number


def source_input(document: dict, conversion: dict, pdf: Path) -> dict:
    source = manifest.resolved_inputs(document, conversion)[0]
    if manifest.sha_file(pdf) != source['sha256']:
        raise ValueError('Supplied PDF differs from the selected original')
    source.update(path=pdf, target=document['target'], direction=document['direction'])
    source['ocr'] = [{**item, 'path': fetch_ocr(document, item)} for item in conversion['ocr_inputs']]
    return source


def amount_sources(table, source: dict, declared: list[dict]) -> dict:
    """Bind printed amounts to an exact OCR box; ambiguous/assembled cells remain unbound."""
    boxes = {}
    for item in source['ocr']:
        observation = json.loads(gzip.decompress(Path(item['path']).read_bytes()))
        for page in observation['pages']:
            all_boxes = ocr_boxes(observation, page)
            boxes.setdefault(page['page_number'], []).extend(b for region in all_boxes for b in [region, *region.parts])
    targets = {(r['page'], r['observation_id']) for r in declared}
    units = logical_units(table.logicals)
    sources = {}
    for amount in table.amounts:
        printed = [amount[k] for k in ('x0', 'y0', 'x1', 'y1')]
        if any(v is None for v in printed):
            continue
        matches = [b for b in boxes.get(amount['physical_page'], [])
                   if all(abs(a - v) <= .6 for a, v in zip(printed, (b.x0, b.y0, b.x1, b.y1)))]
        # A region and its single word may describe the same ink. Prefer an already declared
        # observation, then its word; never choose between distinct observed strings.
        if matches and len({b.text for b in matches}) == 1 and not any(
                (b.page, (b.x0, b.y0, b.x1, b.y1)) in units for b in matches):
            matches.sort(key=lambda b: ((b.page, b.id) not in targets, ':w' not in b.id))
            sources[(amount['node_key'], amount['header_path'])] = [matches[0]]
    columns = (load(source['target'], source['direction']) or {}).get('columns', {})
    for unread in [u for u in table.built.unowned if u['kind'] == 'unreadable amount']:
        matches = [b for b in boxes.get(unread['page'], []) if normalize(b.text) == unread['text']]
        if matches and len({(b.x0, b.y0, b.x1, b.y1) for b in matches}) == 1:
            box = matches[0]
            sources[(f'unread:{box.page}:{box.id}', '')] = [box]
    # Digitless OCR such as C for 0 is a reread candidate only in explicitly declared amount columns.
    for logical in table.logicals:
        for band in logical.bands:
            if columns.get('／'.join(band.header), {}).get('kind') != 'amount':
                continue
            for glyph in band.words:
                if any(c.isdigit() for c in glyph.text) or len(glyph.text.strip()) != 1 or glyph.text == '円':
                    continue
                if (glyph.page, glyph.original) in units:
                    continue  # a confirmed unit row, rather than all values before a continued subject's name
                matches = [b for b in boxes.get(glyph.page, []) if b.text == glyph.text
                           and all(abs(a - v) <= .6 for a, v in zip(glyph.original, (b.x0, b.y0, b.x1, b.y1)))]
                if matches:
                    box = matches[0]
                    sources[(f'unread:{box.page}:{box.id}', '')] = [box]
    return sources


def score(amounts: list[dict], nodes: list[dict], kind: str) -> int:
    return sum(r['status'] != '一致' for r in check_tree(nodes, amounts, kind)['results'])


def problems(table, sources: dict, kind: str) -> int:
    printed = {(a['node_key'], a['header_path']) for a in table.amounts}
    return score(table.amounts, table.nodes, kind) + len(table.built.unowned) + len(sources.keys() - printed)


def read_amount(pdf: Path, box, model: str, *, allow_vlm: bool = True) -> tuple[str | None, str]:
    """A declared amount column's single digitless glyph is tried by local OCR first.

    Only an exact 0 is kept from this attempt; any other reading goes to the existing VLM reader.
    The caller's source binding and rebuild checks still decide whether to declare the correction.
    """
    if not any(c.isdigit() for c in box.text) and len(box.text.strip()) == 1:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / 'cell'
            scale, margin = 300 / 72, 4
            subprocess.run(['pdftoppm', '-f', str(box.page), '-l', str(box.page), '-r', '300', '-png', '-singlefile',
                '-x', str(int(max(0, box.x0 - margin) * scale)), '-y', str(int(max(0, box.y0 - margin) * scale)),
                '-W', str(int((box.x1 - box.x0 + 2 * margin) * scale)),
                '-H', str(int((box.y1 - box.y0 + 2 * margin) * scale)), str(pdf), str(root)], check=True, timeout=60)
            answer = recognize_crops([root.with_suffix('.png')])[0].strip()
            if answer == '0':
                return answer, 'paddle-small'
    if not allow_vlm:
        return None, 'deferred'
    return read_cell(pdf, box, model), model


def recheck(document: dict, conversion: dict, pdf: Path, model: str = MODEL, limit: int = LIMIT,
            *, cache_path: Path | None = None, vlm_limit: int = LIMIT,
            cells: set[tuple[int, str]] | None = None) -> dict:
    if limit < 1 or vlm_limit < 0:
        raise ValueError('Recheck limit must be positive and VLM limit nonnegative')
    source = source_input(document, conversion, pdf)
    page_numbers = {p for item in conversion['ocr_inputs'] for p in item['request']['pages']}
    rules = {p: pdf_rules.detect(pdf, p) for p in sorted(page_numbers)}
    options = conversion['options']
    kind = document['target']['document_kind']
    table = build_table(source, options, stop=False, rules=rules)
    existing = options.get('amount_corrections', [])
    sources = amount_sources(table, source, existing)
    result = SimpleNamespace(tables=NodeTables(table.nodes, table.amounts), sources=sources)
    before = problems(table, sources, kind)
    targets = {(r['page'], r['observation_id']) for r in existing}
    boxes = { (sources[k][0].page, sources[k][0].id): sources[k][0]
              for k in (failing_cells(result) if before else [])
              if (sources[k][0].page, sources[k][0].id) not in targets}
    if cells is not None:
        missing = cells - boxes.keys()
        if missing:
            raise ValueError(f'Selected cells are not bound failing amounts: {sorted(missing)}')
        boxes = {key: box for key, box in boxes.items() if key in cells}
    cache = {r['fingerprint']: r for line in (cache_path.read_text().splitlines() if cache_path and cache_path.exists() else [])
             if line.strip() for r in [json.loads(line)]}
    reads, proposals = [], []
    local_rules = set()
    digitless_rules = set()
    enriched = False
    new_vlm, cached, deferred = 0, 0, 0
    for box in list(boxes.values())[:limit]:
        payload = [source['sha256'], box.page, box.id, box.text, [box.x0, box.y0, box.x1, box.y1],
                   model, PROMPT, MARGIN, 200, 'paddle-exact-zero-300dpi-v1']
        fingerprint = hashlib.sha256(manifest.canonical(payload)).hexdigest()
        if fingerprint in cache:
            entry = cache[fingerprint]
            if 'request' not in entry:
                entry['request'] = payload
                enriched = True
            answer, reader = entry['answer'], entry['reader']
            cached += 1
        else:
            answer, reader = read_amount(pdf, box, model, allow_vlm=new_vlm < vlm_limit)
            if answer is None:
                deferred += 1
                continue
            new_vlm += reader == model
            entry = {'fingerprint': fingerprint, 'answer': answer,
                     'reader': reader, 'request': payload}
            cache[fingerprint] = entry
            if cache_path:
                with cache_path.open('a') as stream:
                    stream.write(json.dumps(entry, ensure_ascii=False) + '\n')
        reads.append({'page': box.page, 'observation': box.id, 'ocr': box.text, 'read': answer, 'reader': reader})
        if number(answer) is not None and number(answer) != number(box.text):
            proposal = rule(box, answer, reader).__dict__
            proposals.append(proposal)
            if reader == 'paddle-small':
                local_rules.add(proposal['id'])
            if not any(c.isdigit() for c in box.text):
                digitless_rules.add(proposal['id'])
    if enriched and cache_path:
        temporary = cache_path.with_suffix('.tmp')
        temporary.write_text(''.join(json.dumps(entry, ensure_ascii=False) + '\n' for entry in cache.values()))
        temporary.replace(cache_path)
    kept, current = [], before
    identity = lambda r: (r['parent_node_key'], r['axis_header'], r['header_path'], r['unit_text'])
    matched = lambda t: {identity(r) for r in check_tree(t.nodes, t.amounts, kind)['results'] if r['status'] == '一致'}
    # Keep local zeros, VLM unread glyphs and VLM numeric changes separate. A rejected
    # numeric batch must not discard verified missing-cell reads; none can break an existing match.
    batches = [[p for p in proposals if p['id'] in local_rules],
               [p for p in proposals if p['id'] in digitless_rules - local_rules],
               [p for p in proposals if p['id'] not in digitless_rules | local_rules]]
    for batch in batches:
        if not batch:
            continue
        # Rebuild the bounded batch once. Retain it only if problems shrink and every previously
        # matching parent/child comparison still matches. A batch that fails stays undeclared.
        declarations = [*existing, *kept, *batch]
        rebuilt = build_table(source, {**options, 'amount_corrections': declarations}, stop=False, rules=rules)
        after = problems(rebuilt, amount_sources(rebuilt, source, declarations), kind)
        if after < current and len(rebuilt.built.unowned) <= len(table.built.unowned) and matched(table) <= matched(rebuilt):
            kept.extend(batch)
            table, current = rebuilt, after
    return {'conversion': conversion['id'], 'before': before, 'after': current, 'read': reads, 'added': kept,
            'remaining_cells': max(0, len(boxes) - limit) + deferred,
            'new_vlm': new_vlm, 'cached': cached, 'deferred': deferred}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', type=Path, required=True, help='Adopted manifest or measurement plan')
    parser.add_argument('--inputs', type=Path, required=True)
    parser.add_argument('--conversion', action='append', required=True)
    parser.add_argument('--model', default=MODEL)
    parser.add_argument('--limit', type=int, default=LIMIT)
    parser.add_argument('--vlm-limit', type=int, default=LIMIT, help='Maximum new VLM crops per conversion (local OCR/cache excluded)')
    parser.add_argument('--cells', type=Path, help='JSON list of {page, observation_id}; restrict to these bound failing cells')
    parser.add_argument('--write', action='store_true')
    args = parser.parse_args()
    document = manifest.validate(json.loads(args.manifest.read_text()))
    selected = [c for c in document['conversions'] if c['id'] in args.conversion]
    if set(args.conversion) - {c['id'] for c in selected}:
        parser.error('Unknown conversion ID')
    files = json.loads(args.inputs.read_text())
    cells = None
    if args.cells is not None:
        records = json.loads(args.cells.read_text())
        if not isinstance(records, list) or not records or any(
                not isinstance(r, dict) or set(r) != {'page', 'observation_id'}
                or type(r['page']) is not int or r['page'] < 1
                or not isinstance(r['observation_id'], str) or not r['observation_id'] for r in records):
            parser.error('--cells must contain a nonempty list of page/observation_id pairs')
        cells = {(r['page'], r['observation_id']) for r in records}
    for conversion in selected:
        report = recheck(document, conversion, Path(files[conversion['inputs'][0]['sha256']]), args.model, args.limit,
                         cache_path=args.manifest.with_suffix('.amount-recheck.jsonl'), vlm_limit=args.vlm_limit,
                         cells=cells)
        if args.write and report['added']:
            conversion['options'].setdefault('amount_corrections', []).extend(report['added'])
            args.manifest.write_text(json.dumps(document, ensure_ascii=False, indent=2) + '\n')
        print(json.dumps(report, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
