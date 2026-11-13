"""武蔵村山市の各会計予算の概要の事業の欄（多摩都市モノレール関連・DX推進関係・ゼロカーボン・一般会計等の主な事業）を読む。

事業ごとに「新 胃内視鏡検診事業【健康推進課】 4,073」（印は 新・充・●・👉。「※新規」「※国保特会」などの注記が付くこともある）を
1行に印字し（名前が長いと名前・印・【課】・金額の4行か名前・印・【課】と金額の3行や、金額だけ次の行に分かれる）、続く「◼」の行に説明を印字する。予算額は千円。同じ事業を複数の欄に載せることがあるので、同じ名前は最初の1件だけにする。
"""
from __future__ import annotations

import re

from ingestion.project.layouts.press import PressItem, norm, page_lines

ENTRY = re.compile(r'^(新|充|●|👉) ?(.+?)【(.+?)】 ?(※\S+)? ?([\d,]+)$')
SECTION = re.compile(r'^\d+ (?:多摩都市モノレール関連事業|DX推進関係事業|ゼロカーボン|一般会計等の主な事業)')
OTHER_SECTION = re.compile(r'^\d+ (?:基金|特別会計|公営企業会計)')
POINT = re.compile(r'^◼ ?(.+)$')


def _join_split(rows: list[str]) -> list[str]:
    """名前が長い事業は「名前」「●」「【課】」「金額」の4行に分かれるので1行に戻す。"""
    out: list[str] = []
    index = 0
    while index < len(rows):
        if rows[index] in ('●', '新', '充', '👉') and out and index + 2 < len(rows) \
                and rows[index + 1].startswith('【') and re.fullmatch(r'[\d,]+', rows[index + 2]):
            out[-1] = f'{rows[index]} {out[-1]}{rows[index + 1]} {rows[index + 2]}'
            index += 3
            continue
        if rows[index] in ('●', '新', '充', '👉') and out and index + 1 < len(rows) \
                and re.fullmatch(r'【.+?】 ?[\d,]+', rows[index + 1]):  # 【課】と金額が同じ行に組まれたとき
            out[-1] = f'{rows[index]} {out[-1]}{rows[index + 1]}'
            index += 2
            continue
        if rows[index].startswith(('● ', '新 ', '充 ', '👉 ')) and index + 1 < len(rows) \
                and re.fullmatch(r'[\d,]+', rows[index + 1]):  # 金額だけが次の行（課もその次の行のことがある）
            office = rows[index + 2] if index + 2 < len(rows) and rows[index + 2].startswith('【') and '【' not in rows[index] else ''
            out.append(f'{rows[index]}{office} {rows[index + 1]}')
            index += 3 if office else 2
            continue
        out.append(rows[index])
        index += 1
    return out


def read(path) -> list[PressItem]:
    items: list[PressItem] = []
    seen: set[str] = set()
    inside = False
    for number, printed in page_lines(path):
        rows = _join_split([norm(r) for r in printed])
        position = 0
        current: PressItem | None = None
        for row in rows:
            if SECTION.match(row):
                inside = True
                continue
            if inside and OTHER_SECTION.match(row):
                inside = False
            if not inside:
                continue
            entry = ENTRY.match(row)
            if entry:
                current = None
                title = entry.group(2).strip()
                if title in seen:
                    continue
                seen.add(title)
                position += 1
                current = PressItem(number, title, [title], entry.group(1) == '新' or entry.group(4) == '※新規',
                                    int(entry.group(5).replace(',', '')), [], position)
                items.append(current)
                continue
            point = POINT.match(row)
            if current is not None and point and not current.points:
                current.points.append(point.group(1))
            elif current is not None and len(current.points) == 1 and not current.points[0].endswith('。') \
                    and not row.startswith(('〇', '○', '《', '-')) and '【' not in row and not POINT.match(row):
                current.points[0] += row
            else:
                current = None if current is None or current.points else current
    return items
