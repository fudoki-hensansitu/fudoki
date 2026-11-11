"""Axis quirk: numbers are right-aligned in their column, and the remainder of a name in brackets
(`（選挙管理委員会事務局）`) goes on the next line with the amount when it did not fit on the line of the name above.

A wrapped line starts at the column's left edge, which is half a character left of a one-digit number (a half-width
digit is half the line height); a one-digit number of the parts starts half a character right of a two-digit one."""
SCOPE = 'axis'
OPTIONS = {'const': True}


def slack(line) -> float:
    return max(3, (line[0].y1 - line[0].y0) / 2 + .5)


def parts_slack(line) -> float:
    """Where the parts' numbers start. A digit is about .6 of the line height wide (`7 報償費` 899.7 under `10 需用費`
    894.6 at a 9pt height)."""
    return max(3, (line[0].y1 - line[0].y0) * .6 + .5)


def overflows(previous, label, money, code, bracketed: bool, limit: float | None, left_slack: float) -> bool:
    """The bracketed line would have run past the right limit of the column on the line of the numbered name above."""
    return (previous is not None and code is None and bool(label) and bool(money) and bracketed
            and previous.code is not None and not previous.amounts and limit is not None
            and label[0].x0 >= previous.lines[0][0].x0 - left_slack
            and max(g.x1 for g in previous.lines[-1]) + (label[-1].x1 - label[0].x0) > limit)
