"""Axis quirk: the axis prints its deepest levels with no number, the first of them starting where the numbered names
above start (利島: `１８委託料` / `業務委託料`): a line that prints money and no number sits this many levels (the value)
below the level its indent alone gives."""
SCOPE = 'axis'
OPTIONS = {'type': 'integer', 'minimum': 1}


def shift(item, note: bool, value: int) -> int:
    return value if item.role == 'node' and item.code is None and not note and item.amounts else 0
