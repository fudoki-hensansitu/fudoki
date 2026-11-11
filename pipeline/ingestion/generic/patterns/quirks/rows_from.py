"""Axis quirk: a row the rules draw that prints amounts but no name in this axis is an item named by another column of
the row (132195: a 事業 printed for a second 主管課 has no 事業名, its 主管課 names it). The value names the column that
names the row (`name`) and the column whose amounts show the row is printed (`amount`), by their headers."""
SCOPE = 'axis'
OPTIONS = {'type': 'object', 'additionalProperties': False, 'required': ['name', 'amount'],
           'properties': {'name': {'type': 'string', 'minLength': 1}, 'amount': {'type': 'string', 'minLength': 1}}}


def with_empty_rows(items: list, group, logical, declared: dict) -> list:
    from ingestion.generic.layout import lines
    from ingestion.generic.tree import Item
    bands = {'／'.join(b.header): b for b in logical.bands}
    named, paid = bands.get(declared['name']), bands.get(declared['amount'])
    if named is None or paid is None:
        return items
    band, added = group.bands[0], []
    for top, bottom in zip(band.rows, band.rows[1:]):
        if any(top - .5 <= i.anchor <= bottom + .5 for i in items):
            continue
        centre = lambda g: (g.y0 + g.y1) / 2
        if not any(top < centre(g) < bottom and any(c.isdigit() for c in g.text) for g in paid.words):
            continue
        words = [g for g in named.words if top < centre(g) < bottom]
        if words:
            printed = lines(words)
            top = min(printed[0], key=lambda g: g.y0)  # a name printed downwards is one tall word: its row is where it starts
            added.append(Item(group, words[0].page, printed, None, ''.join(g.text for line in printed for g in line), band.x0,
                              fixed_anchor=top.y0 + (top.y1 - top.y0) / (2 * len(top.text))))
    return sorted([*items, *added], key=lambda i: i.anchor)
