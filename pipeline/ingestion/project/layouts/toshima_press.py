"""豊島区の予算案の事業概要（1事業1〜2頁の「当初予算案事業概要」「予算案重点事業概要」）を読む。

頁の上に「事業名」の見出しと事業名を並べ、R6 は本文の「５． 事業費（特財・一財内訳）」の次の行に「1,405千円 （特財702千円・一財703千円）」、
R7・R8 は頁の下の「事 業 費 ６５０万３千円 うち新拡分事業費 ２９１万１千円」に事業費を書く。事業費の最初の額を読む（新拡分ではない）。
事業費の見当たらない頁（表で示すなど）は予算額を無しにする。新規の印は無い。
"""
from __future__ import annotations

import re

from ingestion.project.layouts.press import BboxPdf, PressItem, amount_text, lines, norm, text, words


def _budget(rows: list[str]) -> int | None:
    for index, row in enumerate(rows):
        compact = row.replace(' ', '')
        if compact.startswith('事業費') and amount_text(compact):
            return amount_text(compact)
        if re.match(r'^\d\.?事業費', compact):
            for following in rows[index + 1:index + 4]:
                if amount_text(following):
                    return amount_text(following)
            return None
    return None


def read_page(page, number: int) -> PressItem | None:
    items = words(page)
    labels = [w for w in items if norm(w['text']) == '事業名' and w['size'] >= 14]
    if not labels:
        return None
    label = labels[0]
    name_rows = lines([w for w in items if w['x0'] > label['x1'] and label['top'] - 6 <= w['top'] <= label['top'] + 24], tolerance=3)
    names = [text(r) for r in name_rows if not text(r).startswith('・')]
    name = ''.join(names)
    if not name:
        raise ValueError(f'p{number}: 事業名が読めない')
    rows = [norm(line) for line in (page.extract_text() or '').split('\n')]
    return PressItem(number, name, [name], False, _budget(rows), [], 1)


def read(path) -> list[PressItem]:
    items: list[PressItem] = []
    with BboxPdf(path) as pdf:
        for number, page in enumerate(pdf.pages, start=1):
            item = read_page(page, number)
            page.flush_cache()
            if item is not None:
                items.append(item)
    return items
