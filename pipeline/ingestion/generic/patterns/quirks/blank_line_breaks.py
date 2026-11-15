"""Axis quirk: a line with a blank line between it and the numbered line under it is not the first line of that item's
name (132250 R5 予算書 説明: an amountless 内訳 at the top of a page, `発達支援センター分室整備工事`, over the next 事業).
Only the first line of a page's group is judged so: a wrapped name inside the group keeps its lines whatever their
spacing."""
SCOPE = 'axis'
OPTIONS = {'const': True}


def apart(line: list, following: list) -> bool:
    """Whether `line` stands a blank line above `following`."""
    return following[0].y0 - line[0].y1 > line[0].y1 - line[0].y0
