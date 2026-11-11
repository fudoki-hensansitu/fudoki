"""大島町の予算資料の「事業等一覧表」を読む。

款の区分（総・衛・農 など）ごとに「1庁舎大規模改修事業」（番号と名前の間に空白が無い。長いと次の行に続く）、
「(改修計画策定委託)」の説明、「13,068 13,068 13,068」（事業費・財源内訳）の数の行を印字する。数の行の最初を事業費（千円）にする。
"""
from __future__ import annotations

import re

from ingestion.project.layouts.press import PressItem, norm

START = re.compile(r'^\d+\.事業等一覧表')
ENTRY = re.compile(r'^(?:\S )?(\d{1,2})([^\d\s(.,].*)$')
NUMBERS = re.compile(r'^([\d,]+)(?: [\d,]+)*$')
SUBTOTAL = re.compile(r'^小 ?計')


def read(path) -> list[PressItem]:
    import pdfplumber
    items: list[PressItem] = []
    inside = False
    with pdfplumber.open(path) as pdf:
        for number, page in enumerate(pdf.pages, start=1):
            rows = [norm(r) for r in (page.extract_text() or '').split('\n')]
            page.flush_cache()
            if not inside and not any(START.match(r) for r in rows):
                continue
            inside = True
            position = 0
            current: PressItem | None = None
            for row in rows:
                if SUBTOTAL.match(row):
                    current = None
                    continue
                entry = ENTRY.match(row)
                if entry and (current is None or current.budget_thousand is not None):
                    position += 1
                    current = PressItem(number, entry.group(2), [], False, None, [], position)
                    items.append(current)
                    continue
                if current is None:
                    continue
                numbers = NUMBERS.match(row)
                if numbers:
                    if current.budget_thousand is None:
                        current.budget_thousand = int(numbers.group(1).replace(',', ''))
                    continue
                if row.startswith('(') or (current.points and current.points[-1].count('(') > current.points[-1].count(')')):
                    current.points = [(current.points[0] if current.points else '') + re.sub(r' [\d,]+$', '', row)]
                elif current.budget_thousand is None:
                    current.title += row
    for item in items:
        if item.title.count('(') > item.title.count(')'):  # 名前に続けて説明の括弧を書き始めた行
            head, _, rest = item.title.partition('(')
            item.title, item.points = head, [rest + ''.join(item.points)]
        item.names = [item.title]
        item.points = [p.strip('()') for p in item.points]
    return items
