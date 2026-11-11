"""町田市の予算概要説明書（記者会見用）を読む。

「2026年度予算において重点的に取り組む事業」の各頁は「件 名 子どもにやさしいまちづくり事業」で始まり、
「財源内訳」の次の行の最初の数が予算額（千円）。一般会計と特別会計に分けて「一般会計：2,321,812」と書く件は和にする。
「件 名」で始まっても予算額の欄の無い頁は前の件の続き。件名が「~…~」の副題だけのときは、前の行が事業名。
新規の印は一覧の頁（「新規 子どもにやさしいまちづくり事業 731万円 （30ページ）」）にあるので、名前で引く。
"""
from __future__ import annotations

import re

from ingestion.project.layouts.press import PressItem, norm

SUBJECT = re.compile(r'^件 ?名 (.+)$')
LISTED = re.compile(r'^(新規|拡充) (.+?) [\d,億万]+円')


def read(path) -> list[PressItem]:
    import pdfplumber
    items: list[PressItem] = []
    new: set[str] = set()
    with pdfplumber.open(path) as pdf:
        for number, page in enumerate(pdf.pages, start=1):
            rows = [norm(r) for r in (page.extract_text() or '').split('\n')]
            page.flush_cache()
            for row in rows:
                listed = LISTED.match(row)
                if listed and listed.group(1) == '新規':
                    new.add(listed.group(2).replace(' ', ''))
            index = next((i for i, r in enumerate(rows[:4]) if SUBJECT.match(r)), None)
            if index is None:
                continue
            name = SUBJECT.match(rows[index]).group(1)
            if name.startswith('~') and index > 0:
                name = rows[index - 1]
            if not any(r.startswith('予算額') for r in rows[index:index + 4]):
                continue  # 前の件の続きの頁
            amount = None
            accounts = [re.match(r'^(?:一般|特別|国保|後期)会計 ?: ?([\d,]+)', r) for r in rows[index:index + 6]]
            if any(accounts):
                amount = sum(int(m.group(1).replace(',', '')) for m in accounts if m)
            for at, row in enumerate(rows[index:index + 6] if amount is None else []):
                if row.startswith('財源内訳') and index + at + 1 < len(rows):
                    first = re.match(r'^([\d,]+)', rows[index + at + 1])
                    amount = int(first.group(1).replace(',', '')) if first else None
                    break
            items.append(PressItem(number, name, [name], name.replace(' ', '') in new, amount, [], 1))
    return items
