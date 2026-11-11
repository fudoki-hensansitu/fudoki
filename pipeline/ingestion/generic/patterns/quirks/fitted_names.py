"""Axis quirk: names are fitted to a width of `chars` characters (132128); a longer name starts `overflow_left_chars`
characters left of where its level starts, and keeps its level."""
SCOPE = 'axis'
OPTIONS = {'type': 'object', 'additionalProperties': False, 'required': ['chars', 'overflow_left_chars'],
           'properties': {'chars': {'type': 'integer', 'minimum': 1}, 'overflow_left_chars': {'type': 'integer', 'minimum': 0}}}


def shift(items: list, value: dict) -> None:
    for item in items:
        if item.role == 'node' and len(item.name) > value['chars']:
            item.indent += value['overflow_left_chars'] * (item.lines[0][0].y1 - item.lines[0][0].y0)
