"""国分寺市の記者会見資料「政策的経費の内容」を読む。

都市像ごとの表に、番号・施策・実行計画の印（◎）・区分（新…新規、継…継続、レ…レベルアップ）・事業名・所管課・
事業費（千円）・財源内訳・事業の内容を1行1件で並べる。所管課の欄（「…課」）の前の欄を事業名、後の最初の数を事業費にする。
「主な取組」の冊（文章の頁）は額を持たないので、表の無い頁は読まない。
"""
from __future__ import annotations

import re

from ingestion.project.layouts.press import PressItem, norm

TAGS = ('新', '継', 'レ')


def _clean(cell) -> str:
    return norm(cell or '').replace('\n', '')


def read(path) -> list[PressItem]:
    import pdfplumber
    items: list[PressItem] = []
    with pdfplumber.open(path) as pdf:
        for number, page in enumerate(pdf.pages, start=1):
            position = 0
            for table in page.extract_tables():
                for row in table:
                    cells = [_clean(c) for c in row]
                    if not cells or not re.fullmatch(r'\d+', cells[0]):
                        continue
                    tag = next((i for i, c in enumerate(cells) if c in TAGS), None)
                    office = next((i for i, c in enumerate(cells) if i > (tag or 0) + 1 and re.search(r'課$|室$|局$', c)), None)
                    if tag is None or office is None:
                        continue
                    amount = next((c for c in cells[office + 1:] if re.fullmatch(r'[\d,]+', c)), None)
                    name = cells[office - 1]
                    if not name or amount is None:
                        continue
                    position += 1
                    items.append(PressItem(number, name, [name], cells[tag] == '新',
                                           int(amount.replace(',', '')), [], position))
            page.flush_cache()
    return items
