"""東村山市の予算概要の「予算事業のポイント」を読む。

事業ごとに「新 出産・子育て応援事業 （予算額：1億441万円）＜子ども保健・給付課＞」と印字する（R8 は「事業費：」）
（名前が長いと前の行に名前、次の行に「（予算額：…）」）。「新」は新規の印。
「見直しを行う事業」の「参考：令和元年度予算額」は予算額の印字ではないので読まない。
"""
from __future__ import annotations

import re

from ingestion.project.layouts.press import PressItem, amount_text, norm

BUDGET = re.compile(r'^(.*?)\((?:予算額|事業費): ?(.+?)(?:\)|$)')
NEW = re.compile(r'^新 ?')


def read(path) -> list[PressItem]:
    import pdfplumber
    items: list[PressItem] = []
    with pdfplumber.open(path) as pdf:
        for number, page in enumerate(pdf.pages, start=1):
            rows = [norm(r) for r in (page.extract_text() or '').split('\n')]
            page.flush_cache()
            position = 0
            for index, row in enumerate(rows):
                found = BUDGET.match(row)
                if not found:
                    continue
                name = found.group(1).strip()
                if not name and index > 0:
                    name = rows[index - 1]
                is_new = bool(NEW.match(name))
                name = NEW.sub('', name).strip()
                position += 1
                amount = amount_text(re.sub(r'([万千])$', r'\1円', found.group(2).strip()))  # 「2 億 1,318 万」と円を落とした印字
                if amount is None and index + 1 < len(rows):  # 額が次の行へ回った
                    amount = amount_text(found.group(2) + rows[index + 1])
                items.append(PressItem(number, name, [name], is_new, amount, [], position))
    return items
