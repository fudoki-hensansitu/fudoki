"""東大和市の予算概要の「一般会計予算における主な事業」を読む。

事業ごとに「4 庁舎中庭利活用検討委託料【新規】」の見出し（長いと2行）、「特定財源」と欄の見出しの後に
「総 務 課 庁 舎 管 理 費 2,000 0 0 0 2,000」（課名・事業名・予算額・一般財源・国都支出金・市債・その他）を印字する。
0 の欄を空けた年度もあるので、行末に2〜5個並ぶ数の最初を予算額（千円）にし、その後から次の見出しまでの文を説明にする。
「(3)一般会計予算における主な事業」（R6 は (4)）から次の「(n)」の見出しの前までを読む。
"""
from __future__ import annotations

import re

from ingestion.project.layouts.press import PressItem, norm, page_lines

START = re.compile(r'^\(\d\) ?一般会計予算における主な事業$')
END = re.compile(r'^\(\d\)')
ENTRY = re.compile(r'^(\d+) (.+)$')
NEW = re.compile(r'【新規】')
NUMBERS = re.compile(r'(?:^| )((?:△ ?)?[\d,]+)(?: (?:△ ?)?[\d,]+){1,4}$')
SKIP = re.compile(r'^(?:\(単位:千円\)|<.+>|特定財源|課名 事業名|国・都支出金|\d+$)')


def read(path) -> list[PressItem]:
    items: list[PressItem] = []
    inside = False
    for number, printed in page_lines(path):
        rows = [norm(r) for r in printed]
        if not inside and not any(START.match(r) for r in rows):
            continue
        position = 0
        current: PressItem | None = None
        state = None  # title → table → points
        for row in rows:
            if START.match(row):
                inside = True
                continue
            if END.match(row):
                inside = False
                break
            if not inside:
                continue
            entry = ENTRY.match(row)
            if entry and (state is None or state == 'points') and not NUMBERS.search(row):
                position += 1
                current = PressItem(number, '', [], False, None, [], position)
                current.title = entry.group(2)
                items.append(current)
                state = 'title'
                continue
            if current is None:
                continue
            if state == 'title':
                if row == '特定財源':
                    state = 'table'
                else:
                    current.title += row
                continue
            if SKIP.match(row):
                continue
            if state == 'table':
                amount = NUMBERS.search(row)
                if amount:
                    current.budget_thousand = int(amount.group(1).replace(',', '').replace('△', '').strip())
                    state = 'points'
                continue
            current.points.append(row)
    for item in items:
        item.is_new = bool(NEW.search(item.title))
        item.title = NEW.sub('', item.title).strip()
        item.names = [item.title]
        item.points = [''.join(item.points)] if item.points else []
    return items
