"""奥多摩町の当初予算の概要の「歳出目的に基づく主な事業（一般会計）」（R6 は「長期総合計画の分類に基づく主な事業」）を読む。

事業ごとに「・ 庁舎建設整備事業費(新庁舎建設工事監理業務委託、…など) 1,270,300」（千円）を印字し、長いと
次の行に折り返して行末に金額を置く。括弧の中は説明にする。新規の事業は下線で示すだけで文字に印が無いので、
is_new は読まない。「(1)議会費」の款の見出しは読まず、次の番号の節（「10.入湯税…」）の前までを読む。
"""
from __future__ import annotations

import re

from ingestion.project.layouts.press import PressItem, norm

START = re.compile(r'^\d+\.(?:歳出目的|.*長期総合計画の分類)に基づく主な事業')
END = re.compile(r'^\d+\.')
AMOUNT = re.compile(r'^(.*?) ?([\d,]+)$')
NAME = re.compile(r'^(.+?)(?:\((.*)\))?$')


def read(path) -> list[PressItem]:
    import pdfplumber
    items: list[PressItem] = []
    inside = False
    with pdfplumber.open(path) as pdf:
        for number, page in enumerate(pdf.pages, start=1):
            rows = [norm(r) for r in (page.extract_text() or '').split('\n')]
            page.flush_cache()
            position = 0
            buffer: str | None = None
            for row in rows:
                if START.match(row):
                    inside = True
                    continue
                if not inside:
                    continue
                if END.match(row):
                    return items
                if row.startswith('・'):
                    buffer = row[1:].strip()
                elif buffer is not None:
                    buffer += row
                else:
                    continue
                amount = AMOUNT.match(buffer)
                if amount and amount.group(1):
                    found = NAME.match(amount.group(1).strip())
                    position += 1
                    items.append(PressItem(number, found.group(1), [found.group(1)], False,
                                           int(amount.group(2).replace(',', '')),
                                           [found.group(2)] if found.group(2) else [], position))
                    buffer = None
    return items
