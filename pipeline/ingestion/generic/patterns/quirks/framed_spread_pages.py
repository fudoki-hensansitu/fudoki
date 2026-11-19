"""Document quirk: the right page of a spread rules every row of its 節 and 説明, while the left page rules only its
header, the 目 rows and the underline of a 財源 subtotal (東大和市の予算書 R6・R7 介護保険: p68 rules 12 rows, p69 17,
7 of them shared). The shared joining wants most of the shorter page's row rules on the other page
(`layout.SPREAD_ROW_MATCH`), so such halves stayed two pages and the right page's 節 hung under the last 目 of the
left page. With the quirk a page that opens with no 款・項・目 column joins the page before it when both draw the same
frame: its top and bottom rules lie within `TOLERANCE` of the other page's."""
SCOPE = 'document'
OPTIONS = {'const': True}

TOLERANCE = 1.5  # pt


def matches(left: list[float], right: list[float]) -> bool:
    """Whether two pages' row rules (sorted y) start and end the same frame."""
    return abs(left[0] - right[0]) <= TOLERANCE and abs(left[-1] - right[-1]) <= TOLERANCE
