"""昭島市の一般会計予算概要を読む。

「主な建設事業」「主な事業（建設事業以外）」などの表（款・事業名・事業内容・予算額・うち一般財源、単位千円）を1行1件で読む。
事業名の「（新）」は新規の印、事業内容は points に置く。「継続費・債務負担行為」の節からは読まない。
R7 は字が cid で符号化されていて読めないので 0 件。
"""
from __future__ import annotations

import re

from ingestion.project.layouts.press import PressItem, norm


def _header(row: list) -> tuple[int, int, int] | None:
    cells = [norm(c or '').replace(' ', '').replace('\n', '') for c in row]
    if not cells or cells[0] != '款':
        return None
    name = next((i for i, c in enumerate(cells) if c == '事業名'), None)
    content = next((i for i, c in enumerate(cells) if c == '事業内容'), None)
    amount = next((i for i, c in enumerate(cells) if c.startswith('予算額')), None)
    return (name, content, amount) if None not in (name, content, amount) else None


def read(path) -> list[PressItem]:
    import pdfplumber
    items: list[PressItem] = []
    with pdfplumber.open(path) as pdf:
        for number, page in enumerate(pdf.pages, start=1):
            head = norm(page.extract_text() or '')[:80]
            page_items: list[PressItem] = []
            if '継続費' in head and '債務負担行為' in head:
                break
            for table in page.extract_tables():
                columns = None
                for row in table:
                    columns = _header(row) or columns
                    if columns is None or _header(row):
                        continue
                    name_cell, content_cell, amount_cell = (row[i] if i < len(row) else None for i in columns)
                    amount = norm(amount_cell or '').replace(',', '')
                    if not name_cell or not amount.isdigit():
                        continue
                    name = norm(name_cell).replace('\n', '')
                    is_new = '(新)' in name
                    name = name.replace('(新)', '').strip()
                    page_items.append(PressItem(number, name, [name], is_new, int(amount),
                                                [norm(content_cell or '').replace('\n', '')], len(page_items) + 1))
            items.extend(page_items)
            page.flush_cache()
    return items
