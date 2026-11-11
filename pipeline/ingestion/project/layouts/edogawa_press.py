"""江戸川区の予算概要（「新規・拡充事業の概要」の章。SDGs の目標ごとに事業を番号付きで並べる）を読む。

事業の見出しは「１．特別養護老人ホーム建設補助（新規）【福祉推進課、障害者福祉課】」の行で、札は（新規）（拡充）など（札の無い事業もある）。
長い事業名は次の行へ折り返し、札・担当課の【】も次の行に送ることがある。その下の行に「230,000 ( 皆 増 )」と当年度・前年度の額（千円）を置く
（担当課と同じ行に「【教育指導課】 10,974 ( 皆 増 )」と置くこともある）。額の行が続かない番号付きの行（目次・本文の小見出し）は読まない。
"""
from __future__ import annotations

import re

from ingestion.project.layouts.press import PressItem, norm

HEADING = re.compile(r'^(\d+)\.(\D.*)$')
AMOUNT = re.compile(r'(?:^|】 ?)([\d,]+) ?\(.*\)$')
TAG = re.compile(r'\((新規|拡充|充実|継続|見直し)\)')


def read(path) -> list[PressItem]:
    import pdfplumber
    items: list[PressItem] = []
    with pdfplumber.open(path) as pdf:
        for number, page in enumerate(pdf.pages, start=1):
            rows = [norm(line) for line in (page.extract_text() or '').split('\n')]
            page.flush_cache()
            position = 0
            for index, row in enumerate(rows):
                match = HEADING.match(row)
                if not match:
                    continue
                parts, amount = [match.group(2)], None
                for following in rows[index + 1:index + 4]:
                    found = AMOUNT.search(following)
                    if found:
                        amount = int(found.group(1).replace(',', ''))
                        break
                    if HEADING.match(following):
                        break
                    parts.append(following)
                if amount is None:
                    continue
                whole = ''.join(parts)
                tag = TAG.search(whole)
                name = re.sub(r'【[^】]*】?', '', TAG.split(whole)[0]).strip()
                position += 1
                items.append(PressItem(number, name, [name], bool(tag) and tag.group(1) == '新規', amount, [], position))
    return items
