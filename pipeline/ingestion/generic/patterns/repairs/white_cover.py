"""Text painted over by a white rectangle (世田谷区の予算書 2023 p80: a copy of the 説明 lines set 18 pt below the
printed ones, `特財：都支出金 2,735、その他 347`, then a white box over it before the printed lines are drawn). The copy
has no clip of its own and its fill is ink, so the clip says it prints; it shows nothing because a white filled path
drawn later covers it. A character is hidden when a later white filled path that prints (its own clip lets it) holds the
centre of its box. Read in `repair._glyphs`."""
WHITE = 250  # each RGB component of the fill at least this (0-255), opaque: paper


def covers(raw, handle) -> bool:
    """Whether a path object is filled opaque white."""
    import ctypes
    fill, stroke = ctypes.c_int(), ctypes.c_int()
    if not raw.FPDFPath_GetDrawMode(handle, fill, stroke) or fill.value == 0:
        return False
    r, g, b, a = (ctypes.c_uint() for _ in range(4))
    if not raw.FPDFPageObj_GetFillColor(handle, r, g, b, a):
        return False
    return a.value == 255 and min(r.value, g.value, b.value) >= WHITE


def hidden(box, order: int, covers_: list) -> bool:
    """box (left, bottom, right, top) in PDF space of a character drawn by the object at `order`; covers_ the
    (order, (left, bottom, right, top)) of the white paths that print."""
    x, y = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
    return any(at > order and c[0] <= x <= c[2] and c[1] <= y <= c[3] for at, c in covers_)
