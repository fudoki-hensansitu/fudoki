"""台東区の予算案の主要事業の資料（1件1頁で、事業名・予算額・ここがPOINT・事業概要を並べた資料）を読む。

「事業名」の欄に事業名を1行に1つ印字する（複数のことがある。先頭の数字は資料の通し番号）。括弧で始まる行は前の事業名の続き。
予算額は「予算額」の右に「１億4,270万円」「3,003 万円」「16 ３,６９４ 億 万円」（億と万の数を別に印字）のように印字する。
「（うち該当経費）」は予算額の内数なので読まない。予算額が「ー」の事業（使用料の無料化など）と、債務負担行為だけを印字した事業は予算額を持たない。新規の印は事業名の末尾の【新規】。
"""
from __future__ import annotations

import re

from ingestion.project.layouts.press import BboxPdf, PressItem, lines, norm, text, words

SERIAL = re.compile(r'^\d+\s*')
NEW = '【新規】'
AMOUNTS = (
    (re.compile(r'^([\d,]+)\s*億\s*([\d,]+)\s*万円'), lambda m: int(m[1].replace(',', '')) * 100_000 + int(m[2].replace(',', '')) * 10),
    (re.compile(r'^([\d,]+)\s+([\d,]+)\s*億\s*万円'), lambda m: int(m[1].replace(',', '')) * 100_000 + int(m[2].replace(',', '')) * 10),
    (re.compile(r'^([\d,]+)\s*億円'), lambda m: int(m[1].replace(',', '')) * 100_000),
    (re.compile(r'^([\d,]+)\s*万円'), lambda m: int(m[1].replace(',', '')) * 10),
)


def _amount(row_text: str) -> int | None:
    row_text = re.sub(r'^【[^】]*】\s*', '', row_text)  # 「【千束】１４ ３，２５２ 億 万円」の地区名
    for pattern, value in AMOUNTS:
        match = pattern.match(row_text)
        if match:
            return value(match)
    return None


def read_page(page, number: int) -> list[PressItem]:
    items = words(page)
    rows = lines(items, tolerance=3)
    label_row = next((r for r in rows if text(r).startswith('事業名')), None)
    budget_row = next((r for r in rows if text(r).startswith('予算額')), None)
    if label_row is None or budget_row is None:
        return []
    label_x1 = max(w['x1'] for w in label_row if norm(w['text']) in ('事', '業', '名', '事業名'))
    budget_label = [w for w in budget_row if norm(w['text']) in ('予', '算', '額', '予算額', '予算額')]
    budget_x1 = max(w['x1'] for w in budget_label) if budget_label else budget_row[0]['x1']
    # 予算額の数は「予算額」の札と同じ高さか少し上下に印字する（億と万の単位は小さい字で少し下）
    near = [w for w in items if abs(w['top'] - budget_row[0]['top']) < 9 and w['x0'] > budget_x1 - 2
            and not re.search('債務|負担行為|令和|年度', norm(w['text']))]
    amount = _amount(text(sorted(near, key=lambda w: w['x0']), ' ').removeprefix('予算額').strip())
    if amount is None:  # 債務負担行為を併記する頁は、予算額の数を札の上に印字する
        above = [w for w in items if budget_row[0]['top'] - 30 < w['top'] < budget_row[0]['top'] - 3
                 and w['x0'] > budget_x1 - 2 and not re.search('債務|負担行為|令和|年度', norm(w['text']))]
        amount = _amount(text(sorted(above, key=lambda w: w['x0']), ' '))
    debt = any('債務負担行為' in norm(w['text']) for w in items)
    if amount is None and (text(near) in ('ー', '-', '―') or (not near and debt)):
        pass  # 予算額の無い事業（使用料の無料化、債務負担行為だけの事業）
    elif amount is None:
        raise ValueError(f'p{number}: 予算額が読めない: {text(budget_row, " ")}')
    names: list[str] = []
    region = [w for w in items if label_row[0]['top'] - 40 < w['top'] < budget_row[0]['top'] - 8
              and w['x0'] > label_x1 + 5 and w['size'] >= 12]
    for row in lines(region, tolerance=3):
        value = SERIAL.sub('', text(row))
        if names and value.startswith('('):
            names[-1] += value
        elif value:
            names.append(value)
    if not names:
        raise ValueError(f'p{number}: 事業名が読めない')
    is_new = any(NEW in n for n in names)
    names = [n.replace(NEW, '') for n in names]
    return [PressItem(number, '・'.join(names), names, is_new, amount, [], 1)]


def read(path) -> list[PressItem]:
    items: list[PressItem] = []
    with BboxPdf(path) as pdf:
        for number, page in enumerate(pdf.pages, start=1):
            items.extend(read_page(page, number))
            page.flush_cache()
    return items
