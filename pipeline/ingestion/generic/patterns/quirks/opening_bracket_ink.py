"""Axis quirk: OCR boxes the ink of a line, and a full-width opening bracket (`（一社）…`, `「さくら」…`) is drawn in the
right half of its character: a line that starts with one starts half a character left of its box."""
SCOPE = 'axis'
OPTIONS = {'const': True}


def shift(items: list) -> None:
    for item in items:
        first = item.lines[0][0] if item.lines and item.lines[0] else None
        if item.code is None and first is not None and first.text[:1] in '(（「『【〔':
            item.indent -= (first.y1 - first.y0) / 2
