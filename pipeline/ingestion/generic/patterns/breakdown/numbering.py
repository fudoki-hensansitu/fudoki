from ingestion.generic.layout import Glyph


def number_span(glyph: Glyph) -> tuple[float, float, int]:
    """Where a leading number starts and ends, and its digit count. The end comes from the
    digits' own widths (a half-width digit is half the line height, a full-width one the
    height), not from the word's average character width, which a name joined to the number
    (`13使用料…`) widens. An opening bracket (`(1)`) is not part of the number: it starts where the digits do."""
    height = glyph.y1 - glyph.y0
    text = glyph.text
    lead = 1 if text[:1] in ('(', '（') else 0
    start = glyph.x0 + (height / 2 if lead and text[0].isascii() else height if lead else 0)
    body = text[lead:]
    digits = len(body) - len(body.lstrip('0123456789０１２３４５６７８９'))
    full = sum(1 for c in body[:digits] if not c.isascii())
    return start, start + (digits - full) * height / 2 + full * height, digits


# An end that fits is a weaker sign of one position than a start that fits (points).
END_PENALTY = 2.0


def position_gap(number: tuple[float, float, int], anchor: tuple[float, float, int], glyph: Glyph) -> float | None:
    """How far two numbers of one shape are from standing at one position, or None when they do not.

    They stand together when their starts align (left-aligned 4 and 18), or their ends align with at most
    one digit more or less (right-aligned 1 and 10; a 7-digit 事業番号 ending where a 2-digit number ends is
    not aligned with it). Tolerance: one digit, from the line height (事業「2」 at x 936 and 節「10」 at 941
    are two levels, 132209). A digit is about .6 of the line height wide (a smaller number font, `11` at
    6.0pt, is 3.5pt a digit).

    The gap is the start difference, or the end difference plus a penalty: an end that fits is a weaker
    sign than a start that fits (a left-aligned `99` starts 2.8 from a 事業's number and ends 1.4 from a
    節's, 132217, while a right-aligned `26` starts 3.8 from one and ends 0.2 from the other, 132209)."""
    tolerance = .6 * (glyph.y1 - glyph.y0)
    gaps = []
    if abs(number[0] - anchor[0]) <= tolerance:
        gaps.append(abs(number[0] - anchor[0]))
    if abs(number[1] - anchor[1]) <= tolerance and abs(number[2] - anchor[2]) <= 1:
        gaps.append(abs(number[1] - anchor[1]) + END_PENALTY)
    return min(gaps) if gaps else None


def same_position(number: tuple[float, float, int], anchor: tuple[float, float, int], glyph: Glyph) -> bool:
    return position_gap(number, anchor, glyph) is not None


def circled_continuation(number: tuple[float, float, int], matched, circled, glyph: Glyph):
    """Circled numbers end at ⑳, so a series goes on in plain digits (`⑨宿日直手当` then `23災害急患対応手当`).
    A plain number that fits a plain position only by where it ends, and starts where a circled number
    starts, is that series' next item. Returns that circled key, or None."""
    tolerance = .6 * (glyph.y1 - glyph.y0)
    if matched is not None and abs(number[0] - matched[0]) <= tolerance:
        return None
    fits = [(abs(number[0] - anchor[0]), index, key) for index, (key, anchor) in enumerate(circled)
            if abs(number[0] - anchor[0]) <= tolerance]
    return min(fits)[2] if fits else None


def nearest_position(number: tuple[float, float, int], anchors, glyph: Glyph):
    """The key among `anchors` (key, anchor) whose position the number fits best; the first among equals."""
    fits = [(gap, index, key) for index, (key, anchor) in enumerate(anchors)
            if (gap := position_gap(number, anchor, glyph)) is not None]
    return min(fits)[2] if fits else None

