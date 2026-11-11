"""檜原村の一般会計予算書補足説明資料の「総合計画事業の予算」（R8 は「総合計画 実施計画」）を読む。

「○生活道路等の維持・管理」の取組ごとに「・村道維持補修業務委託」の事業を並べ、「計 185,258千円」で締める。
R8 は事業ごとに「・常備消防委託料 84,995千円」と金額を印字するので事業を1件にする。R7 は事業の金額が無く
取組の計だけを印字するので、取組を1件にして事業の名前を names に入れる（○の無い「(2)簡易水道・下水道の整備」は小計で締める）。節ごとのまとめ（「第一節 …」）の前までを読む。
"""
from __future__ import annotations

import re

from ingestion.project.layouts.press import PressItem, norm

START = re.compile(r'総合計画(?:事業の予算| 実施計画)$')
END = re.compile(r'^第一節 ')
GROUP = re.compile(r'^(?:○|\(\d+\))(.+)$')
LINE = re.compile(r'^・(.+?)(?: ([\d,]+)千円)?$')
TOTAL = re.compile(r'^(?:小 ?)?計 ([\d,]+)千円$')


def read(path) -> list[PressItem]:
    import pdfplumber
    items: list[PressItem] = []
    inside = False
    group: str | None = None
    lines: list[str] = []
    priced = False
    with pdfplumber.open(path) as pdf:
        for number, page in enumerate(pdf.pages, start=1):
            rows = [norm(r) for r in (page.extract_text() or '').split('\n')]
            page.flush_cache()
            position = 0
            for row in rows:
                if START.search(row) and not re.search(r'\d+$', row):
                    inside = True
                    continue
                if not inside:
                    continue
                if END.match(row):
                    return items
                found = GROUP.match(row)
                if found:
                    group, lines, priced = found.group(1), [], False
                    continue
                found = LINE.match(row)
                if found and group:
                    lines.append(found.group(1))
                    if found.group(2):
                        priced = True
                        position += 1
                        items.append(PressItem(number, found.group(1), [found.group(1)], False,
                                               int(found.group(2).replace(',', '')), [], position))
                    continue
                found = TOTAL.match(row)
                if found and group:
                    if not priced and lines:
                        position += 1
                        items.append(PressItem(number, group, [group, *lines], False,
                                               int(found.group(1).replace(',', '')), [], position))
                    group, lines, priced = None, [], False
    return items
