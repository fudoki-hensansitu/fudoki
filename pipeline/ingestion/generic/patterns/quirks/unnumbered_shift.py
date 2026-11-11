"""Axis quirk: the axis prints its deepest levels with no number, the first of them starting where the numbered names
above start (利島: `１８委託料` / `業務委託料`): a line that prints money and no number sits this many levels (the value)
below the level its indent alone gives. The money may be its own (利島) or printed in the axis's amount column
beside it (`3 職員手当等 86,812` / `扶養手当 2,178`, 131113's 細節)."""
SCOPE = 'axis'
OPTIONS = {'type': 'integer', 'minimum': 1}


def shift(item, note: bool, value: int, column_money: bool = False) -> int:
    return value if item.role == 'node' and item.code is None and not note and (item.amounts or column_money) else 0
