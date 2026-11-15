"""Axis quirk: the breakdown prints an unruled reckoning table under an item (北区 当初予算の説明: `区 分 月 額 年 額` /
`区 長 1,150.5 13,806` under `ア 給料 35,922`). The line that begins with the table's heading word (the value) and the
lines after it up to the next numbered line are a reckoning of the item above them (積算), not its items."""
from ingestion.generic.tree import shape_of

SCOPE = 'axis'
OPTIONS = {'type': 'string', 'minLength': 1}
KIND = '積算'


def within(raw: str, item, inside: bool, heading: str) -> bool:
    """Whether the line is a line of a table: its heading, or a line after the heading before a numbered line."""
    if raw.startswith(heading):
        return True
    if item.code is not None or shape_of(item) is not None:
        return False
    return inside
