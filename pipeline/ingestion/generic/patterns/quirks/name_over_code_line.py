"""Axis quirk: an item whose name does not fit its cell is printed in two half-height lines straddling its code's row,
the first riding half a line over the code and the rest under it (国立市の決算書, the 節 `戸籍住民基本台帳費委託` /
`3.` / `金`, the amounts on the code's row). The line above, without a number and without an amount, starting where
the item's name starts and reaching into the code's row, is the head of that name: not a note nor the tail of the item
above."""
SCOPE = 'axis'
OPTIONS = {'const': True}


def heads(above, item, column_amount_items: set[int]) -> bool:
    if not (above.role in ('node', 'note') and above.code is None and not above.amounts and len(above.lines) == 1
            and id(above) not in column_amount_items and item.code is not None and item.page == above.page):
        return False
    code = item.lines[0][0]
    names = [g for line in item.lines for g in line if g.x0 > code.x1]
    if not names:
        return False
    line, height = above.lines[0], code.y1 - code.y0
    bottom = max(g.y1 for g in line)
    return abs(line[0].x0 - min(g.x0 for g in names)) <= height / 2 and code.y0 < bottom < code.y1
