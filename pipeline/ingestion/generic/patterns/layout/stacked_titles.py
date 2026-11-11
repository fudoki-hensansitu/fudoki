"""Tables stacked on a page, each under its own 款・項 titles (品川区の予算事項別明細書).

`1款 総務費 … 24,930,655千円` / `1項 総務管理費 … 14,998,332千円` print above each table, the next 款・項 of the
page between the closing rule of one table and the top rule of the next, in the same columns. `layout._frames`
reads the stacked tables of a column range as one frame, so the titles fall in its bands. Here the words of a
band that no vertical rule of their columns crosses (the space between two tables) are taken out of the bands,
and the 款・項 titles among the words outside are read in order with their amount.
"""
import re

from ingestion.generic import layout
from ingestion.generic.layout import Glyph, lines, normalize, runs, text

TITLE = re.compile(r'^([0-9]+)(款|項)(.+)$')
# A running title naming the 款 and the 項 on one line (`（款） 2 政策経営費 （項） 1 政策経営費`, 131164), over a table of 目.
RUNNING = re.compile(r'^[(（]款[)）]([0-9]+)(.+?)(?:[(（]項[)）]([0-9]+)(.+))?$')
# The amount at the right end of a title, with the unit it prints (`24,930,655千円`).
AMOUNT = re.compile(r'^([△▲]?[0-9]{1,3}(?:,[0-9]{3})*)(百万円|千円|円)$')
REACH = 3  # how far a vertical rule may stand outside the band's edges and still be one of its columns'
# A column rule runs down a table's rows; a stroke shorter than this is no column's (a 3.5pt tick over the
# 目 column's edge crosses the `４項 趣旨普及費` title, 2025年度 冊4 p49).
MIN_RULE = 10


def between_tables(word: Glyph, band: layout.Band, verticals: list) -> bool:
    """No vertical rule of the band's columns crosses the word's line: it is printed between two tables."""
    left, right = band.x0 - band.offset - REACH, band.x1 - band.offset + REACH
    middle = (word.y0 + word.y1) / 2
    return not any(left <= rule.x0 <= right and rule.y0 - 1 <= middle <= rule.y1 + 1 for rule in verticals)


def cut_unit(run: list[Glyph], unit: str) -> list[Glyph]:
    """The glyphs of an amount without the unit printed after it (in its last word, or a word of its own)."""
    if normalize(run[-1].text) == unit:
        return run[:-1]
    last = run[-1]
    width = (last.x1 - last.x0) / len(last.text)
    keep = len(last.text) - len(unit)
    return [*run[:-1], Glyph(last.text[:keep], last.x0, last.y0, last.x0 + keep * width, last.y1, last.page, last.offset)]


def titles(logical: layout.Logical, heading: str | None) -> list[tuple[str, str, str, list[Glyph], tuple | None]]:
    """The 款・項 titles outside the tables, top to bottom: level, code, name, name glyphs and (heading, amount glyphs).

    The title prints no heading over its amount: the settings declare the one it is under (`header.title_amount`)."""
    found = []
    # `outside` holds each page's own coordinates: the lines of a spread are read page by page.
    pages = sorted({g.page for g in logical.outside})
    for line in (line for page in pages for line in lines([g for g in logical.outside if g.page == page])):
        if any(logical.below_foot(g) for g in line):
            continue
        parts = runs(line)
        amount = None
        if len(parts) > 1:
            shown = AMOUNT.fullmatch(normalize(text(parts[-1])))
            if shown:
                # The amount is read in its column's unit, which is resolved after the layout (`units.resolve`): a
                # title printed in another unit is 1000 times off its 項・目 and fails the tree check there.
                amount = cut_unit(parts.pop(), shown.group(2))
        name = [g for part in parts for g in part]
        match = TITLE.match(normalize(text(name)))
        running = RUNNING.match(normalize(text(name))) if not match and amount is None else None
        if running:
            # The words of each level: the 項's start at its marker. The 項 is read just below the 款 it is printed
            # beside (the glyphs of a line stand at slightly different heights).
            cut = next((i for i, g in enumerate(name) if '項' in g.text), len(name))
            kan, kou = name[:cut] or name, name[cut:] or name
            found.append(('款', running.group(1), running.group(2), kan, None))
            if running.group(3):
                low = max(g.y0 for g in kan) + .01
                height = max(g.y1 - g.y0 for g in kan)
                kou = [Glyph(g.text, g.x0, low, g.x1, low + height, g.page, g.offset) for g in kou]
                found.append(('項', running.group(3), running.group(4), kou, None))
            continue
        if not match:
            continue
        if amount is not None and not heading:
            raise ValueError(f'A title prints an amount with no heading: p{name[0].page} {normalize(text(line))!r}; '
                             'declare the heading it is under (`header.title_amount`)')
        found.append((match.group(2), match.group(1), match.group(3), name, (heading, amount) if amount else None))
    return found


def read(pages, **options):
    logicals = layout.logical_pages(pages, **options)
    heading = (options.get('header') or {}).get('title_amount')
    verticals = {page.number: [rule for rule in page.rules if rule.vertical and rule.y1 - rule.y0 >= MIN_RULE]
                 for page in pages}
    for logical in logicals:
        for band in logical.bands:
            moved = [w for w in band.words if between_tables(w, band, verticals[band.page])]
            if moved:
                gone = {id(w) for w in moved}
                band.words = [w for w in band.words if id(w) not in gone]
                # `outside` holds the page's own coordinates: a spread's right page is not shifted there.
                logical.outside.extend(Glyph(w.text, *w.original, w.page, 0) for w in moved)
        logical.level_titles = titles(logical, heading)
    return logicals
