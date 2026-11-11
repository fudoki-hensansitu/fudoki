"""府中市の「予算のあらまし」を読む。

「9 基本施策別予算の取組状況」の頁に、基本施策ごとの表（区分・事業（事項）名・内容・金額（千円））を置く。
区分の「新」は新規、「レ」はレベルアップ、「投」は投資的事業（印の無い行もある）。表の1行（区分の印のある行と、その下の続きの行）を施策1件にし、
事業（事項）名の欄を名前、金額の欄を予算額にする。事業名の欄の「※介護保険特別会計」などの注記と、
「【債務負担行為設定】」の後の行は名前に入れない。
"""
from __future__ import annotations

import re

from ingestion.project.layouts.press import PressItem, lines, norm

MARKS = ('新', 'レ', '投')
HEADERS = {'区分': 'mark', '事業(事項)名': 'name', '内容': 'content', '金額(千円)': 'amount'}


def _columns(table) -> dict[str, tuple[float, float]] | None:
    header = table.rows[0]
    out = {}
    for cell in header.cells:
        if cell is None:
            continue
        value = norm(table.page.crop(cell).extract_text() or '').replace(' ', '')
        if value in HEADERS:
            out[HEADERS[value]] = (cell[0], cell[2])
    return out if len(out) == 4 else None


def _name(words: list[dict]) -> str:
    parts = []
    for row in lines(words):
        value = ''.join(norm(w['text']) for w in row)
        if value.startswith('【債務負担行為'):
            break
        if value.startswith('※'):
            continue
        parts.append(value)
    return ''.join(parts)


def _bands(page, table, columns) -> list[tuple[float, float]]:
    """名前・内容・金額の欄を横切る横罫で区切った帯。見出しの帯は除く。

    1件を複数の帯に分けて組むことがあるので、帯を件にまとめるのは呼ぶ側。
    罫は枠ごとの線なので、同じ高さの線を合わせて欄を横切るかを見る。
    """
    x0, top, x1, bottom = table.bbox
    covered: dict[float, set[str]] = {}
    for edge in page.horizontal_edges:
        if not top - 1 <= edge['top'] <= bottom + 1:
            continue
        y = next((k for k in covered if abs(k - edge['top']) <= 1), edge['top'])
        for key in ('name', 'content', 'amount'):
            left, right = columns[key]
            if edge['x0'] <= (left + right) / 2 <= edge['x1']:
                covered.setdefault(y, set()).add(key)
    tops = sorted(y for y, keys in covered.items() if len(keys) == 3)
    return list(zip(tops[1:], tops[2:]))


def read_page(page, number: int) -> list[PressItem]:
    items: list[PressItem] = []
    words = page.extract_words()
    for table in page.find_tables():
        columns = _columns(table)
        if not columns:
            continue
        bands = []
        for top, bottom in _bands(page, table, columns):
            inside = [w for w in words if top <= (w['top'] + w['bottom']) / 2 <= bottom]

            def column(key):
                left, right = columns[key]
                return [w for w in inside if left <= (w['x0'] + w['x1']) / 2 < right]
            bands.append({'mark': ''.join(norm(w['text']) for w in column('mark')),
                          'amounts': [int(a) for a in (norm(w['text']).replace(',', '') for w in column('amount'))
                                      if a.isdigit()],
                          'name': column('name')})
        # 1件を複数の帯に分けて組むことがある（区分の印・金額は件の中ほどの帯に印字する）。
        # 印の帯・金額の帯を件の要にし、要の無い帯は、次の帯に印があればその件の頭、無ければ前の件の続きにする
        entries: list[dict] = []
        for index, band in enumerate(bands):
            current = entries[-1] if entries else None
            anchored = current is not None and (current['mark'] or current['amounts'])
            following = bands[index + 1] if index + 1 < len(bands) else None
            if current is None:
                start = True
            elif band['mark']:
                start = anchored
            elif band['amounts']:
                start = bool(current['amounts'])
            else:
                text_now = _name(band['name'])
                text_before = _name(current['name'])
                closed = text_before.count('(') <= text_before.count(')') and not text_now.startswith('(')
                start = anchored and closed and following is not None and bool(following['mark'])
            if start:
                entries.append({'mark': '', 'amounts': [], 'name': []})
            entries[-1]['mark'] = entries[-1]['mark'] or band['mark']
            entries[-1]['amounts'] += band['amounts']
            entries[-1]['name'] += band['name']
        for entry in entries:
            name = _name(entry['name'])
            if not name:
                continue
            amount = sum(entry['amounts']) if entry['amounts'] else None
            items.append(PressItem(number, name, [name], entry['mark'] == '新', amount, [], len(items) + 1))
    return items


def read(path) -> list[PressItem]:
    import pdfplumber
    out: list[PressItem] = []
    with pdfplumber.open(path) as pdf:
        inside = False
        for number, page in enumerate(pdf.pages, start=1):
            head = norm(page.extract_text() or '')[:200]
            if '基本施策別予算の取組状況' in head:
                inside = True
            elif '施策別予算事業一覧' in head:
                inside = False
            if inside:
                out.extend(read_page(page, number))
            page.flush_cache()
    return out
