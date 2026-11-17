"""Document quirk: a frame drawn without its top rule (131156 杉並区 R6 当初予算の歳入の総括、p44・p45). The column
rules start at the frame's top and run down past the first horizontal rule, which is the header's bottom: read alone,
that rule opens the frame and the heading words above it are left out (the first body row is taken for the header).
When most of the frame's column rules start more than a few points above the first rule across it, the frame opens
where they start."""

SCOPE = 'document'
OPTIONS = {'const': True}
ABOVE = 4  # points: a column rule that starts this far above the first rule across the frame starts the frame


def top(page, frame: list, top: float) -> float:
    starts = []
    for x in frame:
        rules = [r for r in page.rules if r.vertical and abs(r.x0 - x) <= 3 and r.y1 > top]
        if rules:
            starts.append(min(r.y0 for r in rules))
    above = [y for y in starts if y < top - ABOVE]
    if len(above) >= 2 and len(above) * 2 > len(frame):
        return min(above)
    return top
