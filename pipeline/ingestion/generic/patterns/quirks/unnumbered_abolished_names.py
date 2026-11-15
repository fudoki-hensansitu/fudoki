"""Document quirk: a 目 abolished this year prints no number in a ruled table, its amounts in the columns, and its name
wraps (132021: `○都知事` / `選挙費` `0 105,491 △105,491`). The line below such a name, with no amount, goes on with
the name, as it does under stacked titles. A total row (`計`) never takes a wrapped line.

The amounts may be printed on the name's last line instead (131164 R7: `(退職被保険者等` / `療養給付費) － 100 △100`):
the line above, with no number and no amount, starts the name. Either way a name stays in its ruled row: the first line
of the next row, set right under it, is the next 目's (`(退職被保険者等` / `療養費)`)."""
SCOPE = 'document'
OPTIONS = {'const': True}


def same_row(logical, previous, item, cell) -> bool:
    """Whether no rule of the amount column beside the subject columns runs between the two lines."""
    edge = max(b.x1 for b in previous.group.bands)
    y = (previous.y0 + previous.y1) / 2
    beside = [b for b in logical.bands if b.kind == 'amount' and b.x0 >= edge - 3 and b.body_top < y < b.body_bottom]
    if not beside:
        return True
    band = min(beside, key=lambda b: b.x0)
    return cell(band, y) == cell(band, (item.y0 + item.y1) / 2)
