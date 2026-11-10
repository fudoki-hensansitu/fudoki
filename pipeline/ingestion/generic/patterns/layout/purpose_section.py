"""One page printing several ruled tables one under another, each under its own title: only the 目的別 table is read.

A summary of an account's settlement (三宅村の「財政のあらまし」, 133817) prints `◎ 歳 入`, `◎ 歳 出 （ 目 的 別 ）` and
`◎ 歳 出 （ 性 質 別 ）` on one page, the three tables in the same columns. `layout._frames` reads tables in the same
columns as one frame, so the 歳入 and 性質別 rows would join the 款 of the 目的別 table. The 目的別 table is the one
whose rows are the account's 款: the section from its title down to the first line below the table that no vertical
rule crosses (the next title, or the foot of the page) is read, and the rest of the page is no part of the table
(its words stay out of the frame, as a page's title does).
"""
from ingestion.generic import layout
from ingestion.generic.layout import lines, normalize, text
from ingestion.generic.observe import Page

TITLE = '目的別'
# The title of another section (`◎ 歳 出 （ 性 質 別 ）`): met before any ruled row, the 目的別 title heads no table.
SECTION = ('歳入', '歳出')
MIN_RULE = 10  # a column rule runs down the table's rows; a shorter stroke is no column's


def crossed(line, verticals) -> bool:
    middle = sum((w.y0 + w.y1) / 2 for w in line) / len(line)
    return any(rule.y0 - 1 <= middle <= rule.y1 + 1 for rule in verticals)


def section(page: Page) -> Page:
    """The page cut to the 目的別 table: its words and rules from below its title to the first line after the table
    that no vertical rule crosses. A page without the title is an error (the pattern declares it)."""
    verticals = [rule for rule in page.rules if rule.vertical and rule.y1 - rule.y0 >= MIN_RULE]
    rows = sorted(lines(list(page.words)), key=lambda line: min(w.y0 for w in line))
    titles = [index for index, line in enumerate(rows)
              if TITLE in normalize(text(line)).replace(' ', '') and not crossed(line, verticals)]
    if len(titles) != 1:
        raise ValueError(f'Page {page.number}: expected one title naming {TITLE} outside the tables, found {len(titles)}')
    start = titles[0]
    top = max(w.y1 for w in rows[start])
    bottom, inside = page.height, False
    for line in rows[start + 1:]:
        if crossed(line, verticals):
            inside = True
        elif inside:
            bottom = min(w.y0 for w in line)
            break
        elif any(word in normalize(text(line)).replace(' ', '') for word in SECTION):
            break  # the next section's title: the 目的別 title has no table of its own
    if not inside:
        raise ValueError(f'Page {page.number}: no ruled table under the title naming {TITLE}')
    words = [w for w in page.words if top <= (w.y0 + w.y1) / 2 < bottom]
    rules = [r for r in page.rules if top <= min(r.y0, r.y1) and max(r.y0, r.y1) <= bottom]
    return Page(page.number, page.width, page.height, words, rules)


def read(pages, **options):
    return layout.logical_pages([section(page) for page in pages], **options)
