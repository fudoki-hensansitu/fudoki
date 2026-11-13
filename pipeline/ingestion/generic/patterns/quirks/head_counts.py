"""Axis quirk: a line that prints only a head count (`２６人`) under an item with an amount is that item's head count,
not an item (132021: `議員報酬 174,972` / `２６人`). It becomes a note of hint 職員, which the document quirk
`dropped_notes` keeps out of the 注記 axis and declares as an exclusion."""
import re

SCOPE = 'axis'
OPTIONS = {'const': True}
HINT = '職員'


def matches(raw: str) -> bool:
    return re.fullmatch(r'[0-9０-９]+人', raw) is not None
