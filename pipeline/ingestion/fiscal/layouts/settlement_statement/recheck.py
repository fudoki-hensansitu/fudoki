"""Re-read the amount cells of a failing table with a vision LLM and declare the corrections.

Runs outside the converter, like OCR acquisition (ADR 0019): the conversion only reads the
declared ``amount_corrections``. A cell is re-read when its amount is unreadable or belongs to
a parent/children group the tree check rejects. A re-read value is kept only when it differs
from the OCR and the kept set reduces the table's problems; the tree check confirms it.

The model is called through the ``pi`` coding agent on OpenCode Go (never its HTTP API
directly). ``pi`` writes to ~/.pi, so run this outside a sandbox.
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile

from ingestion.fiscal import manifest
from ingestion.fiscal.layouts.settlement_statement.convert import ocr_boxes
from ingestion.fiscal.layouts.settlement_statement.statement import amount_text, build, normalize
from ingestion.fiscal.storage import fetch_ocr
from ingestion.lib import pdf_rules
from ingestion.lib.node_tables import amount_phase, check_tree
from ingestion.lib.ocr_names import AmountDictionary, AmountRule
from shared.amount import number

MODEL = 'opencode-go/gpt-6-luna'
PROMPT = ('画像は日本の決算書の表の一部です。印字されている金額を、桁区切りのカンマを含めて原文のまま1つだけ答えて'
          'ください。数字以外は書かないでください。読めない場合は UNREADABLE と答えてください。')
MARGIN = 4.0  # points around the cell, so its edge digits are not cut


def problems(result) -> int:
    tables = result.tables
    checked = check_tree(tables.nodes, tables.amounts)
    return (checked['counts'].get('不一致', 0) + tables.unresolved_parent_count
            + tables.unread_amount_count + len(tables.issues or []))


def failing_cells(result) -> list[tuple[str, str]]:
    """(node, header) of unreadable amounts and of every amount in a rejected group."""
    tables = result.tables
    printed = {(a['node_key'], a['header_path']) for a in tables.amounts}
    cells = [key for key in result.sources if key not in printed]
    children: dict[tuple[str, str], list[str]] = {}
    for node in tables.nodes:
        children.setdefault((node['parent_node_key'], node['axis_header']), []).append(node['node_key'])
    nodes = {node['node_key']: node for node in tables.nodes}
    for item in check_tree(tables.nodes, tables.amounts)['results']:
        if item['status'] != '不一致':
            continue
        group = {item['parent_node_key'], *children[(item['parent_node_key'], item['axis_header'])]}
        # Only the amounts the failing comparison adds up: its phase, or its exact header.
        cells.extend(key for key in result.sources if key[0] in group and key in printed and (
            key[1] == item['header_path'] or amount_phase(key[1], 'settlement', nodes[key[0]]['axis_header'],
                                                          nodes[key[0]]['level_header']) == item['header_path']))
    return list(dict.fromkeys(cells))


def read_cell(pdf: Path, box, model: str) -> str:
    with tempfile.TemporaryDirectory() as tmp:
        dpi = 200
        scale = dpi / 72
        root = Path(tmp) / 'cell'
        subprocess.run(['pdftoppm', '-r', str(dpi), '-f', str(box.page), '-l', str(box.page),
                        '-x', str(int((box.x0 - MARGIN) * scale)), '-y', str(int((box.y0 - MARGIN) * scale)),
                        '-W', str(int((box.x1 - box.x0 + 2 * MARGIN) * scale)),
                        '-H', str(int((box.y1 - box.y0 + 2 * MARGIN) * scale)),
                        '-png', '-singlefile', str(pdf), str(root)], check=True)
        run = subprocess.run(['pi', '-p', '--no-session', '--no-tools', '--no-extensions', '--no-skills',
                              '--model', model, '@' + str(root.with_suffix('.png')), PROMPT],
                             capture_output=True, text=True, timeout=300, stdin=subprocess.DEVNULL)
    if run.returncode:
        raise RuntimeError(f'pi failed: {run.stderr[-300:]}')
    return run.stdout.strip()


def rule(box, value: str, model: str) -> AmountRule:
    digest = hashlib.sha256(f'{box.page}:{box.id}'.encode()).hexdigest()[:10]
    return AmountRule(f'vlm-{digest}', box.page, box.id, box.text, value,
                      f'{model} で読み直し、木の検査で確かめた（OCR は {normalize(box.text)}）')


def recheck(document: dict, conversion: dict, pdf: Path, model: str = MODEL) -> dict:
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
    for key in failing_cells(base) if score else []:
        boxes = base.sources[key]
        if len(boxes) != 1:
            continue  # an amount assembled from several OCR pieces has no single observation to bind
        box = boxes[0]
        answer = read_cell(pdf, box, model)
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
    parser.add_argument('--write', action='store_true', help='Declare the kept corrections in the manifest')
    args = parser.parse_args()
    document = manifest.read(args.manifest)
    local = json.loads(args.inputs.read_text())
    for conversion in document['conversions']:
        if conversion['id'] not in args.conversion:
            continue
        report = recheck(document, conversion, Path(local[conversion['inputs'][0]['sha256']]), args.model)
        if args.write and report['added']:
            conversion['options'].setdefault('amount_corrections', []).extend(report['added'])
        print(json.dumps(report, ensure_ascii=False))
    if args.write:
        manifest.write(args.manifest, document)


if __name__ == '__main__':
    main()
