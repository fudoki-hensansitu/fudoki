"""練馬区の予算案の概要（横長。柱ごとの見開きの左の頁に、取組と予算額を「７８,９９２千円（産後ケア事業の充実）」の形で並べる）を読む。

額の後ろの括弧の中が事業名。長い事業名は括弧の中で折り返し、次の行（説明の文を挟むと2行先）の「）」までが続き。右の頁や後ろの頁の説明の文は読まない。新規・充実の印は事業ごとに付けない。
"""
from __future__ import annotations

import re

from ingestion.project.layouts.press import PressItem, norm

AMOUNT = re.compile(r'([\d,]+)千円\(')


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
            yield int(match.group(1).replace(',', '')), row[match.end():end].strip()


def read(path) -> list[PressItem]:
    import pdfplumber
    items: list[PressItem] = []
    with pdfplumber.open(path) as pdf:
        for number, page in enumerate(pdf.pages, start=1):
            rows = [norm(line) for line in (page.extract_text() or '').split('\n')]
            page.flush_cache()
            position = 0
            for index, row in enumerate(rows):
                if row.count('(') > row.count(')') and AMOUNT.search(row):
                    for following in rows[index + 1:index + 3]:
                        if ')' in following and '千円' not in following:
                            row += following
                            break
                for amount, name in _items(row):
                    position += 1
                    items.append(PressItem(number, name, [name], False, amount, [], position))
    return items
