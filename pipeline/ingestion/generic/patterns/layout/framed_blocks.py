"""Blocks of different columns stacked down each printed page (足立区の予算説明書).

Each 目 prints three ruled blocks one under another, each with its own header: the 款・項・目 and their amounts
(`款項目 | 本年度 | 前年度 | 比較`), the 財源内訳 beside the 節 (`財源内訳 区分 金額 | 節 区分 金額`), then the 説明
(one column, the amounts at its right end). A block runs on at the top of the next printed page without its header.
A sheet prints two pages side by side, each in its own frame.

Each printed page is one logical page. Every block is read as a table of its own (`layout.page_bands` on the block
alone), and the blocks of one kind share their columns: the columns of the 節 block and of the 説明 block are moved
to the right of the 款・項・目 columns (as a spread's right page is), so the rows of all blocks keep their order down
the page and the 節 and 説明 rows fall under the 目 printed above them.
"""
from __future__ import annotations

from collections import defaultdict
import re
from dataclasses import replace

from ingestion.generic import layout
from ingestion.generic.layout import Band, Glyph, Logical, is_amount, lines, normalize, text
from ingestion.generic.observe import Page, Rule

MIN_FRAME = 300  # a rule as wide as a printed page's frame (the row rules of its blocks run across it)
SIDE = 3  # how far a rule may end from the frame's side and still run across it
GAP = 10  # space between the moved groups of columns


def kind_of(heading: str) -> str | None:
    """The block a header line opens: 款・項・目, 節 (with the 財源内訳) or 説明."""
    if '款項目' in heading or heading.startswith('本年度前年度'):
        return 'subject'
    if heading.startswith('財源内訳'):
        return 'setsu'
    if heading == '説明':
        return 'explanation'
    return None


GROUP = {'subject': 0, 'setsu': 1, 'explanation': 2}


def frames(page: Page) -> list[tuple[float, float, float, float]]:
    """The frame of each printed page on the sheet: (x0, x1, top, bottom) of the wide row rules."""
    wide = [r for r in page.rules if not r.vertical and r.x1 - r.x0 >= MIN_FRAME]
    found: list[list[Rule]] = []
    for rule in sorted(wide, key=lambda r: r.x0):
        group = next((g for g in found if abs(g[0].x0 - rule.x0) <= SIDE and abs(g[0].x1 - rule.x1) <= SIDE), None)
        if group is None:
            found.append([rule])
        else:
            group.append(rule)
    boxes = [(g[0].x0, g[0].x1, min(r.y0 for r in g), max(r.y0 for r in g)) for g in found if len(g) >= 2]
    # The rows of a staircase start at its 項 column (`1 校外施設管理費` under `4 校外施設費`): inside a frame, no frame.
    inside = lambda a, b: a != b and b[0] <= a[0] + SIDE and a[1] <= b[1] + SIDE and b[2] <= a[2] and a[3] <= b[3]
    return [box for box in boxes if not any(inside(box, other) for other in boxes)]


def clipped(rule: Rule, top: float, bottom: float) -> Rule | None:
    if rule.vertical:
        y0, y1 = max(rule.y0, top), min(rule.y1, bottom)
        return Rule(rule.x0, y0, rule.x1, y1) if y1 - y0 > 1 else None
    return rule if top - 1 <= rule.y0 <= bottom + 1 else None


def segments(page: Page, frame) -> list[tuple[str | None, float, float]]:
    """The blocks of one frame, top to bottom: (kind, top, bottom). Kind None: the block runs on from the page before."""
    x0, x1, top, bottom = frame
    across = sorted({round(r.y0, 1) for r in page.rules if not r.vertical and r.x0 <= x0 + SIDE and r.x1 >= x1 - SIDE
                     and top - 1 <= r.y0 <= bottom + 1})
    inside = [Glyph(w.text, w.x0, w.y0, w.x1, w.y1, page.number, 0) for w in page.words
              if x0 < (w.x0 + w.x1) / 2 < x1 and top < (w.y0 + w.y1) / 2 < bottom]
    starts = []
    for line in lines(inside):
        kind = kind_of(normalize(text(line)))
        if kind:
            middle = sum((w.y0 + w.y1) / 2 for w in line) / len(line)
            starts.append((kind, max([y for y in across if y < middle] or [top])))
    found = []
    if not starts or starts[0][1] > top + 1:
        found.append((None, top, starts[0][1] if starts else bottom))
    for (kind, start), following in zip(starts, [*starts[1:], (None, bottom)]):
        found.append((kind, start, following[1]))
    return found


def block_page(page: Page, frame, top: float, bottom: float) -> Page:
    """The block alone, as a page of its own: its words, and its rules cut to its height.

    A column of the block is drawn down its first row. A rule through a header word on its line is a step of the
    款・項・目 staircase (`款項目` printed over the three code columns), not a column: the 款・項・目 are read as one
    column by their indent, as the rows that open a block with the 目 alone are."""
    x0, x1, _, _ = frame
    rules = []
    for rule in page.rules:
        if rule.vertical and not (x0 - SIDE <= rule.x0 <= x1 + SIDE):
            continue
        if not rule.vertical and (rule.x1 < x0 - SIDE or rule.x0 > x1 + SIDE):
            continue
        cut = clipped(rule, top, bottom)
        if cut is not None:
            rules.append(cut)
    words = [w for w in page.words if x0 < (w.x0 + w.x1) / 2 < x1 and top < (w.y0 + w.y1) / 2 < bottom]
    across = sorted(r.y0 for r in rules if not r.vertical and r.x0 <= x0 + SIDE and r.x1 >= x1 - SIDE)
    digits = [w.y0 for w in words if re.search(r'[0-9０-９]', w.text)]
    first = min(digits) if digits else bottom
    header_bottom = max([y for y in across if y <= first + 1] or [top])
    head = [w for w in words if (w.y0 + w.y1) / 2 < header_bottom]
    # The 款・項・目 printed over the code columns, as one word or one word each.
    levels = []
    for line in lines([Glyph(w.text, w.x0, w.y0, w.x1, w.y1, page.number, 0) for w in head]):
        marks = [g for g in line if normalize(g.text) and set(normalize(g.text)) <= set('款項目')]
        if ''.join(normalize(g.text) for g in marks) == '款項目':
            levels.append((marks[0].x0, marks[-1].x1, sum((g.y0 + g.y1) / 2 for g in marks) / len(marks)))
    kept = []
    for rule in rules:
        if rule.vertical:
            if not (rule.y0 - 1 <= header_bottom + 2 <= rule.y1 + 1):
                continue
            if any(a + 1 < rule.x0 < b - 1 and rule.y0 - 1 <= y <= rule.y1 + 1 for a, b, y in levels):
                continue
        kept.append(rule)
    return Page(page.number, page.width, page.height, words, kept)


def continued(page: Page, frame, top: float, bottom: float, template: list[Band]) -> list[Band]:
    """A block that runs on from the page before, without its header: read in the columns of the block it continues."""
    x0 = frame[0]
    words = [w for w in page.words if frame[0] < (w.x0 + w.x1) / 2 < frame[1] and top < (w.y0 + w.y1) / 2 < bottom]
    rows = sorted(r.y0 for r in page.rules if not r.vertical and r.x0 <= frame[0] + SIDE and r.x1 >= frame[1] - SIDE
                  and top - 1 <= r.y0 <= bottom + 1)
    bands = []
    for model in template:
        left, right = x0 + model.x0, x0 + model.x1
        band = Band(left, right, page.number, model.header, rows, top, bottom,
                    spans=[(x0 + a, x0 + b, t) for a, b, t in model.spans], top=top, unit_mark=model.unit_mark)
        for word in words:
            sx = word.x0 + min(2, (word.x1 - word.x0) / 2)
            if is_amount(word.text) and ',' in word.text:
                sx = (word.x0 + word.x1) / 2
            if left < sx < right:
                band.words.append(Glyph(word.text, word.x0, word.y0, word.x1, word.y1, page.number, 0))
        bands.append(band)
    return bands


def merged(bands: list[Band]) -> Band:
    """The bands of one column over the blocks of a page, as one band."""
    first = bands[0]
    return replace(first, rows=sorted({y for b in bands for y in b.rows}),
                   body_top=min(b.body_top for b in bands), body_bottom=max(b.body_bottom for b in bands),
                   words=[w for b in bands for w in b.words], spans=first.spans,
                   left_rules=[r for b in bands for r in b.left_rules],
                   extents=[(b.top if b.top is not None else b.body_top, b.body_bottom) for b in bands])


def shifted(band: Band, offset: float) -> Band:
    band.x0 += offset
    band.x1 += offset
    band.offset = offset
    band.spans = [(a + offset, b + offset, t) for a, b, t in band.spans]
    band.words = [Glyph(w.text, w.x0 + offset, w.y0, w.x1 + offset, w.y1, w.page, offset) for w in band.words]
    return band


def read(pages, *, columns: dict | None = None, header: dict | None = None, **_options):
    per_page = []  # (page, bands, outside) of each printed page
    templates: dict[str, list[Band]] = {}
    kind = None
    for page in pages:
        sheet = frames(page)
        for frame in sorted(sheet, key=lambda f: f[0]):
            x0, x1, _, _ = frame
            by_column: dict[tuple, list[Band]] = defaultdict(list)
            for found, top, bottom in segments(page, frame):
                if found is None:
                    if kind is None or not any(x0 < (w.x0 + w.x1) / 2 < x1 and top < (w.y0 + w.y1) / 2 < bottom
                                               for w in page.words):
                        continue
                    bands = continued(page, frame, top, bottom, templates[kind])
                else:
                    kind = found
                    bands, _ = layout.page_bands(block_page(page, frame, top, bottom), header=header)
                    templates[kind] = [replace(b, x0=b.x0 - x0, x1=b.x1 - x0, words=[],
                                               spans=[(a - x0, c - x0, t) for a, c, t in b.spans]) for b in bands]
                for band in bands:
                    by_column[(GROUP[kind], round(band.x0 - x0), band.header)].append(band)
            width = x1 - x0 + GAP
            # A page all of one block (a 説明 running on over the whole page) still has the columns of the others,
            # empty: the page is a page of the detail, not a table with no 款・項・目 column.
            for name, template in templates.items():
                for model in template:
                    key = (GROUP[name], round(model.x0), model.header)
                    if key not in by_column:
                        top = frame[2]
                        by_column[key].append(Band(x0 + model.x0, x0 + model.x1, page.number, model.header, [], top, top,
                                                   spans=[(x0 + a, x0 + b, t) for a, b, t in model.spans], top=top,
                                                   unit_mark=model.unit_mark))
            # Every frame starts at the same x (the left and right pages of a sheet indent their 款・項・目 alike).
            frame_bands = [shifted(merged(bands), key[0] * width + GAP - x0)
                           for key, bands in sorted(by_column.items(), key=lambda kv: kv[0][:2])]
            # A word moved into a frame comes back as `(x + offset) - offset`: compare at a rounding it survives.
            framed = {tuple(round(v, 3) for v in g.original) for b in frame_bands for g in b.words}
            outside = [w for w in page.words if x0 < (w.x0 + w.x1) / 2 < x1
                       and tuple(round(v, 3) for v in (w.x0, w.y0, w.x1, w.y1)) not in framed]
            per_page.append((page, frame_bands, outside))
    layout.classify(per_page, columns)
    result = []
    for page, bands, outside in per_page:
        if not bands:
            continue
        glyphs = [Glyph(w.text, w.x0, w.y0, w.x1, w.y1, page.number, 0) for w in outside]
        unit = None
        for line in lines(glyphs):
            match = layout.UNIT.search(normalize(text(line)))
            if match:
                unit = match.group(1)
        foot = {page.number: [(b.x0 - b.offset, b.x1 - b.offset, b.body_bottom) for b in bands]}
        result.append(Logical([page.number], bands, unit, glyphs, foot=foot, reprints=False))
    return result
