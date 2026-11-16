"""Levels of a 節 column that prints the 細節 under each 節 in a narrower code column right of the 節's (132080 R5 決算):
both are right-aligned numbers, so a 細節's number ends right of the open 節's. The place is read against the open 節 on
the same lines, not against places seen elsewhere in the book, because the right pages of a spread are printed a little
off (up to 8pt) from one another. A numbered line whose number ends at least `SLACK` right of the open 節's on its page
is a 細節; any other numbered line is a 節. On a page with no 節 open yet, a numbered line is a 節 when it is a legal 節
(its name under that 節's number, `setsu_lines`), else a 細節 of the 節 open from the page before. A line with no number
keeps the level of its numbering shape (`shape`)."""
from ingestion.generic.patterns.breakdown.numbering import number_span
from ingestion.generic.patterns.breakdown.setsu_lines import _setsu
from ingestion.generic.patterns.breakdown.shape import shape_depth

SLACK = 5.0  # pt: a 細節's number ends 8〜10pt right of a 節's, two 節 numbers end within 2pt of each other


def depth(item, initial, order, opened, anchors, prepared):
    if item.code is None or not (item.lines and item.lines[0]):
        return shape_depth(item, initial, order, opened, anchors)
    setsu = opened[0] if opened else None
    if setsu is None or setsu.code is None or not (setsu.lines and setsu.lines[0]):
        return 1
    if setsu.page != item.page:
        return 1 if _setsu(item.code, item.name) else 2
    return 2 if number_span(item.lines[0][0])[1] - number_span(setsu.lines[0][0])[1] >= SLACK else 1


def prepare(all_items, levels, depth_of):
    return None
