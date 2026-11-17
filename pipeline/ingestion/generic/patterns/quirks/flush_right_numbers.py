"""Axis quirk: item numbers are set flush right, a character before the name (132233 R5 当初予算の説明: a project's
`2` and `17` both end at 267pt, a 節's `8` and `12` at 277pt). OCR reads the number apart or joined with the gap and
the name into one word (`17 シルバーピア運営経費`), and a name's first glyph can box its ink a few points right of where
the character starts (`シ` 283pt where `車` starts 279pt): the name's start read from the words falls between two
levels. The number's end does not: the name starts one character (the line's height) after it. A joined number
ends after its digits' own width, half a character each, and so does one read alone in a box wider than them."""

SCOPE = 'axis'
OPTIONS = {'const': True}


def name_start(label) -> float | None:
    """Where the name starts after the item's number, or None when the line does not begin with a number."""
    first = label[0]
    digits = len(first.text) - len(first.text.lstrip('0123456789'))
    if not digits:
        return None
    height = first.y1 - first.y0
    # A number read alone can be boxed with the padding of a line (`10` 268–287pt): only a box about as wide as its
    # digits ends where they do; any other number ends its digits' width after its start.
    tight = digits == len(first.text) and first.x1 - first.x0 <= .75 * digits * height
    end = first.x1 if tight else first.x0 + digits * height / 2
    return end + height
