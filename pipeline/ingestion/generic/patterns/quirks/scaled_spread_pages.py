"""Document quirk: the left page of a spread is printed at a larger scale than its right page (132063 決算書 R5 p216: the
row rules are 4.2% further apart than the next page's, so no shift lines the rows up and the halves stay two logical
pages). With the quirk a row rule counts as shared when it lines up with one of the other page's after the larger
page's rows are shrunk about the last row to some scale up to 10% (`layout.same_rows`)."""

SCOPE = 'document'
OPTIONS = {'const': True}

SCALES = [1 + step / 1000 for step in range(10, 101)]
WITHIN = 1.5  # points


def matches(shorter: list[float], longer: list[float]) -> int:
    best = 0
    for first, second in ((shorter, longer), (longer, shorter)):  # either page may be the larger one
        for scale in SCALES:
            best = max(best, sum(1 for y in second
                                 if any(abs(second[-1] - (first[-1] - x) / scale - y) <= WITHIN for x in first)))
    return best
