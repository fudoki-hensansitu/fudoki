"""三宅村の当初予算の概要の「投資的事業」の表を読む。

表は「区分 事業名 事業費」を左右2組に並べる（区分は款。同じ款の続きの行は区分が空く）。事業費は千円。
左の組を上から読み、次に右の組を読む。「一般管理費」のような名前は款ごとに出るので、款を説明に入れる。
"""
from __future__ import annotations

import re

from ingestion.project.layouts.press import PressItem, norm

DIGITS = re.compile(r'^[\d,]+$')


def _cell(value) -> str:
    return norm((value or '').replace('\n', ''))


def read(path) -> list[PressItem]:
    import pdfplumber
    items: list[PressItem] = []
    with pdfplumber.open(path) as pdf:
        for number, page in enumerate(pdf.pages, start=1):
            position = 0
            for table in page.extract_tables():
                header = [_cell(c) for c in table[0]]
                starts = [i for i in range(len(header) - 2) if header[i:i + 3] == ['区分', '事業名', '事業費']]
                for start in starts:
                    kan = ''
                    for row in table[1:]:
                        cells = [_cell(c) for c in row[start:start + 3]]
                        kan = cells[0] or kan
                        if len(cells) < 3 or not cells[1] or not DIGITS.match(cells[2]):
                            continue
                        position += 1
                        items.append(PressItem(number, cells[1], [cells[1]], False, int(cells[2].replace(',', '')),
                                               [kan] if kan else [], position))
            page.flush_cache()
    return items
