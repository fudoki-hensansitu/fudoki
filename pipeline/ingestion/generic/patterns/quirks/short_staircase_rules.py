"""Document quirk: a staircase draws the rule between two code columns only beside the rows of the deeper level
(281000 の局別の決算説明書 R7 の歳入: 経済観光局 p33 の項と目の間の罫は2つの目の行の横だけ 33pt、行財政局 p36 は
1つの目の行の横だけ。131148 の決算書 R5 の予備費の頁も1つの目の行の横だけ 11pt)。Read alone, the rule is too short for a column edge (40pt), and the header `款 項 目` over the
code columns is read as one cell. A vertical rule whose every piece runs from one row rule to another (a cell's side,
not a stroke inside a cell), `TOTAL` points or longer in all, is a column edge."""

from collections import defaultdict

SCOPE = 'document'
OPTIONS = {'const': True}

TOTAL = 10.0  # points drawn in all: one row of a 決算説明書 (about 17pt) or of a 決算書 (about 11pt, 中野区)
REACH = 1.5  # points: how near a piece's end must come to a row rule


def edges(page) -> set[float]:
    """The x of each vertical rule drawn only as the sides of cells, long enough in all to be a column edge."""
    horizontals = [r for r in page.rules if not r.vertical]
    pieces: dict[float, list] = defaultdict(list)
    for rule in page.rules:
        if rule.vertical:
            pieces[round(rule.x0, 1)].append(rule)
    at_rule = lambda x, y: any(abs(h.y0 - y) <= REACH and h.x0 - REACH <= x <= h.x1 + REACH for h in horizontals)
    return {x for x, rules in pieces.items()
            if sum(r.y1 - r.y0 for r in rules) >= TOTAL and all(at_rule(x, r.y0) and at_rule(x, r.y1) for r in rules)}
