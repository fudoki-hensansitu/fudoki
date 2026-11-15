"""Document quirk: a scan prints the facing pages a little apart, the even pages some points right of the odd ones
(`shifted_pages`, 134015 R5 国保: the frame starts at 36 on p17 and at 54 on p18). The indentation levels are learned
over the document from where the lines start, so a page set right reads its lines a level deeper. Each page whose frame
starts more than `SLACK` points from the first page's is moved onto it, as a spread's right page is moved (`offset`:
the printed place is kept)."""

SCOPE = 'document'
OPTIONS = {'const': True}

SLACK = 3  # points a frame's left edge may wander between pages


def align(logicals: list) -> None:
    """Move every logical page's bands and words so its leftmost frame edge lies where the first page's does."""
    if not logicals:
        return
    base = min(b.x0 for b in logicals[0].bands)
    for logical in logicals[1:]:
        offset = base - min(b.x0 for b in logical.bands)
        if abs(offset) <= SLACK or any(b.offset for b in logical.bands):
            continue
        for band in logical.bands:
            band.x0 += offset; band.x1 += offset; band.offset = offset
            band.spans = [(a + offset, b + offset, t) for a, b, t in band.spans]
            for word in band.words:
                word.x0 += offset; word.x1 += offset; word.offset = offset
