"""Document quirk: OCR reads the one-digit amounts of lines printed one under another as one number (国分寺市 R5 当初予算の
説明 `3` `4` `1` `1` as `3411`, the stacked 本年度・(前年度)・(比較) `2` `2` `0` as `220`). A reading of digits only
whose box stands upright and is as tall as one line per digit is read again as one digit per line, the box cut into
equal heights; the new readings are `<id>:s<n>`, top first. A reading a fuller re-read superseded stays as it is.
Read by `scan.read_pages`."""
import re

from ingestion.lib.ocr_ink import superseded

SCOPE = 'document'
OPTIONS = {'const': True}

LINE = (9.0, 12.5)  # pt: the height of one printed line per digit (10–11.5 at 132144)


def split(observation: dict) -> dict:
    pages = []
    for page in observation['pages']:
        replaced = superseded(page)
        regions = []
        for region in page['regions']:
            stacked = {o['id'] for o in region['observations'] if o['kind'] == 'region' and o.get('bbox_pdf_pt')
                       and o['id'] not in replaced and re.fullmatch(r'[0-9]{2,}', o['raw_text'])
                       and o['bbox_pdf_pt'][3] - o['bbox_pdf_pt'][1] > 1.5 * (o['bbox_pdf_pt'][2] - o['bbox_pdf_pt'][0])
                       and LINE[0] <= (o['bbox_pdf_pt'][3] - o['bbox_pdf_pt'][1]) / len(o['raw_text']) <= LINE[1]}
            kept = []
            for o in region['observations']:
                if o.get('parent_id') in stacked:
                    continue
                if o['id'] not in stacked:
                    kept.append(o)
                    continue
                x0, y0, x1, y1 = o['bbox_pdf_pt']
                step = (y1 - y0) / len(o['raw_text'])
                for i, digit in enumerate(o['raw_text']):
                    box = [max(x0, x1 - 7.0), y0 + i * step, x1, y0 + (i + 1) * step]
                    line = {**o, 'id': f'{o["id"]}:s{i}', 'raw_text': digit, 'bbox_pdf_pt': box}
                    kept += [line, {**line, 'id': f'{line["id"]}:w0', 'kind': 'word', 'parent_id': line['id']},
                             {**line, 'id': f'{line["id"]}:n0', 'kind': 'number', 'parent_id': line['id']}]
            regions.append({**region, 'observations': kept})
        pages.append({**page, 'regions': regions})
    return {**observation, 'pages': pages}
