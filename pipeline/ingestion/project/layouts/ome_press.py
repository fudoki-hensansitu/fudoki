"""青梅市の当初予算（案）の概要を読む。

「4 一般会計予算のポイント」の頁に事業を1行ずつ「★【新】こども会議等の実施 240 千円 （民生費）」と並べる。
【新】は新規、【拡】拡充、【投】投資的、【継】継続。額が次の行に回ることや（「※ 49,771 千円 （衛生費）」）、
事業名が額の後の行へ続くことがある（括弧書きの行は注記なので名前に入れない）。「収益事業」の節で終わる。
"""
from __future__ import annotations

import re

from ingestion.project.layouts.press import PressItem, norm

ENTRY = re.compile(r'^★?【(新|拡|投|継)】 ?(.+?)(?: ?[☆※])?(?: ([\d,]+) ?千円 ?\(.+\))?$')
AMOUNT = re.compile(r'^(?:[☆※] )?([\d,]+) ?千円 ?\(.+\)$')
OTHER = re.compile(r'^([ア-ン] |◆|\*|\(|\(\d|★|【|- \d+ -$|\d+$)')


def read(path) -> list[PressItem]:
    import pdfplumber
    items: list[PressItem] = []
    inside = False
    with pdfplumber.open(path) as pdf:
        for number, page in enumerate(pdf.pages, start=1):
            rows = [norm(r) for r in (page.extract_text() or '').split('\n')]
            page.flush_cache()
            last: PressItem | None = None
            position = 0
            for row in rows:
                if '一般会計予算のポイント' in row and not row.endswith(tuple('0123456789')):
                    inside = True
                    continue
                if not inside:
                    continue
                if '収益事業から' in row or re.match(r'^5 主な使用料', row):
                    inside = False
                    break
                entry = ENTRY.match(row)
                if entry and not row.startswith('【新】新規事業'):
                    position += 1
                    amount = int(entry.group(3).replace(',', '')) if entry.group(3) else None
                    last = PressItem(number, entry.group(2).strip(), [entry.group(2).strip()], entry.group(1) == '新',
                                     amount, [], position)
                    items.append(last)
                    continue
                if last is None:
                    continue
                found = AMOUNT.match(row)
                if found and last.budget_thousand is None:
                    last.budget_thousand = int(found.group(1).replace(',', ''))
                elif not OTHER.match(row) and '千円' not in row and last.budget_thousand is not None:
                    last.title += row
                    last.names = [last.title]
                else:
                    last = None if found or OTHER.match(row) and not row.startswith('(') else last
    return items
