"""Axis quirk: the name of the last item of a page runs on at the top of the axis's next page, without an amount (福生市の
予算書, the 節 `13 使用料及び 684` at the foot of one page, `賃借料` on the first line of the next). The next page's first
items of the axis, printed without a number and without an amount, starting where the name of that last item starts, is
the rest of its name: not a note nor the start of the next item's name. (`names_over_pages` is the other way round: the
amount comes with the rest of the name.) In `tree.items` the line is kept out of the rule-bounded cell of the item under
it, which would read it as the first line of that item's name."""
SCOPE = 'axis'
OPTIONS = {'const': True}


def runs_on(previous, first) -> bool:
    if not (previous.role == 'node' and previous.code is not None and previous.lines
            and first.code is None and not first.amounts and first.name and first.lines
            and 0 < first.page - previous.page <= 2):
        return False
    start = first.lines[0][0].x0 - first.lines[0][0].offset
    height = first.lines[0][0].y1 - first.lines[0][0].y0
    return abs(start - (previous.indent - previous.lines[0][0].offset)) <= height / 2  # the indent is the name's start
