"""The numbered items of the axis are one level and the lines without a number under them the next (大田区の予算説明書の
節: `10 需用費` over `光熱水費` / `食 糧 費` / `一般需用費`, the 細節).

On a scan the start of an unnumbered name falls between the levels learned over the document, and a 細節 spread across
the column (`食 糧 費`) starts a point left of the others, so ranking the lines by where they start puts one 細節 under
the one before it. The column prints nothing under a 細節: a line without a number is under the numbered item open
above it, at the first level where none is open."""


def depth(item, initial, order, opened, anchors, prepared):
    if item.code is not None:
        return 1
    return 2 if any(o is not None for o in opened[:1]) else 1


def prepare(all_items, levels, depth_of):
    return None
