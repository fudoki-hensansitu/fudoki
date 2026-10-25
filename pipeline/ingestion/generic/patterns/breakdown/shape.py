from __future__ import annotations
from ingestion.generic.tree import Item, shape_of
from ingestion.generic.patterns.breakdown.numbering import number_span, nearest_position, circled_continuation, same_position


def shape_depth(item: Item, indent_depth: int, order: list[str], open_items: list,
                anchors: dict[str, tuple[float, float, int]] | None = None) -> int:
    """Depth by numbering shape: each shape keeps the level where it first appeared on the
    axis (numbering restarts under each parent); unnumbered lines sit under the last open item
    when indented deeper, otherwise they keep the indentation level.

    A shape is one level where its numbers start or end at one position (left-aligned 4 and
    18 start together, right-aligned 1 and 10 end together). The same shape whose start and
    end are not at `same_position` as any position seen for it is another level
    (事業「1 …」 and 節「8 旅費」 indented below it)."""
    shape = shape_of(item)
    if shape is None:
        last = next((p for p in reversed(open_items) if p is not None), None)
        if last is not None and item.indent > last.indent + 2:
            return len(open_items) + 1
        return indent_depth
    if anchors is not None and item.lines and item.lines[0]:
        first = item.lines[0][0]
        number = number_span(first)
        seen = nearest_position(number, [(key, anchor) for key, anchor in anchors.items() if key.split('@')[0] == shape], first)
        if shape == 'number':
            circled = [(key, anchor) for key, anchor in anchors.items() if key.split('@')[0] == 'circled']
            seen = circled_continuation(number, anchors.get(seen), circled, first) or seen
        if seen is not None:
            shape = seen
        else:
            if any(key.split('@')[0] == shape for key in anchors):
                shape = f'{shape}@{len(anchors)}'
            anchors[shape] = number
    if shape not in order:
        order.append(shape)
    return order.index(shape) + 1



def depth(item, initial, order, opened, anchors, prepared):
    return shape_depth(item, initial, order, opened, anchors)


def prepare(all_items, levels, depth_of):
    return None
