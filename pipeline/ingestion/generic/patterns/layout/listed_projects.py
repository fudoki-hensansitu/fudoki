"""A list of 目, 事業 and 節 under one header whose column rules show only in the header (町田市の事業別支出科目一覧).

The header `款 項 目 | 事業名 | 所属名 | 金額（千円）` draws the edges of its columns, and the body draws no vertical rule
but a few short pieces: each 目 row is ruled across the frame, each 事業 row across the columns right of the 目.
Read by the body's own rules, the 款・項・目 codes of a 目 row fall in one band (`2` `1` `14` → `2114`) and the
所属名 and 金額 in the 事業名 band. Here each vertical rule that starts at the frame's top runs down to its bottom,
so every row is read in the header's columns.

A row rule boxes a 目, or a 事業 with its 節 under it, so a ruled row holds many lines, each an item with its own
amount. A rule is drawn between each two lines of the body, across the frame: each line is a row.
"""
from dataclasses import replace

from ingestion.generic import layout
from ingestion.generic.observe import Rule

REACH = 2.0  # how far from the frame's edges a rule still meets them


def columns_down(page):
    """The page with each column rule of the header run down to the frame's bottom rule."""
    horizontals = [r for r in page.rules if not r.vertical]
    if not horizontals:
        return page
    left, right = min(r.x0 for r in horizontals), max(r.x1 for r in horizontals)
    whole = sorted(r.y0 for r in horizontals if r.x0 <= left + REACH and r.x1 >= right - REACH)
    if len(whole) < 2:
        return page
    top, bottom = whole[0], whole[-1]
    added = [Rule(r.x0, r.y1, r.x0, bottom) for r in page.rules
             if r.vertical and left + REACH < r.x0 < right - REACH and abs(r.y0 - top) <= REACH and r.y1 < bottom - REACH]
    body = sorted(((w.y0 + w.y1) / 2, w.y0, w.y1) for w in page.words if top < w.y0 and w.y1 < bottom)
    heading = min((r.y0 for r in horizontals if r.y0 > top + REACH), default=top)
    lines: list[list[float]] = []
    for middle, y0, y1 in body:
        if y0 <= heading:
            continue
        if lines and middle <= lines[-1][1]:
            lines[-1][1] = max(lines[-1][1], y1)
        else:
            lines.append([y0, y1])
    added += [Rule(left, (above[1] + below[0]) / 2, right, (above[1] + below[0]) / 2)
              for above, below in zip(lines, lines[1:]) if below[0] > above[1]]
    return replace(page, rules=[*page.rules, *added])


def read(pages, **options):
    return layout.logical_pages([columns_down(page) for page in pages], **options)
