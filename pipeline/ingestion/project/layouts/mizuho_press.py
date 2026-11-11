"""瑞穂町の予算の概要の、長期総合計画のまちの姿ごとの頁を読む。

R7 は頁の見出し（「誰もが健康ですこやかに暮らせるまち(2)」）の下に、説明の箇条（•）と
「新 第5次地域保健福祉計画策定業務委託料 493万9千円」（新規は「新」を付ける）の行を印字する。名前が長いと
金額の無い行に折り返す。R6 は文字の無い画像、R8 は施策の説明の文だけで金額を印字しないので、どちらも0件になる。
"""
from __future__ import annotations

import re

from ingestion.project.layouts.press import PressItem, amount_text, norm

ENTRY = re.compile(r'^(?:(新) )?(.+?) ((?:[\d,]+億)?(?:[\d,]+万)?(?:[\d,]+千)?円)$')
HEADING = re.compile(r'まち(?:\(\d\))?$')


def read(path) -> list[PressItem]:
    import pdfplumber
    items: list[PressItem] = []
    with pdfplumber.open(path) as pdf:
        for number, page in enumerate(pdf.pages, start=1):
            rows = [norm(r) for r in (page.extract_text() or '').split('\n')]
            page.flush_cache()
            if not rows or not HEADING.search(rows[0]):
                continue
            position = 0
            pending = ''
            for row in rows[1:]:
                entry = ENTRY.match(row)
                if entry and amount_text(entry.group(3)) is not None:
                    new = entry.group(1) == '新' or pending.startswith('新 ')
                    if pending.startswith('新 '):  # 名前の途中で折り返した行
                        name = pending[2:] + entry.group(2)
                    elif pending:  # 名前の行と、括弧の補足と金額の行
                        name = f'{pending} {entry.group(2)}'
                    else:
                        name = entry.group(2)
                    position += 1
                    items.append(PressItem(number, name, [name], new, amount_text(entry.group(3)), [], position))
                    pending = ''
                elif row.startswith('•') or row.endswith('。') or re.fullmatch(r'\d+', row):
                    pending = ''
                else:
                    pending = row
    return items
