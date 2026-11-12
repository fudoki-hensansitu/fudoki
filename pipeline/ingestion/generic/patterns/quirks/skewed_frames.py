"""Document quirk: a skewed scan reads a frame's rules short (132144). It loses the ends of the closing rule (148–502
of a frame 72–571): the rule drawn where the frame's sides end across most of its columns closes the frame, if no rule
across the whole frame lies between. It reads the header's bottom rule short of the frame's right edge: with no full
rule above the first figure, the rule across most of the frame above it ends the header."""


SCOPE = 'document'
OPTIONS = {'const': True}


def bottom(page, frame: list, middle: list, horizontals: list, bottom: float) -> float:
    from ingestion.generic.layout import _covers
    most = lambda h: sum(1 for m in middle if _covers(h, m)) >= max(2, .6 * len(middle))
    sides = min(max((r.y1 for r in page.rules if r.vertical and abs(r.x0 - x) <= 3), default=bottom)
                for x in (frame[0], frame[-1]))
    closing = [h for h in horizontals if abs(h.y0 - sides) <= 4 and most(h)]
    if sides - bottom > 100 and closing and not any(bottom < h.y0 < sides - 4 and all(_covers(h, m) for m in middle)
                                                      for h in horizontals):
        return max(h.y0 for h in closing)
    return bottom


def header_bottom(horizontals: list, frame, reach: float, first: float) -> float | None:
    x0, x1, top, _, _ = frame
    wide = [h.y0 for h in horizontals if h.x0 <= x0 + reach and h.x1 - x0 >= .6 * (x1 - x0) and top + 1 < h.y0 <= first + 1]
    return max(wide) if wide else None
