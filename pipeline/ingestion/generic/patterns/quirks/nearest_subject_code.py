"""Document quirk: a subject cell holds several codes with no rule between them, and a name-only line belongs to the
code printed nearest above it (132136 R5 当初予算). The 目 column has rules only over each 項, so one cell holds the
項's row (its code in the 項 column, its name in the 目 column: `4` | `趣旨普及費`) and each 目 (`1 一般被保険` /
`者移送費`, `2 退職被保険` / `者等移送費`). The deepest code of the cell would take every name line. A line goes to the
code whose row is the last at or above its own (half a line's slack), the deepest code on that row; a line above every
code keeps the cell's rule."""
SCOPE = 'document'
OPTIONS = {'const': True}


def owner(tokens: list, piece: list, centre) -> int | None:
    """The index of the token that owns the name line `piece`, or None to keep the cell's rule."""
    y = centre(piece)
    slack = .5 * max(g.y1 - g.y0 for g in piece)
    above = [i for i, (_, token) in enumerate(tokens) if centre(token) <= y + slack]
    if not above:
        return None
    row = max(centre(tokens[i][1]) for i in above)
    return max((i for i in above if centre(tokens[i][1]) >= row - slack), key=lambda i: tokens[i][0])
