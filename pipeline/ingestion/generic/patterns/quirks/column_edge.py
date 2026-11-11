"""Axis quirk: a scan sets each page a few points aside (国分寺市, up to 7pt), so a line's start (its indentation, where
its number stands) is read from its column's left rule: the item moves by how far its column stands from the usual edge."""
SCOPE = 'axis'
OPTIONS = {'const': True}


def shift(all_items: list, axis: str) -> None:
    members = [(g, found) for _, ordered, found in all_items for g in ordered if not g.subject and g.axis == axis]
    edges = sorted(g.x0 for g, _ in members)
    usual = edges[len(edges) // 2] if edges else 0
    for group, found in members:
        for item in found[id(group)]:
            item.shift = group.x0 - usual
            item.indent -= item.shift
