from collections import defaultdict

from ingestion.generic import layout
from ingestion.generic.observe import Page, Rule

MIN_RULE = 40  # a column edge, as `layout._frames` counts one
MIN_ROWS = 3  # row rules that end on the same x: the frame's edge, not one cell's
OUTSIDE = 10  # how far past the outermost drawn edge the row rules must run
MIN_ROW = 100  # a row rule of the table; the printer's marks at the corners of a trimmed page are shorter


def closed(page: Page) -> Page:
    """The page with the outer edge of its frame drawn where the row rules end.

    A frame that draws its row rules from an edge with no vertical rule (the right half of a spread: 130001 prints the
    支出済額 column from the page's ruled body to the first drawn column edge, with no rule on its left) leaves the
    figures of that column outside every band. The edge is the x where at least MIN_ROWS row rules end beyond the
    outermost drawn column edge, drawn from the highest to the lowest of them. Only the column edges the row rules
    reach count: the crop marks some pages print at their corners (130001 2024) are neither."""
    rows = [rule for rule in page.rules if not rule.vertical and rule.x1 - rule.x0 >= MIN_ROW]
    if not rows:
        return page
    low, high = min(rule.x0 for rule in rows) - OUTSIDE, max(rule.x1 for rule in rows) + OUTSIDE
    drawn: dict[float, float] = defaultdict(float)
    for rule in page.rules:
        if rule.vertical and low <= rule.x0 <= high:
            drawn[round(rule.x0, 1)] += rule.y1 - rule.y0
    edges = [x for x, length in drawn.items() if length > MIN_RULE]
    if not edges:
        return page
    left, right = min(edges), max(edges)
    ends: dict[tuple[str, float], list[float]] = defaultdict(list)
    for rule in rows:
        if rule.x0 < left - OUTSIDE:
            ends[('left', round(rule.x0))].append(rule.y0)
        if rule.x1 > right + OUTSIDE:
            ends[('right', round(rule.x1))].append(rule.y0)
    added = []
    for side in ('left', 'right'):
        found = [(x, ys) for (s, x), ys in ends.items() if s == side and len(ys) >= MIN_ROWS]
        if found:
            x, ys = (min if side == 'left' else max)(found, key=lambda item: item[0])
            added.append(Rule(x, min(ys), x, max(ys)))
    return Page(page.number, page.width, page.height, page.words, page.rules + added) if added else page


def read(pages, **options):
    return layout.logical_pages([closed(page) for page in pages], **options)
