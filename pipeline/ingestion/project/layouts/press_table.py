"""予算案のプレス発表のうち、施策を表（罫線のある表の1行1件）で並べた資料を、宣言（rules）で読む。

表の見出しの行で欄の位置を決め、その下の行を施策1件にする。同じ見出しを左右に繰り返す表は、左の組を上から読んでから右の組を読む。宣言のキー:

- `columns`（必須）: 欄の役割 → 見出しの正規表現（空白を除いた見出しの字。1字ずつ枠に分けた見出しは枠をつないで探す）。データの行は、見出しの横の範囲と一番重なる枠を読む。役割は `name`（必須）・`amount`（必須）・`tag`・`point`
- `fill`: 空の欄に上の行の値を使う役割の list（款のように続きの行で欄を空ける表）
- `carry`: 見出しの無い表は、前の表の見出しの欄の範囲で読む（頁をまたいで続く表）
- `page`: 頁の文字に当たる頁だけを読む
- `new`: 新規を表す `tag` の欄の値の list（`new_contains` が true なら値に含まれれば新規）。`new_mark`: 名前に当たれば新規にし、名前から除く
- `also`: 名前の中の別名（組 `also`、予算書の事業名など）。名前から除いて names に足す。`also_skip` に当たる別名は足さない
- `strip`: 名前から除く部分。`skip`: 名前に当たる行（計の行など）は読まない
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
    skip = re.compile(rules['skip']) if 'skip' in rules else None
    also = re.compile(rules['also']) if 'also' in rules else None
    also_skip = re.compile(rules['also_skip']) if 'also_skip' in rules else None
    new, unit = set(rules.get('new', [])), rules.get('unit', '千円')

    def cell(value) -> str:
        value = value or ''
        if rules.get('cid_digits'):
            value = re.sub(r'\(cid:1746(\d)\)', r'\1', value)
        return norm(value).replace('\n', '')

    def runs(cells: list[tuple]) -> dict[str, list[tuple[float, float]]]:
        """見出しの行の役割ごとの欄の横の範囲。見出しの語は続く枠に1字ずつ分けて印字することがあるので、枠をつないで探す。"""
        found: dict[str, list[tuple[float, float]]] = {}
        for role, word in rules['columns'].items():
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
        return found

    def header(cells: list[tuple]) -> list[dict[str, tuple[float, float]]]:
        """見出しの行なら組ごとの欄の範囲。見出しを左右に繰り返すときは組が複数になる。"""
        at = runs(cells)
        count = min(len(found) for found in at.values())
        return [{role: found[k] for role, found in at.items()} for k in range(count)]

    items: list[PressItem] = []
    carried: list[dict[str, tuple[float, float]]] = []
    with pdfplumber.open(path) as pdf:
        for number, page in enumerate(pdf.pages, start=1):
            if page_text and not page_text.search(cell(page.extract_text() or '')):
                page.flush_cache()
                continue
            position = 0
            for table in page.find_tables():
                rows = [[(box, cell(value)) for box, value in zip(row.cells, values) if box is not None]
                        for row, values in zip(table.rows, table.extract())]
                start = next((i for i, cells in enumerate(rows) if header(cells)), None)
                if start is not None:
                    carried = header(rows[start])
                elif rules.get('carry') and carried:  # 前の表から続く表は見出しが無い
                    start = -1
                else:
                    continue
                for columns in carried:
                    above: dict[str, str] = {}
                    for cells in rows[start + 1:]:
                        if header(cells):
                            continue

                        def get(role: str) -> str:
                            """欄の範囲と一番重なる枠の字。"""
                            if role not in columns:
                                return ''
                            left, right = columns[role]
                            overlap = [(min(right, box[2]) - max(left, box[0]), value) for box, value in cells]
                            most = max((o for o, _ in overlap), default=0)
                            if most <= 0:
                                return ''
                            # 見出しが2つの欄にまたがり（「予算額うち一般財源」）同じくらい重なるときは左の欄
                            return next(value for o, value in overlap if o >= most * 0.9)

                        for role in rules.get('fill', []):
                            above[role] = get(role) or above.get(role, '')
                        name, value = get('name'), get('amount').replace(' ', '')
                        if not name or not AMOUNT.match(value) or skip and skip.search(name):
                            continue
                        is_new = any(word in get('tag') for word in new) if rules.get('new_contains') else get('tag') in new
                        if mark and mark.search(name):
                            is_new, name = True, mark.sub('', name)
                        if strip:
                            name = strip.sub('', name)
                        names = []
                        found = also.search(name) if also else None
                        if found:
                            name = name[:found.start()] + name[found.end():]
                            if not (also_skip and also_skip.search(found.group('also'))):
                                names.append(found.group('also'))
                        name = name.strip()
                        point = above.get('point', get('point'))
                        position += 1
                        items.append(PressItem(number, name, [name, *names], is_new,
                                               amount(value.replace('千円', '').replace('△', '-'), unit),
                                               [point] if point else [], position))
            page.flush_cache()
    return items
