"""Axis quirk: the items of this axis begin at the rows the rules draw (132195). No item of the axis is numbered (a name
that begins with a digit, `３・４・１６号線…`, is a name), every line of a row is its name, and the items are all
siblings: no level is read from where a name starts."""

SCOPE = 'axis'
OPTIONS = {'const': True}


def unnumber(item) -> None:
    if item.code is not None:
        item.name, item.code = ''.join(g.text for line in item.lines for g in line), None


def same_row(previous, item) -> bool:
    from ingestion.generic.tree import _cell
    return (previous.role == item.role == 'node' and item.page == previous.page and not item.amounts
            and _cell(item.group.bands[0], previous.anchor) == _cell(item.group.bands[0], item.anchor))


def flatten(items: list) -> None:
    for item in items:
        item.indent = item.group.bands[0].x0
