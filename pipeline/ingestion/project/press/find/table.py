"""件の見つけ方: 罫線のある表の1行を1件にする。

表の見出しの行で欄の横の範囲を決め、データの行は見出しの範囲と一番重なる枠を読む。
同じ見出しを左右に繰り返す表は、左の組を上から読んでから右の組を読む。

- `columns`（必須）: 欄の役割 → 見出しの正規表現（空白を除いた見出しの字。1字ずつ枠に分けた見出しは枠をつないで探す）。
  役割は `name`（必須）・`amount`（必須）・`tag`・`point`
- `carry`: 見出しの無い表は、前の表の見出しの欄の範囲で読む（頁をまたいで続く表）
- `fill`: 空の欄に上の行の値を使う役割の list（款のように続きの行で欄を空ける表）
- `cid_digits`: 数字を `(cid:1746N)` と符号化した PDF の数字を戻す
"""
from __future__ import annotations

import re

from ingestion.project.layouts.press import norm
from ingestion.project.press import Candidate, Page

# 罫線・字の位置を読むので、pdfplumber の頁を渡してもらう
NEEDS_PAGE = True

AMOUNT = re.compile(r'^△?[\d,]+(?:千円)?$')


class State:
    """頁をまたいで持つ、前の表の見出しの欄の範囲。"""
    def __init__(self, options: dict):
        self.carried: list[dict[str, tuple[float, float]]] = []


def cell(value, options: dict) -> str:
    value = value or ''
    if options.get('cid_digits'):
        value = re.sub(r'\(cid:1746(\d)\)', r'\1', value)
    return norm(value).replace('\n', '')


def header(cells: list[tuple], columns: dict[str, str]) -> list[dict[str, tuple[float, float]]]:
    """見出しの行なら組ごとの欄の範囲。見出しの語は続く枠に1字ずつ分けて印字することがあるので、枠をつないで探す。"""
    found: dict[str, list[tuple[float, float]]] = {}
    for role, word in columns.items():
        pattern, ranges, index = re.compile(word), [], 0
        while index < len(cells):
            first, joined = cells[index][1].replace(' ', ''), ''
            for end in range(index, min(index + 8, len(cells))):
                joined += cells[end][1].replace(' ', '')
                match = pattern.search(joined)
                if match and match.start() < max(len(first), 1):
                    ranges.append((cells[index][0][0], cells[end][0][2]))
                    index = end
                    break
            index += 1
        found[role] = ranges
    count = min(len(ranges) for ranges in found.values())
    return [{role: ranges[k] for role, ranges in found.items()} for k in range(count)]


def value(cells: list[tuple], columns: dict, role: str) -> str:
    """欄の範囲と一番重なる枠の字。見出しが2つの欄にまたがり（「予算額うち一般財源」）同じくらい重なるときは左の欄。"""
    if role not in columns:
        return ''
    left, right = columns[role]
    overlap = [(min(right, box[2]) - max(left, box[0]), text) for box, text in cells]
    most = max((o for o, _ in overlap), default=0)
    if most <= 0:
        return ''
    return next(text for o, text in overlap if o >= most * 0.9)


def find(page: Page, options: dict, state: State) -> list[Candidate]:
    out = []
    for table in page.page.find_tables():
        rows = [[(box, cell(text, options)) for box, text in zip(row.cells, texts) if box is not None]
                for row, texts in zip(table.rows, table.extract())]
        start = next((i for i, cells in enumerate(rows) if header(cells, options['columns'])), None)
        if start is not None:
            state.carried = header(rows[start], options['columns'])
        elif options.get('carry') and state.carried:  # 前の表から続く表は見出しが無い
            start = -1
        else:
            continue
        for columns in state.carried:
            above: dict[str, str] = {}
            for cells in rows[start + 1:]:
                if header(cells, options['columns']):
                    continue
                for role in options.get('fill', []):
                    above[role] = value(cells, columns, role) or above.get(role, '')
                name, amount = value(cells, columns, 'name'), value(cells, columns, 'amount').replace(' ', '')
                if not name or not AMOUNT.match(amount):
                    continue
                point = above.get('point', value(cells, columns, 'point'))
                out.append(Candidate(page.number, name, amount.replace('千円', '').replace('△', '-'),
                                     value(cells, columns, 'tag'), [point] if point else []))
    return out
