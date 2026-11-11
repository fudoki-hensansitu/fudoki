"""荒川区の予算（案）の概要（「予算の主要な事業」の章。都市像ごとに事業を番号付きで並べる）を読む。

事業の見出しは「（１２）高齢者の社会参加の促進に向けた支援 充 １８５，０６０千円」の1行で、事業名の後ろに札（新＝新規、充＝拡充、レ＝レベルアップ）を置くことがある。
事業名が長いと額を次の行に送る。見出しの下は説明の文。
"""
from __future__ import annotations

import re

from ingestion.project.layouts.press import PressItem, norm

HEADING = re.compile(r'^\((\d+)\) ?(.+?)(?: (新|充|レ))?(?: ([\d,]+)千円)?$')
AMOUNT_LINE = re.compile(r'^(?:(新|充|レ) )?([\d,]+)千円$')


def read(path) -> list[PressItem]:
    import pdfplumber
    items: list[PressItem] = []
    with pdfplumber.open(path) as pdf:
        for number, page in enumerate(pdf.pages, start=1):
            rows = [norm(line) for line in (page.extract_text() or '').split('\n')]
            page.flush_cache()
            position = 0
            for index, row in enumerate(rows):
                match = HEADING.match(row)
                if not match:
                    continue
                name, tag, amount = match.group(2), match.group(3), match.group(4)
                if amount is None:
                    following = AMOUNT_LINE.match(rows[index + 1]) if index + 1 < len(rows) else None
                    if following is None:
                        continue
                    tag, amount = tag or following.group(1), following.group(2)
                position += 1
                items.append(PressItem(number, name.strip(), [name.strip()], tag == '新', int(amount.replace(',', '')), [], position))
    return items
