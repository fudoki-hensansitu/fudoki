"""Every numbered item of the axis is one level (北区の予算説明書の節: the legal 節 only, none printed under another).

OCR gives a code joined to its name (`4共済費`) and one set apart (`3 職員手当等`) name starts a few points apart, so in a
short account the starts learned over the document can split into two levels and put a 節 under the one before it. The
column prints no deeper item, so the numbered items are not ranked by where their names start. A line without a number
keeps its indentation level."""


def depth(item, initial, order, opened, anchors, prepared):
    return 1 if item.code is not None else initial


def prepare(all_items, levels, depth_of):
    return None
