"""調布市の「市政経営の概要《施策と予算》」を読む。

予算事業の一覧の頁に、事業ごとに「№ 91 施策09… №41自立支援事業の充実 生活福祉課」の行と、
その次の行に「生活保護受給者自立支援事業の充実 8年度 54,251」（単位千円、名前の後に「新規」「拡充」の札、
額の前に「(※)」が付くこともある）を印字する。この2行の組を1件にする。
基本計画事業の一覧（「事 業 名」の欄の頁）は額を持たないので読まない。
"""
from __future__ import annotations

import re

from ingestion.project.layouts.press import PressItem, norm

NUMBER = re.compile(r'^(?:№|No) ?\d+ ')
AMOUNT = re.compile(r'^(.+?)(?: (新規|拡充))? ?\d+年度 (?:\(※\))?([\d, ]*\d)$')


def read(path) -> list[PressItem]:
    import pdfplumber
    items: list[PressItem] = []
    with pdfplumber.open(path) as pdf:
        for number, page in enumerate(pdf.pages, start=1):
            rows = [norm(r) for r in (page.extract_text() or '').split('\n')]
            page.flush_cache()
            position = 0
            for index, row in enumerate(rows[:-1]):
                if not NUMBER.match(row):
                    continue
                found = AMOUNT.match(rows[index + 1])
                if not found:
                    continue
                position += 1
                name = found.group(1).strip()
                items.append(PressItem(number, name, [name], found.group(2) == '新規',
                                       int(found.group(3).replace(',', '').replace(' ', '')), [], position))
    return items
