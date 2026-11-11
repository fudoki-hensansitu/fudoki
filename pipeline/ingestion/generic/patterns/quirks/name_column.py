"""Axis quirk: names are set in a column of their own a space right of the numbers (281000). A name wrapped above or
below a line printing only its number starts up to a character past it, and a line without a number whose middle is
within a line height of a number's line is that number's name, even where no row rule bounds the cell (281000's
image-ruled pages draw none between 節). `line_reach`: how far such a line may sit, in heights of its box (default 1;
a Paddle box is lower than the line pitch, so a scan read by Paddle declares a little over 1)."""
from collections import defaultdict

SCOPE = 'axis'
OPTIONS = {'oneOf': [{'const': True}, {
    'type': 'object', 'additionalProperties': False, 'required': ['line_reach'],
    'properties': {'line_reach': {'type': 'number', 'minimum': 1, 'maximum': 2}}}]}


def slack(label) -> float:
    """How far past the name's start a wrapped line may start: a character."""
    return label[0].y1 - label[0].y0


def attach(entries: list[tuple], single: dict, skipped: set[int], value) -> None:
    """Join each line without a number to the nearest numbered line within reach (`single`: index → its cell's members)."""
    reach = float(value['line_reach']) if isinstance(value, dict) else 1.0
    middle = lambda i: sum((g.y0 + g.y1) / 2 for g in entries[i][0]) / len(entries[i][0])
    numbered = [i for i, entry in enumerate(entries) if entry[2] is not None and entry[0]]
    attached: dict[int, list[int]] = defaultdict(list)
    for i, (label, money, code, _) in enumerate(entries):
        if code is not None or not label or money or i in single or i in skipped or not numbered:
            continue
        nearest = min(numbered, key=lambda n: abs(middle(n) - middle(i)))
        if abs(middle(nearest) - middle(i)) <= reach * (label[0].y1 - label[0].y0):
            attached[nearest].append(i)
    for number, lines_ in attached.items():
        members = tuple(sorted({*single.get(number, (number,)), *lines_}))
        single.update({i: members for i in members})
