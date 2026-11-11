"""東久留米市の予算の概要の「主な新規・拡充事業、計画策定・投資的事業等」を読む。

表の欄は「区分 事項【予算計上の事業名】 予算額 摘要 所管」。区分は 重点・新規・拡充・継続（重点は他の札と重ねる）。
事項の【】の中は予算書の事業名（「【同事業名】」は事項と同じ名前）。予算額は千円。
"""
from __future__ import annotations

import re

from ingestion.project.layouts.press import PressItem, norm

ITEM = re.compile(r'^(.*?)【(.+?)】$')
DIGITS = re.compile(r'^△?[\d,]+$')


def _cell(value) -> str:
    return norm((value or '').replace('\n', ''))


def read(path) -> list[PressItem]:
    import pdfplumber
    items: list[PressItem] = []
    with pdfplumber.open(path) as pdf:
        for number, page in enumerate(pdf.pages, start=1):
            if '予算計上の事業名' not in (page.extract_text() or ''):
                page.flush_cache()
                continue
            position = 0
            for table in page.extract_tables():
                header = [_cell(c) for c in table[0]]
                if not any('予算計上の事業名' in c for c in header):
                    continue
                kind, name, amount, summary = (next(i for i, c in enumerate(header) if key in c)
                                               for key in ('区分', '事項', '予算額', '摘'))
                for row in table[1:]:
                    cells = [_cell(c) for c in row]
                    if not cells[name]:
                        continue
                    found = ITEM.match(cells[name])
                    title = found.group(1) if found else cells[name]
                    names = [title]
                    if found and found.group(2) != '同事業名':
                        names.append(found.group(2))
                    value = cells[amount].replace(' ', '')
                    position += 1
                    items.append(PressItem(number, title, names, '新規' in cells[kind],
                                           int(value.replace(',', '').replace('△', '-')) if DIGITS.match(value) else None,
                                           [cells[summary]] if cells[summary] else [], position))
            page.flush_cache()
    return items
