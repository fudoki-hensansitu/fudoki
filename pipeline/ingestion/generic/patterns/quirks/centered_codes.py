"""Axis quirk: an item's number is printed on the middle line of its wrapped name, the items set apart by a blank line
(足立区 R8 予算説明書 歳入の節: `東 京 ユ ー ス` / `14 ヘルスケア推進` / `事 業 補 助 金`). The lines over the number's line
belong to its item, not to the item above: the lines read onto the item above after a blank line, and close over the
numbered line, move down to the numbered item; the name lines that open a block over its first number join it. The numbered line stays the item's first line,
so the item keeps its number's place (its level and the anchor its amounts are owned by)."""
from ingestion.generic.layout import normalize, text

SCOPE = 'axis'
OPTIONS = {'const': True}


def _height(line) -> float:
    return max(g.y1 - g.y0 for g in line)


def _top(line) -> float:
    return min(g.y0 for g in line)


def _apart(upper, lower) -> bool:
    """Whether a blank line stands between two lines."""
    return min(g.y0 for g in lower) - max(g.y1 for g in upper) > .8 * _height(upper)


def regroup(items: list) -> list:
    joined = []
    for item in items:  # name lines that open a block, over its first number (no item above them to read onto)
        above = joined[-1] if joined else None
        if (above is not None and item.code is not None and above.code is None and not above.amounts and above.role == 'node'
                and above.page == item.page and above.lines and item.lines
                and not _apart(max(above.lines, key=_top), min(item.lines, key=_top))):
            item.lines, item.name = item.lines + above.lines, above.name + item.name
            joined[-1] = item
            continue
        joined.append(item)
    items = joined
    for above, item in zip(items, items[1:]):
        if item.code is None or above.page != item.page or len(above.lines) < 2 or not item.lines:
            continue
        upper = sorted(above.lines, key=_top)
        if _apart(upper[-1], min(item.lines, key=_top)):
            continue
        cut = next((i for i in range(len(upper) - 1, 0, -1) if _apart(upper[i - 1], upper[i])), None)
        if cut is None:
            continue
        moved = ''.join(normalize(text(line)) for line in upper[cut:])
        if not moved or not above.name.endswith(moved):
            continue
        above.lines = [line for line in above.lines if not any(line is m for m in upper[cut:])]
        item.lines = item.lines + upper[cut:]
        above.name, item.name = above.name[:-len(moved)], moved + item.name
    for item in items:  # an item read at the top of a page opens with the name line over its number
        numbered = next((line for line in item.lines if line and item.code is not None
                         and normalize(line[0].text).startswith(item.code)), None)
        if numbered is not None and numbered is not item.lines[0]:
            item.lines = [numbered] + [line for line in item.lines if line is not numbered]
    return items
