"""Document quirk: OCR reads the letter-spaced characters of lines printed one under another, at the same place in each
line, as one upright reading (足立区 R5 当初予算の節 `7 報 償 費` `8 旅 費` `10 需 用 費` …, the last characters
`費` `費` `費` `費` `料` read top to bottom as `費費費費料`). A reading of two or more words of one character each,
whose words stand one under another in one column and whose box is taller than twice its width, is read again as one
reading per word, at the word's own box; the new readings are `<id>:c<n>`, top first. A reading a fuller re-read
superseded stays as it is. Read by `scan.read_pages`."""
from ingestion.lib.ocr_ink import superseded

SCOPE = 'document'
OPTIONS = {'const': True}

OVERLAP = 0.6  # the share of the narrower word's width two words of one column overlap at least
REACH = 0.3    # the share of the shorter word's height a word may reach into the one above it


def _column(words: list[dict]) -> bool:
    for upper, lower in zip(words, words[1:]):
        a, b = upper['bbox_pdf_pt'], lower['bbox_pdf_pt']
        width, height = min(a[2] - a[0], b[2] - b[0]), min(a[3] - a[1], b[3] - b[1])
        if (width <= 0 or min(a[2], b[2]) - max(a[0], b[0]) < OVERLAP * width
                or b[1] < a[3] - REACH * height):
            return False
    return True


def split(observation: dict) -> dict:
    pages = []
    for page in observation['pages']:
        replaced = superseded(page)
        regions = []
        for region in page['regions']:
            words: dict[str, list[dict]] = {}
            for o in region['observations']:
                if o['kind'] == 'word' and o.get('bbox_pdf_pt') and o.get('parent_id'):
                    words.setdefault(o['parent_id'], []).append(o)
            stacked = {}
            for o in region['observations']:
                box = o.get('bbox_pdf_pt')
                mine = sorted(words.get(o['id'], ()), key=lambda w: w['bbox_pdf_pt'][1])
                if (o['kind'] == 'region' and box and o['id'] not in replaced and len(mine) >= 2
                        and box[3] - box[1] > 2 * (box[2] - box[0])
                        and all(len(w['raw_text'].strip()) == 1 for w in mine)
                        and ''.join(w['raw_text'].strip() for w in mine) == ''.join(o['raw_text'].split())
                        and _column(mine)):
                    stacked[o['id']] = mine
            kept = []
            for o in region['observations']:
                if o.get('parent_id') in stacked:
                    continue
                if o['id'] not in stacked:
                    kept.append(o)
                    continue
                for i, word in enumerate(stacked[o['id']]):
                    line = {**o, 'id': f'{o["id"]}:c{i}', 'raw_text': word['raw_text'].strip(),
                            'bbox_pdf_pt': word['bbox_pdf_pt']}
                    kept += [line, {**line, 'id': f'{line["id"]}:w0', 'kind': 'word', 'parent_id': line['id']}]
            regions.append({**region, 'observations': kept})
        pages.append({**page, 'regions': regions})
    return {**observation, 'pages': pages}
