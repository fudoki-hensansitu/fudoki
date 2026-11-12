"""Axis quirk: an item number is printed in one word with its full-width stop and the start of the name
(`2．職員` / `人件費その他`, 132047 当初予算の説明), while another item's number stands as a word of its own (`1` `．`
`議`). The name starts after the digits' own width (half a character each) and the stop's (a full-width `．` is a
whole character, a `.` half): an even share of the word's width puts it a point or two right, and items of one level
fall into two indentation levels. A name that begins with a full-width digit (`6．５歳児健康診査関係費`) is item `6`
named `５歳児…`, not a decimal `6.5`."""
import re

SCOPE = 'axis'
OPTIONS = {'const': True}


STOPPED = re.compile(r'([0-9]{1,2})．(?=[０-９])')


def split(raw_text: str) -> tuple[str, str] | None:
    """The number and the name of a line whose name begins with a full-width digit after the stop, else None."""
    found = STOPPED.match(raw_text)
    return (found.group(1), raw_text[found.end():]) if found else None


def name_start(glyph, prefix: int) -> float | None:
    """Where the name starts in `glyph` after its first `prefix` characters (digits and a stop), or None when
    the word is not a number glued to a name."""
    if glyph.text[prefix:prefix + 1] in ('.', '．'):
        prefix += 1  # the stop the item number leaves out before a full-width digit (`6．５歳児`)
    head, rest = glyph.text[:prefix], glyph.text[prefix:]
    if not head or not rest or not all(c.isdigit() and c.isascii() or c in '.．' for c in head) \
            or not any(c.isdigit() for c in head):
        return None
    units = lambda text: sum(1 if c.isascii() else 2 for c in text)
    return glyph.x0 + (glyph.x1 - glyph.x0) * units(head) / units(glyph.text)
