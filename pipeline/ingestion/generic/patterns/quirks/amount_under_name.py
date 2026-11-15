"""Axis quirk: a long name's amount goes alone on the line under it, in the right half of the column (132225 R5 決算書
備考: `新型コロナウイルス感染症対策用消耗品費` / `962`). A number of three or more digits, or with thousands separators,
alone on its line in the right half of a 内訳 group, under a name without an amount, is that name's amount, not an item
number."""
import re

SCOPE = 'axis'
OPTIONS = {'const': True}
AMOUNT = re.compile(r'[0-9]{3,}|[0-9]{1,3}(?:,[0-9]{3})+')


def amount(group, label: list, line_text: str, previous: tuple | None) -> bool:
    """Whether the lone number `label` (read as `line_text`) is the amount of the entry before it."""
    return (not group.subject and AMOUNT.fullmatch(line_text) is not None
            and label[0].x0 > (group.x0 + group.x1) / 2
            and previous is not None and previous[0] and not previous[1] and previous[3] != '')
