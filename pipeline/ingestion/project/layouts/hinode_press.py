"""日の出町の予算の資料を読む。年度で様式が違う。

R6・R7 は課ごとの頁に「【総務費】財産管理経費 R4決算 R5予算 R6予算 増減 事業概要 頁」の見出しと、
「新 公共施設マネジメント支援業務 3,414 3,514 8,780 5,266 …の実施… 40」（新規は「新」、前々年度決算・前年度予算・
今年度予算・増減、説明の文の折り返し、予算書の頁。決算の無い事業は決算の欄を空ける）の行を印字する。今年度予算（千円）を読み、見出しの経費名を名前に足す。
R8 は「【新】ファミリー・アテンダント事業 17,327千円」（札は 新・拡）の行を印字する（「-円」は金額なし）。
"""
from __future__ import annotations

import re

from ingestion.project.layouts.press import PressItem, norm

GROUP = re.compile(r'^【.+?費】(.+?) R\d+決算 R\d+予算 R\d+予算')
ROW = re.compile(r'^(?:(新) )?(.+?) (?:(-|[\d,]+) )?(-|[\d,]+) ([\d,]+) (△?[\d,]+|-)(?: .*)? \d+$')
SUMMARY = re.compile(r'^【(新|拡)】(.+?) (?:([\d,]+)千円|-円)$')


def read(path) -> list[PressItem]:
    import pdfplumber
    items: list[PressItem] = []
    with pdfplumber.open(path) as pdf:
        for number, page in enumerate(pdf.pages, start=1):
            rows = [norm(r) for r in (page.extract_text() or '').split('\n')]
            page.flush_cache()
            position = 0
            group = None
            for row in rows:
                heading = GROUP.match(row)
                if heading:
                    group = heading.group(1)
                    continue
                summary = SUMMARY.match(row)
                if summary:
                    position += 1
                    items.append(PressItem(number, summary.group(2), [summary.group(2)], summary.group(1) == '新',
                                           int(summary.group(3).replace(',', '')) if summary.group(3) else None, [], position))
                    continue
                found = ROW.match(row) if group else None
                if found:
                    name = found.group(2)
                    position += 1
                    items.append(PressItem(number, name, [name] + ([group] if group != name else []), found.group(1) == '新',
                                           int(found.group(5).replace(',', '')), [], position))
    return items
