"""The 説明 prints each 事業 with the legal 節 under it, and under a 節 its 細節 or its items (東大和市の予算説明書:
`1 職員人件費` / `2 給料` / `・特別職給料(2人)`, `10 需用費` / `1 消耗品費`). The 事業 and the 節 print their numbers
at one place, so the place does not part them: a numbered line named as a legal 節 under its legal number (`setsu_master.csv`) is a 節, under
the open 事業; another numbered line is a 事業, or a 細節 where its number starts right of the open 節's. A line marked
`・` is an item of the numbered line above it, or a sibling of the item above it. A line with neither number nor mark is
such an item whose mark OCR dropped (`施設修繕料` at the marks' place), or, under a 事業 with no 節 open, the 節 itself
(`1 予備費` / `予備費` / `・予備費`)."""
from ingestion.generic.patterns.quirks.legal_setsu_codes import _legal, _strip

SLACK = 12.0  # pt: how far right of the open 節's number a 細節's number starts at least (a one-digit 事業 number sits 5pt right of a two-digit 節's)


def _start(item) -> float | None:
    return item.lines[0][0].x0 if item.lines and item.lines[0] else None


def _setsu(code: str, name: str) -> bool:
    """Whether a numbered line is a legal 節: its name is one, under that 節's number (`1 予備費` is a 事業)."""
    legal = {_strip(label): number for label, number in _legal().items()}
    return code.isdigit() and legal.get(_strip(name or '')) == int(code)


def depth(item, initial, order, opened, anchors, prepared):
    open_at = lambda level: opened[level - 1] if len(opened) >= level and opened[level - 1] is not None else None
    if item.code is not None:
        if _setsu(item.code, item.name):
            return 2
        setsu = open_at(2)
        x, there = _start(item), (_start(setsu) if setsu is not None else None)
        if setsu is not None and setsu.code is not None and x is not None and there is not None and x - there >= SLACK:
            return 3
        return 1
    for level in range(len(opened), 0, -1):
        above = open_at(level)
        if above is not None:
            return level if above.code is None and level >= 3 else level + 1
    return 1


def prepare(all_items, levels, depth_of):
    return None
