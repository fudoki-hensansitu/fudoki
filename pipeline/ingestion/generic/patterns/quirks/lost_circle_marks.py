"""Axis quirk: OCR drops the `○` that leads the first line under a `□` heading (武蔵野市の予算書 R6・R7 の説明, scan:
`□被保険者等に対する高額療養費の給付` / `○一般被保険者高額療養費 1,059,340`, read `一般被保険者高額療養費`). The heading
prints no amount, so the line under it would read as the rest of its name. A line right under a `□` line, starting
right of where the `□` stands, is an item of its own, as a line led by its mark is."""
from ingestion.generic.layout import normalize

SCOPE = 'axis'
OPTIONS = {'const': True}


def marked(label, previous) -> bool:
    if previous is None or not previous.lines or not previous.lines[0] or not label:
        return False
    first = previous.lines[0][0]
    return len(previous.lines) == 1 and normalize(first.text)[:1] == '□' and label[0].x0 > first.x0 + 2
