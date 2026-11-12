"""Axis quirk: a name cut at the foot of a page runs on at the top of the axis's next page, with its amount
(東村山市の予算書 `0701700 災害時外国人支援ボランティア養成講座講` / next page `師謝礼 19`). The next page's first
item of the axis, printed without a number and with an amount, starting where the name after the number of the page's
last item starts, is the rest of that item when it ended the page without an amount: not an item of its own.

The number may be one the reading takes for no item number (a 7-digit 事業コード); it is the first word of the line,
all digits, and the name is the word after it. A line without an amount at the foot of a page reads as a note until
its amount joins it; it is an item then."""
import re

from ingestion.generic.layout import normalize

SCOPE = 'axis'
OPTIONS = {'const': True}


def runs_on(previous, first) -> bool:
    if not (previous.role in ('node', 'note') and not previous.amounts and previous.lines
            and first.role == 'node' and first.code is None and first.amounts and first.name and first.lines
            and first.page > previous.page):
        return False
    opening = previous.lines[0]
    if len(opening) < 2 or not re.fullmatch(r'[0-9]+', normalize(opening[0].text)):
        return False
    name_start = opening[1].x0 - opening[1].offset
    start = first.lines[0][0].x0 - first.lines[0][0].offset
    height = first.lines[0][0].y1 - first.lines[0][0].y0
    return abs(start - name_start) <= height / 2
