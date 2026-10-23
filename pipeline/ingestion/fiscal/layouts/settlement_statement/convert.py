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
from ingestion.generic.observe import Word
from ingestion.generic.scan import _paddle_pieces, apply_name_corrections, apply_variant_chars
from ingestion.lib.ocr_names import AmountDictionary, AmountRule
from ingestion.lib.pdf_rules import detect
from ingestion.lib.scan_ocr import superseded


def ocr_boxes(observation: dict, page: dict, cuts: tuple[float, ...] = (), corrected_ids: frozenset[str] = frozenset()) -> list[Box]:
    """OCR lines of one page, each with its word pieces for splitting across columns.

    Regions are declared not to overlap (e.g. the two halves of a landscape spread),
    so lines from every region are used together; readings a fuller re-read replaced are left out.
    ``cuts`` are the page's vertical rules: the number fragments of two columns are never joined across one.
    A line a declared name correction changed (``corrected_ids``) is not cut from its children.
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
        def pieces(item: dict) -> tuple[Box, ...]:
            children = words.get(item['id'], [])
            if item.get('attempt_id') and children:
                # a Paddle line's children are single characters and number fragments (`3` `,` `254`): the fragments of
                # one amount are joined back into one word, as the scan builder does
                joined = _paddle_pieces(item, [Word(w['raw_text'], *w['bbox_pdf_pt']) for w in children],
                                        item['id'] in corrected_ids, list(cuts))
                if joined:
                    return tuple(Box(f'{item["id"]}:p{i}', page['page_number'], w.text, w.x0, w.y0, w.x1, w.y1) for i, w in enumerate(joined))
            return tuple(box(word) for word in children)
        boxes.extend(box(item, pieces(item)) for item in observations if item['kind'] == 'region' and item['bbox_pdf_pt'])
    return boxes


def corrected(observation: dict, name_corrections) -> tuple[dict, list[str], frozenset[str]]:
    """The observation with Paddle's Chinese letter forms and the declared misread names replaced, as the scan
    builder does (the raw observation stays); pages read by Vision are left as they are. Also the notes that
    record what was replaced (the same lines as the scan builder's) and the ids of the lines a name correction changed."""
    engine = observation.get('request', {}).get('engine')
    observation, variants = apply_variant_chars({**observation, 'pages': [{**q, 'engine': engine} for q in observation['pages']]})
    rules = [r for r in name_corrections if any(r['page'] == q['page_number'] for q in observation['pages'])]
    observation = apply_name_corrections(observation, rules)
    notes = []
    if rules:
        notes.append(f'原画で確かめた名称の誤読 {len(rules)} 件を、管理 JSON の name_corrections で印字に直した: '
                     + '・'.join(f'{r["page"]}頁 {r["observed_name"]}→{r["corrected_name"]}' for r in rules) + '。')
    if variants:
        notes.append('Paddle が中国語の字形で読む字を、字形の対応表（ocr_variant_chars.json）で日本の字形に置き換えた: '
                     + '・'.join(variants) + '。')
    ids = {r['observation_id'] for r in rules}
    lines = {o['id'] for q in observation['pages'] for region in q['regions'] for o in region['observations']
             if o['id'] in ids or o.get('parent_id') in ids}
    return observation, notes, frozenset(i.rsplit(':w', 1)[0] if ':w' in i else i for i in lines)


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
    notes: list[str] = []
    rules_of: dict[int, object] = {}
    page_rules = lambda n: rules_of.setdefault(n, detect(item['path'], n))
    for ocr in item['ocr']:
        observation = json.loads(gzip.decompress(Path(ocr['path']).read_bytes()))
        if observation['origin']['sha256'] != item['sha256']:
            raise ValueError(f'OCR input {ocr["id"]} reads another original')
        observation, made, changed = corrected(observation, options.get('name_corrections', ()))
        notes.extend(made)
        for page in observation['pages']:
            if page['page_number'] in observed:
                raise ValueError(f'Page {page["page_number"]} is read by more than one OCR input')
            number = page['page_number']
            cuts = tuple(r.position for r in page_rules(number).vertical)
            observed[number] = ocr_boxes(observation, page, cuts, changed)
    missing = [p for p in pages if p not in observed]
    if missing:
        raise ValueError(f'No pinned OCR for pages {missing}')
    rules = options.get('amount_corrections', [])
    corrections = AmountDictionary(hashlib.sha256(json.dumps(rules, ensure_ascii=False, sort_keys=True).encode())
                                   .hexdigest(), tuple(AmountRule(**rule) for rule in rules)) if rules else None
    result = build(options['table_id'], [(page_rules(p), observed[p]) for p in pages], corrections)
    return {options['table_id']: {'node_tables': result.tables, 'notes': [*result.notes, *notes]}}
