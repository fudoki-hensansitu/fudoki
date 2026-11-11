"""稲城市の当初予算の概要の「予算の特徴の補足説明」（新規事業・レベルアップ・見直し）の表を読む。

表の欄は「部局 事業 予算額 事業内容」で、R8 は1件を2行に印字する（上の行に「(ICT推進課)」と予算額・事業内容、下の行に事業名）。
R6・R7 は課と事業名を同じ枠に印字する。頁をまたぐ表は続きの頁に見出しが無い。
予算額は千円（レベルアップ・見直しは下に括弧で影響額を印字するので最初の数を読む）。新規事業の欄の事業を新規にする。
金額の欄が無い普通建設事業の表は読まない。
"""
from __future__ import annotations

import re

from ingestion.project.layouts.press import PressItem, norm

SECTIONS = {'新規事業': 'new', 'レベルアップ': 'level_up', '見直し': 'review', '普通建設事業': 'construction'}
AMOUNT = re.compile(r'^(△?[\d,]+)')


def _cell(value) -> str:
    return norm((value or '').replace('\n', ''))


def read(path) -> list[PressItem]:
    import pdfplumber
    items: list[PressItem] = []
    section = None
    columns: tuple[int, int, int, int] | None = None
    with pdfplumber.open(path) as pdf:
        for number, page in enumerate(pdf.pages, start=1):
            head = [norm(r).replace(' ', '') for r in (page.extract_text() or '').split('\n')[:3]]
            for line in head:
                if line in SECTIONS:
                    section = SECTIONS[line]
            if section in (None, 'construction'):
                page.flush_cache()
                continue
            position = 0
            for table in page.extract_tables():
                header = [_cell(c).replace(' ', '') for c in table[0]]
                if '事業' in header and any('予算額' in c for c in header):
                    columns = (header.index('事業'), next(i for i, c in enumerate(header) if '予算額' in c),
                               next((i for i, c in enumerate(header) if '内容' in c), len(header) - 1), len(header))
                    rows = table[1:]
                elif columns and len(table[0]) == columns[3]:  # 前の頁から続く表は見出しが無い
                    rows = table
                else:
                    continue
                name_at, amount_at, summary_at, _ = columns
                pending: list[str] | None = None
                for row in rows:
                    cells = [_cell(c) for c in row]
                    amount = AMOUNT.match(cells[amount_at].replace(' ', ''))
                    name = None
                    if amount and cells[name_at].startswith('('):
                        office_end = cells[name_at].index(')') + 1 if ')' in cells[name_at] else len(cells[name_at])
                        name = cells[name_at][office_end:]  # R6・R7 は課と事業名を同じ枠に印字する
                        pending = [amount.group(1), cells[summary_at]]
                    elif pending and cells[name_at]:
                        name = cells[name_at]
                    if pending and name:
                        position += 1
                        value = int(pending[0].replace(',', '').replace('△', '-'))
                        items.append(PressItem(number, name, [name], section == 'new', value,
                                               [pending[1]] if pending[1] else [], position))
                        pending = None
            page.flush_cache()
    return items
