"""Re-read the amount cells of a failing table with a vision LLM and declare the corrections.

Runs outside the converter, like OCR acquisition (ADR 0019): the conversion only reads the
declared ``amount_corrections``. A cell is re-read when its amount is unreadable or belongs to
a parent/children group the tree check rejects. A re-read value is kept only when it differs
from the OCR and the kept set reduces the table's problems; the tree check confirms it.

The model is called through ``ingestion.lib.vlm_ocr`` (``pi`` on OpenCode Go); run this
outside a sandbox.
"""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
import gzip
import hashlib
import json
from pathlib import Path

from ingestion.fiscal import manifest
from ingestion.fiscal.layouts.settlement_statement.convert import ocr_boxes
from ingestion.fiscal.layouts.settlement_statement.statement import amount_text, build, normalize
from ingestion.fiscal.storage import fetch_ocr
from ingestion.lib import pdf_rules, vlm_ocr
from ingestion.lib.node_tables import amount_phase, check_tree
from ingestion.lib.ocr_names import AmountDictionary, AmountRule
from shared.amount import number

MODEL = vlm_ocr.MODEL
PROMPT = ('画像は日本の決算書の表の一部です。印字されている金額を、桁区切りのカンマを含めて原文のまま1つだけ答えて'
          'ください。数字以外は書かないでください。読めない場合は UNREADABLE と答えてください。')
LIMIT = 60  # reads per table; a table needing more has errors of structure, not of digits
MARGIN = 4.0  # points around the cell, so its edge digits are not cut


def problems(result) -> int:
    tables = result.tables
    checked = check_tree(tables.nodes, tables.amounts)
    return (checked['counts'].get('不一致', 0) + tables.unresolved_parent_count
            + tables.unread_amount_count + len(tables.issues or []))


def failing_cells(result) -> list[tuple[str, str]]:
    """(node, header) of unreadable amounts, then of every amount in a rejected group, smallest
    groups first: a small group's misread is found with few reads."""
    tables = result.tables
    printed = {(a['node_key'], a['header_path']) for a in tables.amounts}
    cells = [key for key in result.sources if key not in printed]
    children: dict[tuple[str, str], list[str]] = {}
    for node in tables.nodes:
        children.setdefault((node['parent_node_key'], node['axis_header']), []).append(node['node_key'])
    nodes = {node['node_key']: node for node in tables.nodes}
    rejected = [item for item in check_tree(tables.nodes, tables.amounts)['results'] if item['status'] == '不一致']
    for item in sorted(rejected, key=lambda i: len(children[(i['parent_node_key'], i['axis_header'])])):
        group = {item['parent_node_key'], *children[(item['parent_node_key'], item['axis_header'])]}
        # Only the amounts the failing comparison adds up: its phase, or its exact header.
        cells.extend(key for key in result.sources if key[0] in group and key in printed and (
            key[1] == item['header_path'] or amount_phase(key[1], 'settlement', nodes[key[0]]['axis_header'],
                                                          nodes[key[0]]['level_header']) == item['header_path']))
    return list(dict.fromkeys(cells))


def read_cell(pdf: Path, box, model: str) -> str:
    return vlm_ocr.read(pdf, box.page, (box.x0, box.y0, box.x1, box.y1), PROMPT, model=model, margin=MARGIN, dpi=200)


def rule(box, value: str, model: str) -> AmountRule:
    digest = hashlib.sha256(f'{box.page}:{box.id}'.encode()).hexdigest()[:10]
    return AmountRule(f'vlm-{digest}', box.page, box.id, box.text, value,
                      f'{model} で読み直し、木の検査で確かめた（OCR は {normalize(box.text)}）')


def recheck(document: dict, conversion: dict, pdf: Path, model: str = MODEL, limit: int = LIMIT) -> dict:
    if len(conversion['ocr_inputs']) != 1:
        raise ValueError('The recheck reads a conversion with one OCR input')
    ocr = conversion['ocr_inputs'][0]
    observation = json.loads(gzip.decompress(fetch_ocr(document, ocr).read_bytes()))
    pages = [(pdf_rules.detect(pdf, p['page_number']), ocr_boxes(observation, p)) for p in observation['pages']]
    table_id = conversion['options']['table_id']
    existing = [AmountRule(**r) for r in conversion['options'].get('amount_corrections', [])]

    def built(rules: list[AmountRule]):
        dictionary = AmountDictionary('recheck', tuple(rules)) if rules else None
        return build(table_id, pages, dictionary)
    base = built(existing)
    score = problems(base)
    proposals, reads = [], []
    # An amount assembled from several OCR pieces has no single observation to bind.
    declared = {(r.page, r.observation_id) for r in existing}  # already corrected: not read again
    boxes = [base.sources[key][0] for key in (failing_cells(base) if score else [])
             if len(base.sources[key]) == 1 and (base.sources[key][0].page, base.sources[key][0].id) not in declared]
    boxes = list({(b.page, b.id): b for b in boxes}.values())[:limit]  # one box may print two amounts
    with ThreadPoolExecutor(4) as pool:
        answers = list(pool.map(lambda box: read_cell(pdf, box, model), boxes))
    for box, answer in zip(boxes, answers):
        reads.append({'page': box.page, 'observation': box.id, 'ocr': box.text, 'read': answer})
        if number(answer) is not None and number(answer) != number(amount_text([box])):
            proposals.append(rule(box, answer, model))
    kept = list(existing)
    if proposals:
        # All re-reads together first; else add them one by one while the problems shrink.
        trial = built([*kept, *proposals])
        if problems(trial) < score and problems(trial) == 0:
            kept, score = [*kept, *proposals], 0
        else:
            for candidate in proposals:
                attempt = built([*kept, candidate])
                if problems(attempt) < score:
                    kept, score = [*kept, candidate], problems(attempt)
    added = [r for r in kept if r not in existing]
    return {'conversion': conversion['id'], 'before': problems(base), 'after': score,
            'read': reads, 'added': [r.__dict__ for r in added]}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', type=Path, required=True)
    parser.add_argument('--inputs', type=Path, required=True, help='JSON: original SHA-256 to local file path')
    parser.add_argument('--conversion', action='append', required=True)
    parser.add_argument('--model', default=MODEL)
    parser.add_argument('--limit', type=int, default=LIMIT, help='Most cells read per table')
    parser.add_argument('--write', action='store_true', help='Declare the kept corrections in the manifest')
    args = parser.parse_args()
    document = manifest.read(args.manifest)
    local = json.loads(args.inputs.read_text())
    for conversion in document['conversions']:
        if conversion['id'] not in args.conversion:
            continue
        report = recheck(document, conversion, Path(local[conversion['inputs'][0]['sha256']]), args.model, args.limit)
        if args.write and report['added']:
            conversion['options'].setdefault('amount_corrections', []).extend(report['added'])
            manifest.write(args.manifest, document)  # per table, so a later failure keeps these
        print(json.dumps(report, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
