"""Axis quirk: an item of this axis that hangs from its subject item belongs to the item of the named axis (the value)
whose ruled row it is printed in, under the same subject item (133086 prints the 備考 of a 節 beside it, its lines
centred on the 節's row: `10 需用費 339,059` with `消耗品費 129,619` / `印刷製本費 209,440`). A line above the page's
first such item goes on from the last one of the page before. A line in no such row stays where it was. Its own items
move with it, and the depth (counted within the axis) stays."""
SCOPE = 'axis'
OPTIONS = {'type': 'string', 'minLength': 1}


def nest(nodes: list[dict], placed: list, axis: str, under: str) -> None:
    from ingestion.generic.tree import _cell
    by_key = {n['node_key']: n for n in nodes}
    hosts = [i for i in placed if i.group.axis == under and i.role == 'node' and i.group.bands]
    for item in placed:
        if item.group.axis != axis or item.parent is None or not item.parent.group.subject:
            continue
        band = lambda host: host.group.bands[0]
        found = [h for h in hosts if h.parent is item.parent and h.page == item.page
                 and _cell(band(h), item.anchor) == _cell(band(h), h.anchor)]
        if not found and not any(h.parent is item.parent and h.page == item.page and h.anchor < item.anchor
                                 for h in hosts):
            # The lines go on over a page break (`12 委託料` with `審査支払事務委託` … at the foot of a page and
            # `療養費審査委託` at the top of the next): the last item of the axis on the page before.
            before = [h for h in hosts if h.parent is item.parent and h.page == item.page - 1]
            found = [max(before, key=lambda h: h.anchor)] if before else []
        if len(found) != 1:
            continue
        item.parent = found[0]
        by_key[item.key]['parent_node_key'] = found[0].key
