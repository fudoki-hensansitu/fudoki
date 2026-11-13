"""Document quirk: the PDF draws strokes of some characters as vector lines (北区 R6 予算説明書: a 3.6pt line through
`用` of `使用料及び`, through `工` of `工事請負費`). Such a line is read as a row rule of the band it crosses, so it cuts
the cell of a 節 from the line its name wraps to (`使用料及び` / `賃借料`). A line no longer than `LONGEST` that lies
inside the box of a printed word is a stroke of that word, not a rule."""
from ingestion.generic.observe import Page

SCOPE = 'document'
OPTIONS = {'const': True}

LONGEST = 5.  # pt: the strokes are 3–4pt; the shortest rule of a table spans a cell
SLACK = 1.  # pt: a stroke may reach just past the word's box


def drop(page: Page) -> None:
    def inside(rule) -> bool:
        return (max(rule.x1 - rule.x0, rule.y1 - rule.y0) <= LONGEST
                and any(w.x0 - SLACK <= min(rule.x0, rule.x1) and max(rule.x0, rule.x1) <= w.x1 + SLACK
                        and w.y0 - SLACK <= min(rule.y0, rule.y1) and max(rule.y0, rule.y1) <= w.y1 + SLACK
                        for w in page.words))
    page.rules = [rule for rule in page.rules if not inside(rule)]
