"""One ruled table among others on the same pages, found by the title printed over it (小笠原村の決算資料「表15 歳出款別決算額」).

The pages print several tables one under another (`表14 村税徴収実績の推移`, then `表15 歳出款別決算額`) and the table
goes on over the next page, over a frame of its own, with the next table under it. `header.section` names the table:

- `title`: the title the table prints (`表15`). On a page that prints it, the section runs from the title down to
  the first line below the table that no vertical rule crosses (or to the foot of the page);
- `continued`: the pages that go on with the table and print no title. Their section runs from the top of the page
  to the same first line below the first ruled table.

The rest of the page is no part of the table (its words and rules stay out of the frame). A page of the scope that is
neither named in `continued` nor prints the title is an error: the declaration must name every page.
"""
from ingestion.generic import layout
from ingestion.generic.layout import lines, normalize, text
from ingestion.generic.observe import Page
from ingestion.generic.patterns.layout.purpose_section import crossed, MIN_RULE


def section(page: Page, title: str, continued: list[int]) -> Page:
    verticals = [rule for rule in page.rules if rule.vertical and rule.y1 - rule.y0 >= MIN_RULE]
    rows = sorted(lines(list(page.words)), key=lambda line: min(w.y0 for w in line))
    if page.number in continued:
        start, top = -1, 0.0
    else:
        found = [index for index, line in enumerate(rows)
                 if normalize(text(line)).replace(' ', '').startswith(title) and not crossed(line, verticals)]
        if len(found) != 1:
            raise ValueError(f'Page {page.number}: expected one title {title} outside the tables, found {len(found)}')
        start = found[0]
        top = max(w.y1 for w in rows[start])
    bottom, inside = page.height, False
    for line in rows[start + 1:]:
        if crossed(line, verticals):
            inside = True
        elif inside:
            bottom = min(w.y0 for w in line)
            break
    if not inside:
        raise ValueError(f'Page {page.number}: no ruled table under {title if start >= 0 else "the top of the page"}')
    words = [w for w in page.words if top <= (w.y0 + w.y1) / 2 < bottom]
    rules = [r for r in page.rules if top <= min(r.y0, r.y1) and max(r.y0, r.y1) <= bottom]
    return Page(page.number, page.width, page.height, words, rules)


def read(pages, *, header=None, **options):
    declared = (header or {}).get('section')
    if not declared:
        raise ValueError('The layout pattern titled_table needs header.section')
    cut = [section(page, declared['title'], declared.get('continued', [])) for page in pages]
    pages = layout.logical_pages(cut, header=header, **options)
    # The table's pages print no open heading again: a 款 at the top of a page is a new one, even when its name is a
    # character from the one before (民生費 / 衛生費).
    for logical in pages:
        logical.reprints = False
    return pages
