"""Document quirk: a subject's code is printed alone on the middle line of its cell, its name wrapped on the lines
above and below it (`戸籍住民基本台` / `3` / `帳費`, 渋谷区 R5 決算の文字層, the 項 whose name runs into the 目 column). The
three lines are one item before amounts find their owner: the amounts are printed on the code's line, and a name line
read as an item of its own (deeper, by where it starts) would take them.

The code read with the name's second line (`株式等譲渡` / `5 所得割交付金`, 武蔵村山市 R7 決算審査意見書の款別の表, the
code printed between the two lines and nearer the second): the first line, read as a codeless item, is put at the head
of the coded item's name, or the item above would take it as the wrapped tail of its own name. So it is when OCR read
the code glued to the second line (`公共施設建設基金繰` / `2入金`, 江東区 R6 決算書の歳入): the name line above starts
right of the code, within a character and a half of where the glued word starts.

The 内訳 too (西東京市 R5〜R7 決算書の特別会計の歳入の節: `特別徴収保険料` / `1` with the amounts / `現年分`): the
first line would be an item of its own without a code or an amount. A name line below that begins with digits
(`人 生` / `19` / `1 0 0 年時代` / `セカンドライフ` …, R7 決算書の一般会計の第15款) is read as an item coded `1`; it
starts where the name line above starts, not in the code column, so its digits are put back at the head of its name."""

SCOPE = 'document'
OPTIONS = {'const': True}


def _height(item) -> float:
    return max(g.y1 - g.y0 for g in item.lines[0])


def _name_only(item) -> bool:
    return item.role == 'node' and item.code is None and bool(item.name) and not item.amounts and len(item.lines) == 1


def _name_below(item, above) -> str | None:
    """The name a line below the code carries: a name-only line, or one whose leading digits were read as its code
    though they start where the name line above starts."""
    if _name_only(item):
        return item.name
    if (item.role == 'node' and item.code is not None and item.code.isdigit() and item.name and not item.amounts
            and abs(item.lines[0][0].x0 - above.lines[0][0].x0) <= 3):
        return item.code + item.name
    return None


def _second_line_start(item, above) -> tuple[float, float, float] | None:
    """Where the name's second line starts, how far off the line above may start, and the line height its distance
    below that line is measured in: the first word after a line of digits only, or a word that begins with the code and
    runs into the name (the name starts a little right of it; the glued word is boxed taller than the line above)."""
    if len(item.lines) >= 2 and all(g.text.isdigit() for g in item.lines[0]):
        return item.lines[1][0].x0, 3, _height(above)
    first = item.lines[0][0]
    rest = first.text[len(item.code):]
    if len(item.lines) == 1 and first.text.startswith(item.code) and rest and not rest[0].isdigit():
        height = first.y1 - first.y0
        return first.x0 + .75 * height, .75 * height, max(height, _height(above))
    return None


def join(items: list) -> list:
    result = []
    index = 0
    while index < len(items):
        item = items[index]
        above = result[-1] if result else None
        below = items[index + 1] if index + 1 < len(items) else None
        if (item.code is not None and not item.name and not item.amounts and item.role == 'node'
                and above is not None and below is not None and _name_only(above)
                and (below_name := _name_below(below, above)) is not None
                and above.page == item.page == below.page
                and abs(above.lines[0][0].x0 - below.lines[0][0].x0) <= 3
                and 0 < item.anchor - above.anchor <= 1.2 * _height(item)
                and 0 < below.anchor - item.anchor <= 1.2 * _height(item)):
            result.pop()
            item.lines = above.lines + item.lines + below.lines
            item.name = above.name + below_name
            result.append(item)
            index += 2
            continue
        start = _second_line_start(item, above) if (item.code is not None and item.name and item.role == 'node'
                                                    and above is not None and _name_only(above)) else None
        if (start is not None and above.page == item.page
                and abs(above.lines[0][0].x0 - start[0]) <= start[1]
                and 0 < item.anchor - above.anchor <= 1.2 * start[2]):
            result.pop()
            item.lines = above.lines + item.lines
            item.name = above.name + item.name
        result.append(item)
        index += 1
    return result
