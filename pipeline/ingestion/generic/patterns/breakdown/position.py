from __future__ import annotations
from collections import defaultdict
from ingestion.generic.tree import shape_of
from ingestion.generic.patterns.breakdown.numbering import number_span, nearest_position, circled_continuation


def position_levels(all_items, levels: dict[str, list[float]], depth_of) -> tuple[dict, dict]:
    """Levels of breakdown items by numbering shape and position (pattern position).

    A numbered item's level is its shape at one aligned position (its numbers start or end
    at `same_position`, as in `shape_depth`); a codeless item's level is its
    indentation level. Levels rank by the x where their lines start, so a codeless 事業 line
    (x 254) sits above 節「13 …」 (263), 細節「03 …」 (273) and the codeless lines under them
    (282) (132276)."""
    starts: dict[str, dict[tuple, float]] = defaultdict(dict)
    numbers: dict[str, dict[tuple, tuple[float, float, int]]] = defaultdict(dict)
    keys: dict[int, tuple] = {}
    for _, ordered, found in all_items:
        for group in ordered:
            if group.subject or not levels.get(group.axis):
                continue
            for item in found[id(group)]:
                if item.role not in ('node', 'note') or not item.lines or not item.lines[0]:
                    continue
                first = item.lines[0][0]
                shape = shape_of(item)
                if shape is None:
                    key = ('plain', depth_of(item))
                    starts[group.axis].setdefault(key, levels[group.axis][key[1] - 1])
                else:
                    number = number_span(first)
                    key = nearest_position(number, [(k, numbers[group.axis][k]) for k in starts[group.axis] if k[0] == shape], first)
                    if shape == 'number':
                        circled = [(k, numbers[group.axis][k]) for k in starts[group.axis] if k[0] == 'circled']
                        key = circled_continuation(number, numbers[group.axis].get(key), circled, first) or key
                    if key is None:
                        key = (shape, len(starts[group.axis]))
                        starts[group.axis][key], numbers[group.axis][key] = number[0], number
                keys[id(item)] = key
    # Levels whose lines start within a couple of points are ranked by which was met first (outer first):
    # `3 …` and `(1) …` below it start together once the bracket is taken off.
    ranks = {axis: {key: rank for rank, key in enumerate(
        sorted(found, key=lambda k: (round(found[k] / 3), list(found).index(k))))} for axis, found in starts.items()}
    return ranks, keys



def depth(item, initial, order, opened, anchors, prepared):
    ranks, keys = prepared
    return ranks[item.group.axis][keys[id(item)]] + 1 if id(item) in keys else initial


def prepare(all_items, levels, depth_of):
    return position_levels(all_items, levels, depth_of)
