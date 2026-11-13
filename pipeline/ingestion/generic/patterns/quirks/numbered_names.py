"""Document quirk: a name printed with the number of its item set after it (`消耗品費 1` / `修繕料 6`, 武蔵村山市: the
細節's number of the 需用費 it belongs to), the amount at the end of the line (`消耗品費 1 … 104`). A one- or two-digit
number within two characters of the name, with the amount further right, is part of the name."""
import re

from ingestion.generic.layout import normalize, text

SCOPE = 'document'
OPTIONS = {'const': True}


def keeps(parts: list, money: list) -> bool:
    """Whether the first run of `money` is the name's number, not an amount."""
    if len(money) < 2 or not parts or not re.fullmatch(r'[0-9]{1,2}', normalize(text(money[0]))):
        return False
    height = money[0][0].y1 - money[0][0].y0
    return (money[0][0].x0 - parts[-1][-1].x1 < 2 * height
            and money[1][0].x0 - money[0][-1].x1 > 4 * height)
