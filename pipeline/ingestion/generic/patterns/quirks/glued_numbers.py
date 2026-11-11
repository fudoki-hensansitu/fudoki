"""Axis quirk: a number read as one word with a name that begins with digits (`101歳6か月…` holds 10), where the
number before it is on another page or in another cell. The value maps a line's start to the number it holds."""
SCOPE = 'axis'
OPTIONS = {'type': 'object', 'minProperties': 1, 'additionalProperties': {'type': 'string', 'pattern': '^[0-9]+$'}}


def number(raw: str, value: dict) -> str | None:
    """The number the line holds, by the last declared start it begins with."""
    found = None
    for start, held in value.items():
        if raw.startswith(start):
            found = held
    return found
