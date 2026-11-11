"""新宿区の区長定例記者会見資料（予算案の主な事業を1件1頁で説明した資料）を読む。R6・R7 は1件1つの PDF。

予算額は「令和〇年度予算額 〇千円」（前年度予算額とは別の行）。事業名は、R6・R7 は「事業名」の欄、R8 は頁の左上の大きな字（19pt 以上、右の札「新規」「継続」「拡充」を除く）。
新規の印は予算額の近くに「（新規）」（R6・R7）または「新規」（R8）と印字する。
"""
from __future__ import annotations

import re

from ingestion.project.layouts.press import PressItem, lines, norm, text, words

BUDGET = re.compile(r'(?<!前)年度予算額([\d,]+)千円')


def read_page(page, number: int) -> list[PressItem]:
    items = words(page)
    rows = lines(items, tolerance=3)
    out: list[PressItem] = []
    for row in rows:
        joined = text(row)
        match = BUDGET.search(joined)
        if not match or '前年度' in joined.split('年度予算額')[0][-3:]:
            continue
        top = row[0]['top']
        label_row = next((r for r in rows if text(r).startswith('事業名')), None)
        if label_row is not None:
            label = next(w for w in label_row if norm(w['text']).endswith('名'))  # A3 横の頁は右半分に説明を印字するので、事業名の欄の右の端（頁の半分）までを読む
            limit = page.width / 2 if page.width > page.height else page.width
            # 事業名は欄の高さに収まるよう2行に折り返すことがあるので、ラベルの上下 12pt と予算額の行の手前までを読む
            bottom = min(top - 3, label['top'] + 14) if top > label['top'] else label['top'] + 14
            name = ''.join(text(r) for r in lines([w for w in items if label['top'] - 12 < w['top'] < bottom
                                                     and label['x1'] < w['x0'] < limit]))
        else:
            big = [w for w in items if w['size'] >= 19 and w['top'] < top + 30 and w['x1'] < page.width * 0.7
                   and norm(w['text']) not in ('新規', '継続', '拡充')]
            name = ''.join(text(r) for r in lines(big))
        near = [w for w in items if abs(w['top'] - top) < 30 and norm(w['text']).strip('()（）') == '新規']
        if not name:
            raise ValueError(f'p{number}: 事業名が読めない')
        out.append(PressItem(number, name, [name], bool(near), int(match.group(1).replace(',', '')), [], len(out) + 1))
    return out


def read(path) -> list[PressItem]:
    import pdfplumber
    items: list[PressItem] = []
    with pdfplumber.open(path) as pdf:
        for number, page in enumerate(pdf.pages, start=1):
            items.extend(read_page(page, number))
            page.flush_cache()
    return items
