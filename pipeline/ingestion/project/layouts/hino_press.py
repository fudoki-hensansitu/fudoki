"""日野市の当初予算概要の「主要施策と主な事業」を読む。

表（No.・事業名称・主管課・事業概要・経費の区分（新規・継続・拡充）・予算名称・予算額（千円））を1行1件で読む。
字を縦に組んだ頁（R7 の全頁、R8 の物価高対策の頁）は表として読めないので読まない。
"""
from __future__ import annotations

import re

from ingestion.project.layouts.press import PressItem, norm

TAGS = ('新規', '継続', '拡充')


def _clean(cell) -> str:
    return norm(cell or '').replace('\n', '')


def read(path) -> list[PressItem]:
    import pdfplumber
    items: list[PressItem] = []
    with pdfplumber.open(path) as pdf:
        for number, page in enumerate(pdf.pages, start=1):
            head = norm(page.extract_text() or '')[:300]
            page.flush_cache()
            if '予算名称' not in head:
                continue
            position = 0
            for table in page.extract_tables():
                for row in table:
                    cells = [_clean(c) for c in row]
                    numbered = next((i for i, c in enumerate(cells) if re.fullmatch(r'\d+', c)), None)
                    tag = next((i for i, c in enumerate(cells) if c in TAGS), None)
                    if numbered is None or tag is None or tag <= numbered + 1:
                        continue
                    name = cells[numbered + 1]
                    amounts = [c for c in cells[tag + 1:] if re.fullmatch(r'[\d,]+(千円)?', c)]
                    if not name or not amounts:
                        continue
                    position += 1
                    items.append(PressItem(number, name, [name], cells[tag] == '新規',
                                           int(amounts[-1].replace('千円', '').replace(',', '')), [], position))
    return items
