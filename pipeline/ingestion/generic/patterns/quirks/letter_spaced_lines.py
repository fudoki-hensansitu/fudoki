"""Document quirk: OCR boxes the characters of a letter-spaced name (`委 員 旅 費`) or a bracket (`(職員課)`) a few
points off the line of the others (132101). A line that begins right after the end of the line before, on that line,
goes on with it, whichever OCR read first; a wrapped line may begin a little into the line above."""

SCOPE = 'document'
OPTIONS = {'const': True}


def same_line_after(previous, item) -> bool:
    """Whether the item begins on the line of the one before, right after its end."""
    if len(previous.lines) != 1 or not item.lines or not item.lines[0]:
        return False
    before, first = previous.lines[0], item.lines[0][0]
    height = max(g.y1 - g.y0 for g in before)
    overlap = min(first.y1, max(g.y1 for g in before)) - max(first.y0, min(g.y0 for g in before))
    gap = first.x0 - max(g.x1 for g in before)
    return overlap >= (first.y1 - first.y0) / 2 and -1 <= gap <= height


def overlap(height: float) -> float:
    """How far a wrapped line may begin into the line above: a bracket OCR boxes taller than the line (`(職員課)`
    753.2–767.4 under a line ending at 754.9)."""
    return .2 * height
