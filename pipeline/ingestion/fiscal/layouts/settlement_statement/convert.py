"""Legal-form settlement statement (歳出) to node and amount tables, for every jurisdiction.

One original makes one table. Scan PDFs read the OCR observation pinned in the manifest
(ADR 0019); the converter never runs OCR. Rules come from a render of the same pages.
"""
from __future__ import annotations

import gzip
import hashlib
import json
from pathlib import Path

from ingestion.fiscal.layouts.settlement_statement.statement import Box, build
from ingestion.lib.ocr_names import AmountDictionary, AmountRule
from ingestion.lib.pdf_rules import detect
from ingestion.lib.scan_ocr import superseded


def ocr_boxes(observation: dict, page: dict) -> list[Box]:
    """OCR lines of one page, each with its word pieces for splitting across columns.

    Regions are declared not to overlap (e.g. the two halves of a landscape spread),
    so lines from every region are used together; readings a fuller re-read replaced are left out.
    """
    boxes = []
    gone = superseded(page)
    for region in page['regions']:
        observations = [o for o in region['observations'] if o['id'] not in gone]
        words: dict[str, list[dict]] = {}
        for item in observations:
            if item['kind'] == 'word' and item['parent_id'] and item['bbox_pdf_pt']:
                words.setdefault(item['parent_id'], []).append(item)

        def box(item: dict, parts: tuple[Box, ...] = ()) -> Box:
            return Box(item['id'], page['page_number'], item['raw_text'], *item['bbox_pdf_pt'], parts)
        boxes.extend(box(item, tuple(box(word) for word in words.get(item['id'], [])))
                     for item in observations if item['kind'] == 'region' and item['bbox_pdf_pt'])
    return boxes


def convert(inputs: list[dict], destination: Path, options: dict) -> dict:
    if len(inputs) != 1:
        raise ValueError('One original makes one table')
    item = inputs[0]
    if len(item['scope']) != 1:
        raise ValueError('One table holds one account; split the conversion per account')
    pages = [p for first, last in item['scope'][0]['pages'] for p in range(first, last + 1)]
    if item.get('pdf_type') != 'scan':
        raise ValueError('Text PDFs are not wired to this converter yet')
    observed = {}
    for ocr in item['ocr']:
        observation = json.loads(gzip.decompress(Path(ocr['path']).read_bytes()))
        if observation['origin']['sha256'] != item['sha256']:
            raise ValueError(f'OCR input {ocr["id"]} reads another original')
        for page in observation['pages']:
            if page['page_number'] in observed:
                raise ValueError(f'Page {page["page_number"]} is read by more than one OCR input')
            observed[page['page_number']] = ocr_boxes(observation, page)
    missing = [p for p in pages if p not in observed]
    if missing:
        raise ValueError(f'No pinned OCR for pages {missing}')
    rules = options.get('amount_corrections', [])
    corrections = AmountDictionary(hashlib.sha256(json.dumps(rules, ensure_ascii=False, sort_keys=True).encode())
                                   .hexdigest(), tuple(AmountRule(**rule) for rule in rules)) if rules else None
    result = build(options['table_id'], [(detect(item['path'], p), observed[p]) for p in pages], corrections)
    return {options['table_id']: {'node_tables': result.tables, 'notes': result.notes}}
