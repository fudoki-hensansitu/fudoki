"""板橋区の当初予算案の概要（区長のいち押し事業・重点戦略の見開き）を読む。

事業ごとに見開き（R8 は横長の1頁）で、大きな字（22pt 以上）の見出しに事業名を置き、「予算」の欄に額を書く。
「予算」の欄の書き方は2通り:
- 1行目に額だけ（「22,462千円」）を置き、下に小さな字で内訳を並べる。見出しを名前にした1件にし、内訳の名前を names に並べる。
- 「⑴新たなあいキッズの展開と居場所づくりの推進 780,999千円」「高島平地域のまちづくり 155,303千円」のように名前と額の行を並べる。行ごとに1件にする。
欄の右の「主管課・問い合わせ先」の欄は読まない。新規の印は無い。
"""
from __future__ import annotations

import re

from ingestion.project.layouts.press import PressItem, amount_text, lines, norm, text, words

YEN = re.compile(r'[\d,]+千円')


def _heading(items) -> str:
    big = [w for w in items if w['size'] >= 22 and w['top'] < 140]
    rows = lines(big, tolerance=4)
    # 一番大きな字の行（戦略名の帯より大きい）を見出しにする
    if not rows:
        return ''
    best = max(rows, key=lambda r: max(w['size'] for w in r))
    return re.sub(r'\s', '', text(best)).lstrip('0123456789.．★')


def read_page(items, previous, number: int) -> list[PressItem]:
    labels = [w for w in items if norm(w['text']) == '予算' and w['size'] >= 11]
    out: list[PressItem] = []
    for label in labels:
        desk = [w for w in items if norm(w['text']).startswith('主') and w['x0'] > label['x1'] and abs(w['top'] - label['top']) <= 6]
        right = desk[0]['x0'] - 5 if desk else label['x0'] + 480
        region = [w for w in items if label['top'] + 4 < w['top'] < label['top'] + 140
                  and label['x0'] - 30 <= w['x0'] and w['x1'] <= right]
        rows = [r for r in lines(region, tolerance=4) if YEN.search(text(r))]
        if not rows:
            continue
        first = text(rows[0])
        if YEN.fullmatch(first):
            title = _heading(items) or _heading(previous)
            parts = [re.sub(r'^[⑴-⒇]|^\(\d+\)', '', YEN.sub('', text(r))).strip() for r in rows[1:]]
            names = [p for p in parts if p] or [title]
            out.append(PressItem(number, title, names, False, amount_text(first), [], len(out) + 1))
            continue
        for row in rows:
            joined = text(row)
            name = re.sub(r'^[⑴-⒇]|^\(\d+\)', '', YEN.sub('', joined)).strip()
            if not name:
                continue
            out.append(PressItem(number, name, [name], False, amount_text(joined), [], len(out) + 1))
    return out


def read(path) -> list[PressItem]:
    import pdfplumber
    items: list[PressItem] = []
    previous: list[dict] = []
    with pdfplumber.open(path) as pdf:
        for number, page in enumerate(pdf.pages, start=1):
            current = words(page)
            items.extend(read_page(current, previous, number))
            previous = current
            page.flush_cache()
    return items
