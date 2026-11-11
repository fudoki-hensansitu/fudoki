"""Document quirk: a skewed scan leaves pieces of its rules and of the column headings as ink OCR did not read (132144).
Ink no taller than a line centred on a row rule of a band at that x, narrow ink over a column rule where it crosses a
row rule, or a narrow mark centred on a column rule is a rule's piece: a figure sits between the rules. Ink that runs
up past the body's top rule, centred just under it, is the heading's or the unit row's (`(比較)`, `千円` over the
rule); so is ink on the line of a word of the column's heading read again in the column (`(前` `年 度)` of the header
of a table stacked under another)."""
import re

SCOPE = 'document'
OPTIONS = {'const': True}


def ruled(box: list, page_: dict, logicals_: list) -> bool:
    cx, cy = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
    here = [b for logical in logicals_ for b in logical.bands if b.page == page_['page_number']
            and b.x0 - b.offset - 4 < cx < b.x1 - b.offset + 4]
    edges = [x for b in here for x in (b.x0 - b.offset, b.x1 - b.offset)]
    rows = [row for b in here for row in (*(b.rows or ()), b.body_top, b.body_bottom)]
    on_row = box[3] - box[1] <= 16 and any(abs(cy - row) <= 3 for row in rows)
    junction = (box[3] - box[1] <= 80 or box[2] - box[0] <= 24) and any(box[1] < row < box[3] for row in rows) \
        and any(box[0] - 8 <= x <= box[2] + 8 for x in edges)
    if on_row or junction or (box[2] - box[0] <= 12 and any(abs(cx - x) <= 5 for x in edges)):
        return True
    if any(b.page == page_['page_number'] and b.x0 - b.offset < cx < b.x1 - b.offset
           and box[1] < b.body_top and cy < b.body_top + 10 for logical in logicals_ for b in logical.bands):
        return True
    return any(
        abs((o['bbox_pdf_pt'][1] + o['bbox_pdf_pt'][3]) / 2 - cy) <= 4 and max(o['bbox_pdf_pt'][0] - box[2], box[0] - o['bbox_pdf_pt'][2]) < 30
        and not re.search(r'[0-9０-９]', o['raw_text']) and re.search(r'[一-龥ぁ-んァ-ン]', o['raw_text'])
        for region in page_.get('regions', []) for o in region.get('observations', [])
        if not o.get('parent_id') and o.get('bbox_pdf_pt') and any(
            b.kind == 'amount' and b.x0 - b.offset < (o['bbox_pdf_pt'][0] + o['bbox_pdf_pt'][2]) / 2 < b.x1 - b.offset
            and all(c in ''.join(b.header) for c in re.findall(r'[一-龥ぁ-んァ-ン]', o['raw_text']))
            for b in here))
