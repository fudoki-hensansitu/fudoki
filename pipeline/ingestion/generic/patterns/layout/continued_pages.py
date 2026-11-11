"""Tables under running 款・項 titles whose pages run on with no header (狛江市の予算事項別明細書).

Each 項 opens a ruled table under its titles (`（款） 2．総務費 3,559,521 千円` / `（項） 1．総務管理費 …`) and its header
(`目 | 本年度予算額 | … | 節 区分 金額 | 説明`), as `running_titles` reads them. The table runs on over the next pages in
the same columns but without the header: a page either holds rows only (its frame opens with a row, its titles are
printed at its foot), or holds the end of the open 項 (its rows and its `計`) and then the next 項's titles and header
in a second table below.

`running_titles` reads a frame at the top of a page that prints no header (`headless_top`) only when its first line
prints a figure (日の出町). Here the first line is often a line of the 説明 (`会議録検索システムデータ`), so the frame
is taken as header-less when it prints no subject heading (`目`, `款` on the summary page). A page whose only frame
prints no header is no page of its own layout: read alone, its first rows are taken for its header, and as a page without a subject column it is joined to
the page before as the right half of a spread. Its frame is read in the columns of the last page read before it that
prints the header, at the place they are printed on the page, as a logical page of its own: the tree goes on with the
open 目 and its 節・説明 there.
"""
import re

from dataclasses import replace

from ingestion.generic import layout
from ingestion.generic.layout import Band, Glyph, Logical, is_amount, normalize
from ingestion.generic.patterns.layout import running_titles, stacked_titles

HEADINGS = layout.SUBJECT_LEVELS  # the heading of a subject column: a frame whose header holds one prints its header


def heads(page, top: float, bottom: float) -> bool:
    """Whether the stretch from `top` to `bottom` of the page prints a subject column's heading."""
    return any(normalize(w.text) in HEADINGS and top < (w.y0 + w.y1) / 2 < bottom for w in page.words)


def headless_top(page) -> tuple[float, float] | None:
    """(top, gap) of a frame at the top of the page that prints no header, the next table opening below a stretch no
    column rule crosses: `running_titles.headless_top` with a frame taken as header-less when it prints no subject
    heading."""
    full = running_titles.full_rules(page)
    if len(full) < 3:
        return None
    left = min(r.x0 for r in page.rules if not r.vertical)
    right = max(r.x1 for r in page.rules if not r.vertical)
    columns = [r for r in page.rules if r.vertical and left + 1 < r.x0 < right - 1]
    top = full[0]
    for upper, lower in zip(full[1:], full[2:]):
        if any(r.y0 < lower - 1 and r.y1 > upper + 1 for r in columns):
            continue
        return None if heads(page, top, upper) else (top, upper)
    return None


def headless(page, spread: dict | None) -> bool:
    """The page's frames print no header: none holds a subject heading above its body."""
    frames = layout._frames(page, spread)
    return bool(frames) and not any(heads(page, frame[2] - 1, layout._header_bottom(page, frame) + 1) for frame in frames)


def continued(page, template: Logical) -> Logical:
    """The header-less page read in the columns of the template's first page (the last page before it that prints
    the header): each band of its frames takes the heading, kind and settings of the template's band it stands in."""
    first = template.pages[0]
    columns = [b for b in template.bands if b.page == first]
    verticals = [r for r in page.rules if r.vertical]
    horizontals = [r for r in page.rules if not r.vertical]
    bands, used = [], set()
    for x0, x1, top, bottom, edges in layout._frames(page):
        for left, right in zip(edges, edges[1:]):
            middle = (left + right) / 2
            model = next((b for b in columns if b.x0 - b.offset - 1 <= middle <= b.x1 - b.offset + 1), None)
            rows = sorted(h.y0 for h in horizontals if layout._covers(h, middle) and top - 1 <= h.y0 <= bottom + 1)
            band = Band(left, right, page.number, model.header if model else (), rows, top, bottom,
                        spans=list(model.spans) if model else [], top=top,
                        left_rules=[(r.y0, r.y1) for r in verticals if abs(r.x0 - left) <= 3])
            if model is not None:
                band = replace(band, kind=model.kind, unit_mark=model.unit_mark, axis_header=model.axis_header,
                               ignored=model.ignored, inline_free=model.inline_free, inline=model.inline,
                               excluded=model.excluded, lines=model.lines)
            for index, word in enumerate(page.words):
                start, middle_y = word.x0 + min(2, (word.x1 - word.x0) / 2), (word.y0 + word.y1) / 2
                if re.match(r'^[△▲]|.*,[0-9]{3}', word.text) and is_amount(word.text):
                    start = (word.x0 + word.x1) / 2  # a grouped amount belongs to the column that holds most of it
                if left < start < right and top < middle_y < bottom:
                    band.words.append(Glyph(word.text, word.x0, word.y0, word.x1, word.y1, page.number, 0))
                    used.add(index)
            bands.append(band)
    outside = [Glyph(w.text, w.x0, w.y0, w.x1, w.y1, page.number, 0) for i, w in enumerate(page.words) if i not in used]
    return Logical([page.number], bands, template.unit, outside, foot={page.number: [(b.x0, b.x1, b.body_bottom) for b in bands]},
                   column_units=dict(template.column_units))


CODE = re.compile(r'^[0-9０-９]*[.．]?$')


def carry_amounts(logicals) -> None:
    """`running_titles.carry_amounts`, except in a column of item numbers: the 節 column prints its numbers in a
    narrow column of their own (`10.` / `11.`), and a number cut into words at the top of a page (`1` `1` `.`) is
    the next item's, not an amount of the last line of the page before."""
    for before, after in zip(logicals, logicals[1:]):
        kept = {id(band): band.words for band in after.bands if band.words and all(CODE.match(normalize(w.text)) for w in band.words)}
        for band in after.bands:
            if id(band) in kept:
                band.words = []
        running_titles.carry_amounts([before, after])
        for band in after.bands:
            if id(band) in kept:
                band.words = kept[id(band)]


def read(pages, **options):
    spread = options.get('spread')
    extended, upper, alone = [], {}, set()
    for page in pages:
        page.words = running_titles.join_full_width(page.words)
        wide = running_titles.drop_outside_columns(page)
        top = headless_top(wide)
        inside = running_titles.in_headless_top(wide, top) if top else None
        wide = running_titles.extend_columns(running_titles.without_headless_rules(wide, top) if top else wide)
        page.words = running_titles.inside_rules(page.words, wide.rules)
        if top:
            upper[page.number] = [w for w in page.words if inside(w)]
        elif headless(wide, spread):
            alone.add(page.number)
        extended.append(replace(wide, words=[w for w in page.words if not inside(w)] if top else page.words))
    logicals = layout.logical_pages([p for p in extended if p.number not in alone], **options)
    for page in (p for p in extended if p.number in alone):
        before = [i for i, logical in enumerate(logicals) if logical.pages[-1] < page.number]
        if not before:
            raise ValueError(f'A page with no header before any page that prints it: p{page.number}')
        template = next(logicals[i] for i in reversed(before) if any(b.header for b in logicals[i].bands))
        logicals.insert(before[-1] + 1, continued(page, template))
    running_titles.read_headless_rows(logicals, upper)
    heading = (options.get('header') or {}).get('title_amount')
    full = {page.number: running_titles.full_rules(page) for page in extended}
    verticals = {page.number: [rule for rule in page.rules if rule.vertical and rule.y1 - rule.y0 >= stacked_titles.MIN_RULE]
                 for page in extended}
    for logical in logicals:
        moved = running_titles.between_tables(logical, verticals, full)
        gone = {id(w) for _, w in moved}
        for band in logical.bands:
            band.words = running_titles.rejoin_total_tails(running_titles.join_split_yen(running_titles.split_glued_yen(
                running_titles.drop_units([w for w in band.words if id(w) not in gone]))))
        logical.outside.extend(Glyph(w.text, *w.original, w.page, 0) for _, w in moved)
        # A title prints its amount with the unit after it (`2．総務費 3,559,521 千円`): the unit is no part of the name.
        logical.outside = running_titles.drop_units(logical.outside)
        logical.level_titles = running_titles.titles(logical, heading)
    carry_amounts(logicals)
    if heading:
        running_titles.complete_titles(logicals)
    return logicals
