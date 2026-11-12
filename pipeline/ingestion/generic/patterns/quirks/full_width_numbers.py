"""Axis quirk: an item number set in full-width digits with a full-width stop (`９．納付案内センター事業経費`, 131164)
is a number wherever its line starts (the explanation of a 目 printed above the items starts where they do and
outvotes them).

`stop_ends_number`: the full-width stop ends the number, whatever the width of its digits (`12．多摩マッチング…`,
`６．２０２５年農林業センサス`, 132195): a name that begins with digits keeps its number. The name starts after the
digits' own width (a half-width digit is half the line height) and the stop's, where its wrapped lines start; an even
share of the word's width puts it a few points too far right."""
import re

SCOPE = 'axis'
OPTIONS = {'oneOf': [{'const': True}, {
    'type': 'object', 'additionalProperties': False, 'required': ['stop_ends_number'],
    'properties': {'stop_ends_number': {'const': True}}}]}
FULL_WIDTH_NUMBERED = re.compile(r'[０-９]{1,2}．(?![0-9０-９])')
STOPPED = re.compile(r'([0-9０-９]{1,2})．')


def stop_ends(value) -> bool:
    return isinstance(value, dict) and bool(value.get('stop_ends_number'))


def numbered(raw_text: str, value=True) -> bool:
    return (FULL_WIDTH_NUMBERED.match(raw_text) is not None
            or (stop_ends(value) and STOPPED.match(raw_text) is not None))


def split(raw_text: str, value) -> tuple[str, str] | None:
    """(number, name) of a line whose number a full-width stop ends (`stop_ends_number`); None for any other line."""
    found = STOPPED.match(raw_text) if stop_ends(value) else None
    return (found.group(1), raw_text[found.end():]) if found and found.end() < len(raw_text) else None


def name_start(label, value) -> float | None:
    """Where the name of such a line starts (`stop_ends_number`); None for any other line."""
    found = STOPPED.match(''.join(g.text for g in label)) if stop_ends(value) and label else None  # `1` `0．子ども…`: one line
    if found is None:
        return None
    height = label[0].y1 - label[0].y0
    return label[0].x0 + sum(height / 2 if c.isascii() else height for c in found.group(1)) + height
