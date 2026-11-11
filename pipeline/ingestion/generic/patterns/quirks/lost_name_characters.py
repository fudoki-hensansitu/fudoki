"""Document quirk: a declared misread that inserts characters before the ones OCR read (a letter-spaced `退 職 手 当` of
which OCR read only `当`): the lost characters stood left of the read ones, a character (the box's height) each, so the
box widens left."""

SCOPE = 'document'
OPTIONS = {'const': True}


def box(bbox: list, lost: str) -> list:
    x0, y0, x1, y1 = bbox
    return [x0 - len(lost) * (y1 - y0), y0, x1, y1]
