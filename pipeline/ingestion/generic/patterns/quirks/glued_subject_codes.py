"""Document quirk: the 款・項・目 codes are printed in one word with the first character of the name (`2.総` / `務` /
`費`, `10.民`, 132047 当初予算) and set right, so a two-digit code starts a digit left of a one-digit code of its
level. The subject pattern `indent` reads the codes set right (`hierarchy.subject.codes: right`) by the digits of
such a word, and a half-width digit is half the word's height wide (the word's own width holds the point and a
character of the name)."""
import re

SCOPE = 'document'
OPTIONS = {'const': True}

GLUED = re.compile(r'([0-9]{1,2})[.．]')


def digits(glyph) -> str:
    """The code of a word that starts with one (`10.総` → `10`), else the word."""
    found = GLUED.match(glyph.text)
    return found.group(1) if found else glyph.text


def digit_width(glyph) -> float:
    return (glyph.y1 - glyph.y0) / 2
