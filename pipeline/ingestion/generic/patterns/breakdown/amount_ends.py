"""The level of a breakdown line is where its amount ends: each level sets its amounts flush right at its own edge, the
outer levels further right (青梅市の予算説明書: 事業 557, 節 547, 細目 537). A letterspaced name whose first character
OCR lost starts a level too far right, so its start does not tell its level; its amount's end still does. A line
without an amount keeps its indentation level. A bracketed amount (`(職員課) (1,259)`, the setting `amount_brackets`) is
the share of one department in the item above it, set flush with that item's amount: it is one level below."""
from collections import defaultdict

GAP = 4.0  # pt: amounts ending further apart than this end at different levels


def _end(item) -> float | None:
    glyphs = item.amounts[0][1] if item.amounts else []
    return max(g.x1 - g.offset for g in glyphs) if glyphs else None


def prepare(all_items, levels, depth_of):
    ends: dict[str, list[float]] = defaultdict(list)
    for _, ordered, found in all_items:
        for group in ordered:
            if group.subject:
                continue
            ends[group.axis].extend(end for item in found[id(group)] if item.role == 'node' and (end := _end(item)) is not None)
    edges = {}
    for axis, values in ends.items():
        clusters: list[list[float]] = []
        for value in sorted(values, reverse=True):
            if clusters and clusters[-1][-1] - value <= GAP:
                clusters[-1].append(value)
            else:
                clusters.append([value])
        edges[axis] = [(min(c), max(c)) for c in clusters]
    return edges


def depth(item, initial, order, opened, anchors, prepared):
    end = _end(item)
    if end is None:
        return initial
    level = next((rank + 1 for rank, (low, high) in enumerate(prepared.get(item.group.axis, ())) if low <= end <= high), initial)
    if _bracketed(item):
        return level + 1
    department = opened[1] if len(opened) >= 2 else None
    # The lines under a department's share are its breakdown, until the next 事業 closes it.
    return level + 1 if level >= 2 and department is not None and _bracketed(department) else level


def _bracketed(item) -> bool:
    shown = ''.join(g.text for g in item.amounts[0][1]).strip() if item.amounts else ''
    return shown[:1] in '(（' and shown[-1:] in ')）'
