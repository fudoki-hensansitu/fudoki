"""Axis quirk: the amounts printed in the axis's own amount column, beside the names, part the items (131113).

A line with an amount of its own in the column, under a name that has one too, is the next item
(`3 職員手当等 86,812` / `扶養手当 2,178` set at the name's start): a wrapped name has one amount. Two lines of one name
set against one tall amount (`報` / `酬`) share it.
"""
SCOPE = 'axis'
OPTIONS = {'const': True}


def beside(column_amounts: list, line: list) -> frozenset:
    return frozenset(id(a) for a in column_amounts or () if line and a.page == line[0].page
                     and a.y0 < (line[0].y0 + line[0].y1) / 2 < a.y1)
