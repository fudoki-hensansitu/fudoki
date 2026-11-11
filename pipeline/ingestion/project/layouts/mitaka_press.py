"""三鷹市の施政方針・予算概要（記者発表の添付資料）を読む。

取組は頁の頭の「当初予算」「施政方針P.122 当初予算」などの欄の次の行の「3 三鷹駅前地区再開発の推進」で始まり、
「3 経費（当初予算計上額）」「(4) 経費（当初予算計上額）」の下に「【歳出】三鷹駅前地区再開発事業運営費 30,240千円」と
歳出の事業と額を並べる（1つの取組に経費の欄が複数あることもあり、取組が次の頁へ続くこともある）。
取組1件を施策1件にし、歳出の事業名を names、額の和を予算額にする。経費の欄の無い取組（議案だけのもの、
「(経費:25,000千円)」と本文に書くだけのもの）は読まない。
"""
from __future__ import annotations

import re

from ingestion.project.layouts.press import PressItem, norm

BAND = re.compile(r'(当初予算|議案関係|^施政方針)')
HEADING = re.compile(r'^\d+ (\S.*?)\|?$')
COST = re.compile(r'^(?:\d+|\(\d+\)) 経費')
LINE = re.compile(r'^(?:【歳出】)?(.*?) ?([\d,]+)千円$')
BLOCK_END = re.compile(r'^(【歳入】|【担 ?当】|【債務負担行為】|\d+ |\(\d+\) )')


def read(path) -> list[PressItem]:
    import pdfplumber
    items: list[PressItem] = []
    current: dict | None = None

    def close():
        if current and current['names']:
            items.append(PressItem(current['page'], current['title'], current['names'], False, current['total'], [], 1))

    with pdfplumber.open(path) as pdf:
        for number, page in enumerate(pdf.pages, start=1):
            rows = [norm(r) for r in (page.extract_text() or '').split('\n')]
            page.flush_cache()
            if len(rows) > 1 and BAND.search(rows[0]) and HEADING.match(rows[1]) and not COST.match(rows[1]):
                close()
                title = HEADING.match(rows[1]).group(1).split('|')[0]
                if len(rows) > 2 and 0 < len(rows[2]) <= 30 and '。' not in rows[2] and not re.match(r'^(\d+ |~|\(|\|)', rows[2]):
                    title += rows[2]
                current = {'title': title, 'names': [], 'total': 0, 'page': None}
            if current is None:
                continue
            spending = False
            in_cost = False
            for row in rows:
                if COST.match(row):
                    in_cost, spending = True, False
                    continue
                if not in_cost:
                    continue
                if row.startswith('【歳出】'):
                    spending = True
                elif BLOCK_END.match(row):
                    in_cost = spending = False
                    continue
                found = LINE.match(row)
                if spending and found and not row.startswith(('(', '※')):
                    name = re.sub(r'\(※\)$', '', found.group(1)).strip()
                    if name not in current['names']:
                        current['names'].append(name)
                    current['total'] += int(found.group(2).replace(',', ''))
                    current['page'] = current['page'] or number
    close()
    return items
