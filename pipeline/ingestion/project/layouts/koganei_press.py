"""小金井市の予算の概要を読む。

「10 主な事業」（R6・R7 は「9 主な事業」）の節に、事業ごとに「○ 井戸水等水質検査委託料」の見出しと、説明の右に「事 業 費 703千円」を印字する。
見出しの後の最初の事業費を予算額にする。「11 財政用語」の節からは読まない。
"""
from __future__ import annotations

import re

from ingestion.project.layouts.press import PressItem, norm

HEADING = re.compile(r'^○ ?(.+)$')
COST = re.compile(r'事 ?業 ?費 ([\d,]+)千円')


def read(path) -> list[PressItem]:
    import pdfplumber
    items: list[PressItem] = []
    inside = False
    with pdfplumber.open(path) as pdf:
        for number, page in enumerate(pdf.pages, start=1):
            rows = [norm(r) for r in (page.extract_text() or '').split('\n')]
            page.flush_cache()
            if rows and re.match(r'^\d+ ?\d* 主な事業$', rows[0]):
                inside = True
            if rows and re.match(r'^\d+ ?\d* 財政用語', rows[0]):
                break
            if not inside:
                continue
            current: PressItem | None = None
            position = 0
            for row in rows:
                heading = HEADING.match(row)
                if heading:
                    position += 1
                    current = PressItem(number, heading.group(1).strip(), [heading.group(1).strip()], False, None, [], position)
                    items.append(current)
                    continue
                cost = COST.search(row)
                if cost and current is not None and current.budget_thousand is None:
                    current.budget_thousand = int(cost.group(1).replace(',', ''))
    return items
