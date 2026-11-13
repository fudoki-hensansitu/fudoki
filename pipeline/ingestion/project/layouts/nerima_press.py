"""練馬区の予算案の概要（横長。柱ごとの見開きの左の頁に、取組と予算額を「７８,９９２千円（産後ケア事業の充実）」の形で並べる）を読む。

額の後ろの括弧の中が事業名。長い事業名は括弧の中で折り返し、次の行（説明の文を挟むと2行先）の「）」までが続き。右の頁や後ろの頁の説明の文は読まない。新規・充実の印は事業ごとに付けない。
"""
from __future__ import annotations

import re

from ingestion.project.layouts.press import PressItem, norm, page_lines

AMOUNT = re.compile(r'(\d{1,3}(?: ?,\d{3})*)千円\(')  # bbox は「2 ,180 ,090千円」と桁の区切りの前で語を切る


def _items(row: str):
    """「78,992千円(産後ケア事業の充実)」を額と括弧の中に分ける。括弧の中の括弧も事業名に含める。"""
    for match in AMOUNT.finditer(row):
        depth, end = 0, None
        for index in range(match.end() - 1, len(row)):
            depth += {'(': 1, ')': -1}.get(row[index], 0)
            if depth == 0:
                end = index
                break
        if end is not None:
            yield int(re.sub(r'[ ,]', '', match.group(1))), row[match.end():end].strip()


def read(path) -> list[PressItem]:
    items: list[PressItem] = []
    for number, printed in page_lines(path):
        rows = [norm(line) for line in printed]
        position = 0
        for index, row in enumerate(rows):
            if row.count('(') > row.count(')') and AMOUNT.search(row):
                for following in rows[index + 1:index + 3]:
                    if ')' in following and '千円' not in following:
                        row += following[following.rfind(' ', 0, following.index(')')) + 1:]  # bbox は同じ高さの図の字を行の頭に並べる
                        break
            for amount, name in _items(row):
                position += 1
                items.append(PressItem(number, name, [name], False, amount, [], position))
    return items
