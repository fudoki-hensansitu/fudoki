"""Tables under bracketed 款・項 titles (中野区の予算説明書).

`(款) 1 議会費` / `(項) 1 議会費` print above each table without an amount, in the place of the 款・項 columns
the table does not have. The titles are read as `stacked_titles` reads its `1款 総務費` titles: in order, with the
words between two stacked tables moved out of the bands. Only the form of a title differs.
"""
import re

from ingestion.generic import layout
from ingestion.generic.layout import lines, normalize, runs, text
from ingestion.generic.patterns.layout import stacked_titles

TITLE = re.compile(r'^[(（](款|項)[)）]([0-9]+)(.+)$')


def titles(logical: layout.Logical, heading: str | None) -> list[tuple]:
    """The 款・項 titles outside the tables, top to bottom: level, code, name, name glyphs and no amount."""
    found = []
    pages = sorted({g.page for g in logical.outside})
    for line in (line for page in pages for line in lines([g for g in logical.outside if g.page == page])):
        if any(logical.below_foot(g) for g in line):
            continue
        name = [g for part in runs(line) for g in part]
        match = TITLE.match(normalize(text(name)))
        if match:
            found.append((match.group(1), match.group(2), match.group(3), name, None))
    return found


def read(pages, **options):
    logicals = stacked_titles.read(pages, **options)
    for logical in logicals:
        logical.level_titles = titles(logical, None)
    return logicals
