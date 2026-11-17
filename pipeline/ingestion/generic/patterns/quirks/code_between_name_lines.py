"""Document quirk: a subject's code is printed alone on the middle line of its cell, its name wrapped on the lines
above and below it (`戸籍住民基本台` / `3` / `帳費`, 渋谷区 R5 決算の文字層, the 項 whose name runs into the 目 column). The
three lines are one item before amounts find their owner: the amounts are printed on the code's line, and a name line
read as an item of its own (deeper, by where it starts) would take them.

The code read with the name's second line (`株式等譲渡` / `5 所得割交付金`, 武蔵村山市 R7 決算審査意見書の款別の表, the
code printed between the two lines and nearer the second): the first line, read as a codeless item, is put at the head
of the coded item's name, or the item above would take it as the wrapped tail of its own name."""

SCOPE = 'document'
OPTIONS = {'const': True}


def _height(item) -> float:
    return max(g.y1 - g.y0 for g in item.lines[0])


def _name_only(item) -> bool:
    return item.role == 'node' and item.code is None and bool(item.name) and not item.amounts and len(item.lines) == 1


def join(items: list) -> list:
    result = []
    index = 0
    while index < len(items):
        item = items[index]
        above = result[-1] if result else None
        below = items[index + 1] if index + 1 < len(items) else None
        if (item.code is not None and not item.name and not item.amounts and item.role == 'node'
                and above is not None and below is not None and _name_only(above) and _name_only(below)
                and above.page == item.page == below.page
                and abs(above.lines[0][0].x0 - below.lines[0][0].x0) <= 3
                and 0 < item.anchor - above.anchor <= 1.2 * _height(item)
                and 0 < below.anchor - item.anchor <= 1.2 * _height(item)):
            result.pop()
            item.lines = above.lines + item.lines + below.lines
            item.name = above.name + below.name
            result.append(item)
            index += 2
            continue
        if (item.code is not None and item.name and item.role == 'node' and len(item.lines) >= 2
                and all(g.text.isdigit() for g in item.lines[0])
                and above is not None and _name_only(above) and above.page == item.page
                and abs(above.lines[0][0].x0 - item.lines[1][0].x0) <= 3
                and 0 < item.anchor - above.anchor <= 1.2 * _height(above)):
            result.pop()
            item.lines = above.lines + item.lines
            item.name = above.name + item.name
        result.append(item)
        index += 1
    return result
