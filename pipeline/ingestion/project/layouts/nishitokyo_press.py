"""西東京市の記者会見資料（予算案の分冊）を読む。

施策ごとに「1 ベビーシッター利用支援事業の実施」の見出し、説明の文、「(2)予算額(案) 5,198万円」を印字し、
「【問い合わせ先】」で終わる。見出しの番号は資料の中で1つずつ増えるので、続かない番号の行（施策の中の箇条書きや
「8 月から」のように数で始まる折り返し）は見出しにしない。予算額は複数の事業や内訳に分けて次の行に続けることがあるので、
最初の「予算額」の行から「【問い合わせ先】」までの金額を足す（「1憶」の誤字は億に読む）。予算額の無い施策は金額なしにする。
"""
from __future__ import annotations

import re

from ingestion.project.layouts.press import PressItem, amount_text, norm

ENTRY = re.compile(r'^(\d{1,2}) (?!(?:月|時|日|年|歳|校|人|件)(?:から|まで|頃|~|の|に|間|、| )|[\d,])(\S.*)$')
BUDGET = re.compile(r'予算額')
END = re.compile(r'^【問い合わせ先】')
SUB = re.compile(r'^\(\d+\)')


def read(path) -> list[PressItem]:
    import pdfplumber
    items: list[PressItem] = []
    last = 0
    with pdfplumber.open(path) as pdf:
        for number, page in enumerate(pdf.pages, start=1):
            rows = [norm(r).replace('憶', '億') for r in (page.extract_text() or '').split('\n')]
            page.flush_cache()
            position = 0
            current: PressItem | None = None
            state = None  # summary → body → budget
            for row in rows:
                entry = ENTRY.match(row)
                # 見出しの番号は資料の中で1つずつ増える。施策の中の箇条書きの「1 …」は見出しにしない
                if entry and (int(entry.group(1)) == last + 1 or (int(entry.group(1)) == 1 and current is None)):
                    last = int(entry.group(1))
                    position += 1
                    current = PressItem(number, entry.group(2), [entry.group(2)], False, None, [], position)
                    items.append(current)
                    state = 'summary'
                    continue
                if current is None:
                    continue
                if END.match(row):
                    current, state = None, None
                    continue
                if BUDGET.search(row):
                    state = 'budget'
                if state == 'budget':
                    value = amount_text(row)
                    if value is not None:
                        current.budget_thousand = (current.budget_thousand or 0) + value
                    continue
                if state == 'summary':
                    if SUB.match(row):
                        state = 'body'
                    else:
                        current.points = [(current.points[0] if current.points else '') + row]
    return items
