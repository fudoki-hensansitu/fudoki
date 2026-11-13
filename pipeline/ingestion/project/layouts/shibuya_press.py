"""渋谷区の当初予算案概要（「当初予算案事業シート」の頁。横長で1事業1頁、続きの頁や写真の頁が後に付く）を読む。

「事業名」「予算」の見出しの行（R8 は1字ずつ離して印字）の下の行に、事業名と予算額（「17億8,900万円」）を並べる。
1つの事業を2枚のシートに分けたときは、2枚目の予算額を「－」や「（P37の予算額に含む）」にするので、同じ事業名の2枚目は読まない。
新規の印は無い。
"""
from __future__ import annotations

from ingestion.project.layouts.press import BboxPdf, PressItem, amount_text, lines, text, words


def read_page(page, number: int) -> PressItem | None:
    rows = lines(words(page), tolerance=3)
    for index, row in enumerate(rows):
        joined = text(row)
        if '事業名' not in joined or '予算' not in joined.replace('予算案', ''):
            continue
        label = [w for w in row if w['text'] in ('予算', '予')][-1]
        below = [r for r in rows[index + 1:] if r[0]['top'] - row[0]['top'] <= 40]
        if not below:
            raise ValueError(f'p{number}: 事業名の行が無い')
        value = below[0]
        name = text([w for w in value if w['x1'] < label['x0'] - 40])
        amount = amount_text(text([w for w in value if w['x1'] >= label['x0'] - 40]))
        if not name:
            raise ValueError(f'p{number}: 事業名が読めない')
        return PressItem(number, name, [name], False, amount, [], 1)
    return None


def read(path) -> list[PressItem]:
    items: list[PressItem] = []
    with BboxPdf(path) as pdf:
        for number, page in enumerate(pdf.pages, start=1):
            item = read_page(page, number)
            page.flush_cache()
            if item is None:
                continue
            if item.budget_thousand is None and any(i.title == item.title for i in items):
                continue
            items.append(item)
    return items
