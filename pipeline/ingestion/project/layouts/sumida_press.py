"""墨田区の予算案の主な事業の資料（1件1頁で、見出し・事業名・予算額・問合せ・目的・主な事業内容を並べた資料）を読む。

頁の上に「予算額」の札があり、その下（右）に予算額（「23,108千円」「1,413 万円」）、札の左に大きな字（26pt）の事業名を印字する。
新規の印は予算額の札の右。R6 は「（新規）」、R7 は「（新規・拡充）」と両方を印字して当てはまる方を色字にし、
R8 は当てはまる札（新規・拡充）だけを色の箱で印字する。R7 は「新」の字の色が黒でなければ新規とする。
"""
from __future__ import annotations

import re

from ingestion.project.layouts.press import PressItem, lines, norm, text, words

AMOUNT = re.compile(r'([\d,]+)(千円|万円)')
BLACK = ((0,), (0.0,), (0, 0, 0), (0.0, 0.0, 0.0), (0, 0, 0, 1), (0.0, 0.0, 0.0, 1.0))


def read_page(page, number: int) -> list[PressItem]:
    items = words(page)
    label = next((w for w in items if norm(w['text']) in ('予算額',) and w['top'] < 80), None)
    if label is None:
        label = next((w for w in items if norm(w['text']).endswith('予算額') and w['top'] < 80), None)
    if label is None:
        return []
    contact = next((w['x0'] for w in items if norm(w['text']) == '問合せ' and w['top'] < 80), page.width)
    near = sorted((w for w in items if label['top'] - 5 < w['top'] < label['top'] + 50 and w['x0'] > label['x0'] - 20
                   and w['size'] >= 16 and w['x1'] < contact - 5), key=lambda w: (w['top'], w['x0']))
    match = AMOUNT.search(text(near))
    if not match:
        raise ValueError(f'p{number}: 予算額が読めない')
    value = int(match.group(1).replace(',', ''))
    amount = value if match.group(2) == '千円' else value * 10
    big = [w for w in items if w['size'] >= 20 and w['x1'] < label['x0'] and w['top'] < label['top'] + 70]
    name = ''.join(text(r) for r in lines(big, tolerance=6))
    if not name:
        raise ValueError(f'p{number}: 事業名が読めない')
    tag_chars = [c for c in page.chars if c['top'] < label['top'] + 15 and c['x0'] > label['x1'] and c['text'] in '新規拡充・']
    tag = ''.join(c['text'] for c in tag_chars)
    if '・' in tag:
        is_new = any(c['text'] == '新' and tuple(c['non_stroking_color'] or (0,)) not in BLACK for c in tag_chars)
    else:
        is_new = '新規' in tag
    return [PressItem(number, name, [name], is_new, amount, [], 1)]


def read(path) -> list[PressItem]:
    import pdfplumber
    items: list[PressItem] = []
    with pdfplumber.open(path) as pdf:
        for number, page in enumerate(pdf.pages, start=1):
            items.extend(read_page(page, number))
            page.flush_cache()
    return items
