"""多摩市の予算の概要の「新規・レベルアップや普通建設事業などの概要」を読む。

表の欄は「事業 事業費 所管課 事業の概要 予算編成方針該当項目」で、行は横の罫線で区切る。事業費は「16百万」と
百万円単位で端数を切り上げて印字するので、千円にした値も切り上げた額になる（括弧の中は新規などの部分の額で読まない）。
所管課の欄の下に「（新規項目）（レベルアップ）（普通建設）」や「【新規事業】」の区分を印字する。
R8 の重点施策の分冊は同じ表が無いので読まない。
"""
from __future__ import annotations

import re

from ingestion.project.layouts.press import PressItem, norm

AMOUNT = re.compile(r'^([\d,]+(?:\.\d+)?)百万$')


def _bands(page) -> list[tuple[float, float]]:
    tops = sorted({round(e['top']) for e in page.horizontal_edges if e['x1'] - e['x0'] > 400})
    merged: list[int] = []
    for top in tops:
        if not merged or top - merged[-1] > 3:
            merged.append(top)
    return list(zip(merged, merged[1:]))


def read(path) -> list[PressItem]:
    import pdfplumber
    items: list[PressItem] = []
    with pdfplumber.open(path) as pdf:
        for number, page in enumerate(pdf.pages, start=1):
            words = page.extract_words()
            header = {w['text']: w for w in sorted(words, key=lambda w: w['top']) if w['text'] in ('事業費', '所管課', '事業の概要')}
            if len(header) < 3:
                page.flush_cache()
                continue
            amount_x0 = header['事業費']['x0'] - 8
            office_x0 = header['所管課']['x0'] - 16
            summary_x0 = 264
            position = 0
            for top, bottom in _bands(page):
                if top < header['事業費']['top']:  # 凡例の頁は見方の例の行を表の見出しより上に印字する
                    continue
                inside = sorted((w for w in words if top < (w['top'] + w['bottom']) / 2 < bottom),
                                key=lambda w: (round(w['top']), w['x0']))
                amounts = [w for w in inside if amount_x0 <= w['x0'] < office_x0 and AMOUNT.match(norm(w['text']))]
                name = ''.join(norm(w['text']) for w in inside if w['x0'] < amount_x0)
                if not amounts or not name:
                    continue
                office = ''.join(norm(w['text']) for w in inside if office_x0 <= w['x0'] < summary_x0)
                summary = ''.join(norm(w['text']) for w in inside if summary_x0 <= w['x0'] < 500)
                position += 1
                value = float(AMOUNT.match(norm(amounts[0]['text'])).group(1).replace(',', ''))
                items.append(PressItem(number, name, [name], '新規事業' in office, round(value * 1000),
                                       [summary] if summary else [], position))
            page.flush_cache()
    return items
