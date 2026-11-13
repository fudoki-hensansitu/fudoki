"""Axis quirk: the column's unit printed after an amount set in a name's line (132128: `救急指定増嵩経費分 229,000千円`).
The unit is no part of the amount. The value is the unit as printed (`千円`)."""
import re

SCOPE = 'axis'
OPTIONS = {'type': 'string', 'minLength': 1}

AMOUNT = re.compile(r'[△▲]?[0-9]{1,3}(?:,[0-9]{3})*')


def amount_length(shown: str, unit: str) -> int | None:
    """The characters of the run to keep when it is an amount followed by the unit, else None."""
    if shown.endswith(unit) and AMOUNT.fullmatch(shown[:-len(unit)]):
        return len(shown) - len(unit)
    return None
