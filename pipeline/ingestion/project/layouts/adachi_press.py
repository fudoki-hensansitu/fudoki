"""足立区の予算（案）の概要のうち「主要事業」の頁（1事業1頁。頁の上に「事業名：〇〇 予算額 233,454 千円 《229,671》」）を読む。

事業名は「事業名：」の右に置き、長いと上下2行に分ける（「多様な学びの支援（不登校支援・特別支援教育・」「日本語指導）」）。
予算額の数は「予算額」「千円」の行より少し上に印字する。《》の中は前年度の額なので読まない。
主要施策の頁（絵や図で説明する頁）と新規・拡充事業の一覧表は読まない。
"""
from __future__ import annotations

import re

from ingestion.project.layouts.press import PressItem, lines, norm, text, words


def read_page(page, number: int) -> PressItem | None:
    items = words(page)
    labels = [w for w in items if norm(w['text']).startswith('事業名:')]
    budgets = [w for w in items if norm(w['text']) == '予算額']
    if not labels or not budgets:
        return None
    label = labels[0]
    budget = min(budgets, key=lambda w: abs(w['top'] - label['top']))
    if abs(budget['top'] - label['top']) > 6:
        return None
    head = re.sub(r'^事業名:', '', norm(label['text']))
    around = [w for w in items if w is not label and w['x0'] >= label['x0'] - 2 and w['x1'] <= budget['x0'] - 5
              and abs(w['top'] - label['top']) <= 10]
    rows = lines(around + ([dict(label, text=head)] if head else []), tolerance=3)
    name = re.sub(r'^\d(?=\D)', '', ''.join(text(r) for r in rows))
    if not name:
        raise ValueError(f'p{number}: 事業名が読めない')
    numbers = [w for w in items if w['x0'] > budget['x1'] and budget['top'] - 12 <= w['top'] <= budget['top'] + 2
               and re.fullmatch(r'[\d,]+', norm(w['text']))]
    amount = int(norm(numbers[0]['text']).replace(',', '')) if numbers else None
    return PressItem(number, name, [name], False, amount, [], 1)


def read(path) -> list[PressItem]:
    import pdfplumber
    items: list[PressItem] = []
    with pdfplumber.open(path) as pdf:
        for number, page in enumerate(pdf.pages, start=1):
            item = read_page(page, number)
            page.flush_cache()
            if item is not None:
                items.append(item)
    return items
