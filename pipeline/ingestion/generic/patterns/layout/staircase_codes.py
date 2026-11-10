"""A staircase of narrow 款・項・目 code columns beside one name column, under running 款・項 heads (荒川区の予算説明書).

The header cell `款 項 目` spans three narrow columns, one per level, and the name column after them. Each code is
set right in its level's column: the 款 `10` starts a digit before the 款 `2`, and read by where it starts it is a
level of its own. Here a code printed in a narrow code column starts at the column's left edge, so the column is
its level (its box only grows to the left, over the column's padding: the printed digits stay inside it).

A name too long for the name column wraps to a second line (`財政安定化基金` / `拠出金`), with nothing else on it.
That line is read as the end of the line above, so it is no item of its own with no code.

Each spread prints the 款・項・目 rows on its left page and the 節 and 説明 of each 目 on its right page, in rows
of its own height (a 目 row on the left is three ruled rows on the right), so `layout.same_rows` does not see one
spread. A page with no 款・項・目 column after a page with one is joined to it here as its right half.

The 説明 of a 目 may open with figures of the work in its sentence (`登録人口 ２１９，２６８人`, `２４校`), letter
spaced. They are counts, not amounts: each such line is an excluded box (本文) of the coverage check.

Above the frame each page prints the 款 and 項 it continues (`(款) 2 総務費` / `(項) 1 総務管理費`), while the
table itself prints the 款・項 rows where they open. The heads repeat the rows, so they are not read as titles.
"""
import re
from dataclasses import replace

from ingestion.generic import layout
from ingestion.generic.layout import Glyph, is_amount, lines, normalize, runs, text

NARROW = 20  # wider than a code column, narrower than the name column
HEAD = re.compile(r'^[(（](款|項)[)）][0-9]+')


def wrapped_names(logical: layout.Logical, band: layout.Band) -> None:
    """The second line of a wrapped name joins the line above it (see the module doc): set right after it."""
    others = [g for b in logical.bands if b is not band for g in b.words]
    joined = []
    for page in sorted({w.page for w in band.words}):
        found = lines([w for w in band.words if w.page == page])
        for above, line in zip(found, found[1:]):
            middle = (line[0].y0 + line[0].y1) / 2
            height = line[0].y1 - line[0].y0
            if (any(c.isdigit() for g in line for c in g.text) or line[0].y0 - max(g.y1 for g in above) > height
                    or abs(line[0].x0 - above[0].x0) > 3
                    or any(g.page == page and abs((g.y0 + g.y1) / 2 - middle) <= height / 2 for g in others)):
                continue
            last = max(above, key=lambda g: g.x1)
            start = last.x1
            for glyph in line:
                width = glyph.x1 - glyph.x0
                joined.append((glyph, Glyph(glyph.text, start, last.y0, start + width, last.y1, glyph.page, glyph.offset)))
                start += width
    moved = {id(old): new for old, new in joined}
    band.words = [moved.get(id(w), w) for w in band.words]


COUNT = re.compile(r'[0-9][0-9,]*\)?\s*(?:人|世帯|件|校|学級|園|か所|現在)')
REASON = '説明の文の中の事業の数字（登録人口・学校数など）。件数・人数で、金額ではない。'


def counts(band: layout.Band) -> list[layout.Band]:
    """An excluded box for each line of figures in the 説明 (see the module doc)."""
    found = []
    for page in sorted({w.page for w in band.words}):
        for line in lines([w for w in band.words if w.page == page]):
            shown = normalize(text(line)).replace(' ', '')
            if not COUNT.search(shown) or is_amount(normalize(text(runs(line)[-1]))):
                continue
            box = [min(g.x0 - g.offset for g in line), min(g.y0 for g in line),
                   max(g.x1 - g.offset for g in line), max(g.y1 for g in line)]
            found.append(replace(band, header=(*band.header, '件数'), words=[], kind=None, rows=[], spans=[],
                                 excluded={'kind': '本文', 'reason': REASON, 'page': page,
                                           'bbox': [box[0] - 1, box[1] - 1, box[2] + 1, box[3] + 1]}))
    return found


def subject(logical: layout.Logical) -> bool:
    return any(b.header and set(normalize(b.header[-1])) <= set('款項目') for b in logical.bands)


def spreads(logicals: list[layout.Logical]) -> list[layout.Logical]:
    """A right page joined to its left page (see the module doc), as `layout.logical_pages` joins a spread."""
    result: list[layout.Logical] = []
    for logical in logicals:
        previous = result[-1] if result else None
        if (previous is None or len(previous.pages) != 1 or len(logical.pages) != 1 or subject(logical)
                or not subject(previous) or logical.pages[0] != previous.pages[0] + 1):
            result.append(logical)
            continue
        offset = max(b.x1 for b in previous.bands) + 10 - min(b.x0 for b in logical.bands)
        for band in logical.bands:
            band.x0 += offset; band.x1 += offset; band.offset = offset
            band.spans = [(a + offset, b + offset, t) for a, b, t in band.spans]
            for word in band.words:
                word.x0 += offset; word.x1 += offset; word.offset = offset
        previous.pages.extend(logical.pages)
        previous.bands.extend(logical.bands)
        previous.unit = previous.unit or logical.unit
        previous.outside.extend(logical.outside)
        previous.foot.update(logical.foot)
        previous.ocr = previous.ocr or logical.ocr
    return result


def read(pages, **options):
    logicals = spreads(layout.logical_pages(pages, **options))
    for logical in logicals:
        for band in logical.bands:
            if band.header and set(normalize(band.header[-1])) <= set('款項目') and band.x1 - band.x0 < NARROW:
                band.words = [Glyph(w.text, band.x0, w.y0, w.x1, w.y1, w.page, w.offset)
                              if normalize(w.text).isdigit() and w.x0 > band.x0 else w for w in band.words]
            elif band.header and set(normalize(band.header[-1])) <= set('款項目'):
                wrapped_names(logical, band)
        logical.bands += [box for band in list(logical.bands) if band.header == ('説明',) for box in counts(band)]
        heads = {id(g) for page in {g.page for g in logical.outside}
                 for line in lines([g for g in logical.outside if g.page == page])
                 if HEAD.match(normalize(text(line))) for g in line}
        logical.outside = [g for g in logical.outside if id(g) not in heads]
    return logicals
