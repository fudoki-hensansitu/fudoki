"""あきる野市の当初予算(案)の概要の「一般会計歳出事業の概要」の表を読む。

表の欄は「事業名 事業内容 事業費 主管課」で、事業費は千円。事業名の前に「【新】」「【拡充】」の札を付けることがある。
同じ資料に綴じた補正予算の表は欄の見出しが違うので読まない。
"""
from __future__ import annotations

import re

from ingestion.project.layouts.press import PressItem, norm

DIGITS = re.compile(r'^△?[\d,]+$')
TAG = re.compile(r'^【(新|拡充)】 ?')


def _cell(value) -> str:
    return norm((value or '').replace('\n', ''))


def read(path) -> list[PressItem]:
    import pdfplumber
    items: list[PressItem] = []
    with pdfplumber.open(path) as pdf:
        for number, page in enumerate(pdf.pages, start=1):
            if '一般会計歳出事業' not in (page.extract_text() or '') and '事 業 名 事 業 内 容 事 業 費' not in (page.extract_text() or ''):
                page.flush_cache()
                continue
            position = 0
            for table in page.extract_tables():
                amount_at = None
                for row in table:
                    cells = [_cell(c) for c in row]
                    if any(c.replace(' ', '') == '事業費' for c in cells):
                        amount_at = next(i for i, c in enumerate(cells) if c.replace(' ', '') == '事業費')
                        continue
                    if amount_at is None:
                        continue
                    amount = next((c for c in cells[amount_at - 1:amount_at + 2] if DIGITS.match(c.replace(' ', ''))), None)
                    filled = [c for c in cells[:amount_at] if c]
                    if amount is None or not filled:
                        continue
                    tag = TAG.match(filled[0])
                    name = TAG.sub('', filled[0])
                    position += 1
                    items.append(PressItem(number, name, [name], bool(tag and tag.group(1) == '新'),
                                           int(amount.replace(' ', '').replace(',', '').replace('△', '-')),
                                           filled[1:2], position))
            page.flush_cache()
    return items
