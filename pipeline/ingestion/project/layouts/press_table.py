"""予算案のプレス発表のうち、施策を表（罫線のある表の1行1件）で並べた資料を、宣言（rules）で読む。

表の見出しの行で欄の位置を決め、その下の行を施策1件にする。同じ見出しを左右に繰り返す表は、左の組を上から読んでから右の組を読む。宣言のキー:

- `columns`（必須）: 欄の役割 → 見出しの語（空白を除いた見出しがその語で始まる欄）。役割は `name`（必須）・`amount`（必須）・`tag`・`point`
- `fill`: 空の欄に上の行の値を使う役割の list（款のように続きの行で欄を空ける表）
- `page`: 頁の文字に当たる頁だけを読む
- `new`: 新規を表す `tag` の欄の値の list。`new_mark`: 名前に当たれば新規にし、名前から除く
- `strip`: 名前から除く部分
- `cid_digits`: 数字を `(cid:1746N)` と符号化した PDF の数字を戻す
- `unit`: 金額の単位（`千円` 既定）
"""
from __future__ import annotations

import re

from ingestion.project.layouts.press import PressItem, amount, norm

AMOUNT = re.compile(r'^△?[\d,]+(?:千円)?$')


def read(path, rules: dict) -> list[PressItem]:
    import pdfplumber
    page_text = re.compile(rules['page']) if 'page' in rules else None
    mark = re.compile(rules['new_mark']) if 'new_mark' in rules else None
    strip = re.compile(rules['strip']) if 'strip' in rules else None
    new, unit = set(rules.get('new', [])), rules.get('unit', '千円')

    def cell(value) -> str:
        value = value or ''
        if rules.get('cid_digits'):
            value = re.sub(r'\(cid:1746(\d)\)', r'\1', value)
        return norm(value).replace('\n', '')

    def header(cells: list[str]) -> list[dict[str, int]]:
        """見出しの行なら組ごとの欄の位置。見出しを左右に繰り返すときは組が複数になる。"""
        at = {role: [i for i, c in enumerate(cells) if c.replace(' ', '').startswith(word)]
              for role, word in rules['columns'].items()}
        count = min(len(found) for found in at.values())
        return [{role: found[k] for role, found in at.items()} for k in range(count)]

    items: list[PressItem] = []
    with pdfplumber.open(path) as pdf:
        for number, page in enumerate(pdf.pages, start=1):
            if page_text and not page_text.search(cell(page.extract_text() or '')):
                page.flush_cache()
                continue
            position = 0
            for table in page.extract_tables():
                rows = [[cell(c) for c in row] for row in table]
                start = next((i for i, cells in enumerate(rows) if header(cells)), None)
                if start is None:
                    continue
                for columns in header(rows[start]):
                    above: dict[str, str] = {}
                    for cells in rows[start + 1:]:
                        if header(cells):
                            continue
                        get = lambda role: cells[columns[role]] if role in columns and columns[role] < len(cells) else ''
                        for role in rules.get('fill', []):
                            above[role] = get(role) or above.get(role, '')
                        name, value = get('name'), get('amount').replace(' ', '')
                        if not name or not AMOUNT.match(value):
                            continue
                        is_new = get('tag') in new
                        if mark and mark.search(name):
                            is_new, name = True, mark.sub('', name)
                        if strip:
                            name = strip.sub('', name)
                        name = name.strip()
                        point = above.get('point', get('point'))
                        position += 1
                        items.append(PressItem(number, name, [name], is_new,
                                               amount(value.replace('千円', '').replace('△', '-'), unit),
                                               [point] if point else [], position))
            page.flush_cache()
    return items
