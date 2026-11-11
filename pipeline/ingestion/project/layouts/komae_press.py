"""狛江市の予算概要の「主要事業」を読む。

事業ごとの枠に「拡充 多摩川利活用推進 担当課 環境政策課」（札は新規・拡充、無いこともある）と、
「区分 事業費 一般財源 特定財源」の下の「Ｒ６年度 4,827 4,827 0」を印字する。今年度の行の最初の数を事業費（千円）にする。
事業名の欄が「-」の枠（複数の事業をまとめた枠）は名前が無いので読まない。名前が「予算科目」の行と
次の「- - -」の行に分かれた枠（「新規 担当課 …」）は2行をつなぐ。「(再掲)」の枠は他の枠の再掲、「(歳入)」の枠は歳入なので読まない。
事業費が「-」（特別会計などで金額を載せない枠）は金額なしにする。
"""
from __future__ import annotations

import re

from ingestion.project.layouts.press import PressItem, norm

HEADING = re.compile(r'^(?:(新規|拡充|見直し) ?)?(.*?) ?担当課(?: .*)?$')
SPLIT_HEAD = re.compile(r'^予算科目 (.+)$')
SPLIT_TAIL = re.compile(r'^[-‐ー] [-‐ー] [-‐ー] (.+)$')
COST = re.compile(r'^R ?\d+年度 ([\d,]+|-)')


def read(path) -> list[PressItem]:
    import pdfplumber
    items: list[PressItem] = []
    with pdfplumber.open(path) as pdf:
        for number, page in enumerate(pdf.pages, start=1):
            rows = [norm(r) for r in (page.extract_text() or '').split('\n')]
            page.flush_cache()
            position = 0
            current: PressItem | None = None
            for index, row in enumerate(rows):
                heading = HEADING.match(row)
                if heading and not row.startswith('予算科目'):
                    name = heading.group(2).strip()
                    current = None
                    if not name:
                        head = SPLIT_HEAD.match(rows[index - 1]) if index else None
                        tail = SPLIT_TAIL.match(rows[index + 1]) if index + 1 < len(rows) else None
                        name = (head[1] if head else '') + (tail[1] if tail else '')
                    if not name or name in ('-', '‐', 'ー') or '再掲' in name or name.startswith('(歳入)'):
                        continue
                    position += 1
                    current = PressItem(number, name, [name], heading.group(1) == '新規', None, [], position)
                    items.append(current)
                    continue
                cost = COST.match(row)
                if cost and current is not None and current.budget_thousand is None and cost.group(1) != '-':
                    current.budget_thousand = int(cost.group(1).replace(',', ''))
    return items
