"""Document quirk: a skewed scan leaves pieces of its rules and of the column headings as ink OCR did not read (132144).
Ink no taller than a line centred on a row rule of a band at that x, narrow ink over a column rule where it crosses a
row rule, a narrow mark on or beside a column rule, or a line of ink across a column rule is a rule's piece: a figure
sits between the rules. A heavy rule (新宿区) is read up to 14pt wide and 18pt tall, and the column rules of a blank
row are read as one line of ink across them (新宿区 R8 p41, 22–542; up to 50pt high across two rules or more); a
row rule read in no piece leaves a line of ink with nothing read on its line to the left (p36, under `14 工事請負費`).
Ink that runs up past the body's top rule, centred just under it, is the heading's or the unit row's (`(比較)`, `千円`
over the rule); so is ink on the line of a word of the column's heading read again in the column (`(前` `年 度)` of the
header of a table stacked under another)."""
import re

SCOPE = 'document'
OPTIONS = {'const': True}
LEFT = 150.  # pt: how far left of the ink the line of its name or figures is looked for


def ruled(box: list, page_: dict, logicals_: list) -> bool:
    cx, cy = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
    here = [b for logical in logicals_ for b in logical.bands if b.page == page_['page_number']
            and b.x0 - b.offset - 4 < cx < b.x1 - b.offset + 4]
    edges = [x for b in here for x in (b.x0 - b.offset, b.x1 - b.offset)]
    rows = [row for b in here for row in (*(b.rows or ()), b.body_top, b.body_bottom)]
    on_row = box[3] - box[1] <= 18 and any(abs(cy - row) <= 3 for row in rows)
    junction = (box[3] - box[1] <= 80 or box[2] - box[0] <= 24) and any(box[1] < row < box[3] for row in rows) \
        and any(box[0] - 8 <= x <= box[2] + 8 for x in edges)
    crossed = sum(1 for x in set(edges) if box[0] + 4 < x < box[2] - 4)
    crossing = (box[3] - box[1] <= 24 and crossed) or (box[3] - box[1] <= 50 and crossed >= 2)
    beside = box[2] - box[0] <= 14 and any(box[0] - 4 <= x <= box[2] + 4 for x in edges)
    # (a row rule read in no piece: a figure prints on the line of its name or of the figures left of it)
    alone = box[3] - box[1] <= 18 and not any(
        box[0] - LEFT < o['bbox_pdf_pt'][2] <= box[0] + 2 and o['bbox_pdf_pt'][1] < cy < o['bbox_pdf_pt'][3]
        for region in page_.get('regions', []) for o in region.get('observations', [])
        if not o.get('parent_id') and o.get('bbox_pdf_pt'))
    if on_row or junction or crossing or beside or alone:
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
