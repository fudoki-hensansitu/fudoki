"""Axis quirk: a line led by a middle dot is an item one level under the item above it, and its name starts
after the dot (利島村の決算書 2023 p207: `①旅費` / `・赴任・帰任旅費`, the dot set where the name of `①旅費` starts). The
dot is a character of the line, so the line would start no deeper than that name and read as its sibling. With the
quirk, the item of such a line is indented one character past the dot. The dot stays in the name. Read in
`tree.apply_layout`."""
SCOPE = 'axis'
OPTIONS = {'const': True}

DOTS = ('・', '･')


def shift(item) -> None:
    if item.code is not None or not item.lines or not item.lines[0]:
        return
    first = item.lines[0][0]
    if first.text.startswith(DOTS):
        item.indent = first.x0 + (first.y1 - first.y0)
