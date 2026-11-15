"""Document quirk: a printed amount was corrected by laying a white box over it and printing the new amount on the box
(目黒区の決算書 R5 p61・p62 款4 健康福祉費の継続費及び繰越事業費繰越額: `271050400` under the box, `271,050,400` on it).
The text layer keeps the old amount, which the box hides. A character drawn before a white box that covers its centre
prints nothing."""
SCOPE = 'document'
OPTIONS = {'const': True}

import ctypes

WHITE = 250  # each component of the fill at least this (0-255): paper, not ink


def reader(raw, page):
    """A test of whether the character of `handle` (its text object) with box `box` (left, bottom, right, top in PDF
    space) lies under a white box drawn after it."""
    order: dict[int, int] = {}
    patches: list[tuple[int, tuple]] = []
    for index in range(raw.FPDFPage_CountObjects(page)):
        handle = raw.FPDFPage_GetObject(page, index)
        order[ctypes.cast(handle, ctypes.c_void_p).value] = index
        if raw.FPDFPageObj_GetType(handle) != raw.FPDF_PAGEOBJ_PATH:
            continue
        mode, stroke = ctypes.c_int(), ctypes.c_int()
        colour = [ctypes.c_uint() for _ in range(4)]
        if not raw.FPDFPath_GetDrawMode(handle, ctypes.byref(mode), ctypes.byref(stroke)) or mode.value == 0 \
                or not raw.FPDFPageObj_GetFillColor(handle, *colour) or colour[3].value < 255 \
                or min(c.value for c in colour[:3]) < WHITE:
            continue
        l, b, r, t = (ctypes.c_float() for _ in range(4))
        raw.FPDFPageObj_GetBounds(handle, l, b, r, t)
        patches.append((index, (l.value, b.value, r.value, t.value)))

    def covered(handle, box) -> bool:
        drawn = order.get(ctypes.cast(handle, ctypes.c_void_p).value)
        if drawn is None:
            return False
        x, y = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
        return any(index > drawn and patch[0] < x < patch[2] and patch[1] < y < patch[3] for index, patch in patches)
    return covered
