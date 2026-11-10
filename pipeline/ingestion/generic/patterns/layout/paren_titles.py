"""Tables titled `（款） 1 議会費` / `（項） 1 議会費` above them, the 款・項 printed nowhere in the table (北区の予算説明書).

The table holds the 目 only: its first column is headed `目`, and it closes the 項 with a `計` row. The 款 and the
項 the table belongs to are printed above it, each on its own line with the level in brackets before the code, and
repeated on every spread the 項 runs over. They are read as the 款・項 items of the page (`Logical.level_titles`).

The titles print no amount. The 項's amount is the `計` row closing its table: the figure of that row in the column
the settings name (`header.title_amount`, 北区は `本年度予算額`) is taken out of the column and given to the 項 title,
so the 目 are checked against it. The row's other figures (前年度・比較) stay where they are, as the row's total. The
款 is printed with an amount only in the account's summary, which these pages do not read.
"""
import re

from ingestion.generic import layout
from ingestion.generic.layout import Glyph, lines, normalize, text

TITLE = re.compile(r'^[(（](款|項)[)）]([0-9]+)(.+)$')


def titles(logical: layout.Logical) -> list[tuple[str, str, str, list, None]]:
    """The 款・項 titles above the page's table, top to bottom: level, code, name, name glyphs and no amount."""
    found = []
    pages = sorted({g.page for g in logical.outside})
    for line in (line for page in pages for line in lines([g for g in logical.outside if g.page == page])):
        if any(logical.below_foot(g) for g in line):
            continue
        match = TITLE.match(normalize(text(line)))
        if match:
            found.append((match.group(1), match.group(2), match.group(3), line, None))
    return found


def closing_amount(logical: layout.Logical, heading: str) -> list[Glyph] | None:
    """The figure of the table's `計` row in the `heading` column, taken out of the column (page coordinates)."""
    labels = [band for band in logical.bands if band.header and band.header[-1] == '目']
    columns = [band for band in logical.bands if band.kind == 'amount' and band.header and band.header[-1] == heading]
    totals = [line for band in labels for line in lines(band.words) if normalize(text(line)) == '計']
    if not totals:
        return None
    if len(totals) > 1 or len(columns) != 1:
        raise ValueError(f'A table closes with one 計 row under one {heading} column: p{totals[0][0].page}')
    middle = sum((g.y0 + g.y1) / 2 for g in totals[0]) / len(totals[0])
    band = columns[0]
    found = [w for w in band.words if abs((w.y0 + w.y1) / 2 - middle) <= 2]
    if not found:
        raise ValueError(f'The 計 row prints no {heading}: p{totals[0][0].page}')
    gone = {id(w) for w in found}
    band.words = [w for w in band.words if id(w) not in gone]
    return [Glyph(w.text, *w.original, w.page, 0) for w in sorted(found, key=lambda w: w.x0)]


def read(pages, **options):
    logicals = layout.logical_pages(pages, **options)
    heading = (options.get('header') or {}).get('title_amount')
    if not heading:
        raise ValueError('Declare the column the 計 row gives the 項 (`header.title_amount`)')
    for logical in logicals:
        found = titles(logical)
        amount = closing_amount(logical, heading)
        if amount is not None:
            kou = [i for i, title in enumerate(found) if title[0] == '項']
            if not kou:
                raise ValueError(f'A 計 row under no 項 title: p{amount[0].page}')
            level, code, name, line, _ = found[kou[-1]]
            found[kou[-1]] = (level, code, name, line, (heading, amount))
        logical.level_titles = found
    return logicals
