"""江東区の予算案の主要事業の資料（1件1頁で、見出し・事業名・予算額・POINT・事業概要を並べた資料）を読む。

R6・R7 は「事業名 〇〇」「予算額 〇万円」の行、R8 は事業名と「予算額」の札と額を1行に並べる（事業名は札の左）。
新規の印は見出しの横の「NEW」。事業名の欄が空の頁は頁の見出しを事業名にする。
"""
from __future__ import annotations

import re

from ingestion.project.layouts.press import PressItem, amount_text, lines, norm, text, words


CIRCLED = re.compile(r'[①-⑳➀-➉]')


def read_page(page, number: int) -> list[PressItem]:
    items = words(page)
    rows = lines(items, tolerance=3)
    budget = next((r for r in rows if '予算額' in text(r)), None)
    if budget is None:
        return []
    label = next(w for w in budget if '予算額' in norm(w['text']))
    # 額を番号で並べるときは札の上下の行に分けて印字する
    raw_amount = ' '.join(w['text'] for row in lines([w for w in items if w['x0'] >= label['x0']
                                                       and abs(w['top'] - label['top']) < 14]) for w in row)
    named = next((w for w in items if norm(w['text']) == '事業名'), None)
    if named is not None:  # 事業名は2行に折り返すと札の上下に分かれて印字する
        region = [w for w in items if named['x1'] < w['x0'] and abs(w['top'] - named['top']) < 14]
    else:
        region = [w for w in items if w['x1'] <= label['x0'] - 5 and label['top'] - 15 < w['top'] < label['top'] + 15]
    raw_names = [' '.join(w['text'] for w in row) for row in lines(region, tolerance=3)]
    if not raw_names:  # 事業名の欄が空（画像）の頁は、頁の見出し（大きな字）を事業名にする
        heading = [w for w in items if w['size'] >= 17 and w['top'] < budget[0]['top']]
        raw_names = [' '.join(w['text'] for w in row) for row in lines(heading)][:1]
    if not raw_names:
        raise ValueError(f'p{number}: 事業名が読めない')
    is_new = any(norm(w['text']) in ('NEW', '新規') and w['top'] < budget[0]['top'] for w in items)
    if all(CIRCLED.match(n) for n in raw_names) and len(raw_names) > 1:  # 「① 〇〇事業」「② 〇〇事業」と額を番号で並べる
        names = [norm(CIRCLED.sub('', n)).replace(' ', '') for n in raw_names]
        amounts = [amount_text(part) for part in CIRCLED.split(raw_amount) if amount_text(part) is not None]
        if len(amounts) == 1:  # 番号を付けた事業名の全体で1つの額
            return [PressItem(number, '・'.join(names), names, is_new, amounts[0], [], 1)]
        if len(amounts) != len(names):
            raise ValueError(f'p{number}: 事業名と予算額の数が合わない')
        return [PressItem(number, n, [n], is_new, a, [], i) for i, (n, a) in enumerate(zip(names, amounts), start=1)]
    amount = amount_text(raw_amount)
    if amount is None:
        return []
    name = ''.join(norm(n).replace(' ', '') for n in raw_names)
    return [PressItem(number, name, [name], is_new, amount, [], 1)]


def read(path) -> list[PressItem]:
    import pdfplumber
    items: list[PressItem] = []
    with pdfplumber.open(path) as pdf:
        for number, page in enumerate(pdf.pages, start=1):
            items.extend(read_page(page, number))
            page.flush_cache()
    return items
