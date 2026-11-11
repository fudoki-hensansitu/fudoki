"""予算案のプレス発表のうち、施策を「事業名 金額」の行で並べた一覧を、宣言（rules）で読む。

頁の文字を行に分け、`item` の正規表現に当たる行を施策1件にする。宣言のキー:

- `item`（必須）: 施策の行。名前付きの組 `name`（必須）・`tag`（新規などの札）・`amount`（金額）を持つ
- `previous`: 施策の行の直前の行が当たるときだけ読む（番号の行の次に事業名と金額を置く様式）
- `amount_next`: `item` に金額が無いとき、続く行（`lookahead` 行まで、既定 1。次の施策の行の前まで）から組 `amount` を探す。
  `join` が true なら、金額の行までの行を名前の続きにする
- `tag`: 名前の中の札（組 `tag`）。当たったら札の前までを名前にする
- `require_amount`: 金額の無い施策を読まない（既定 true）
- `new`: 新規を表す `tag` の値の list
- `start` / `end`: 節の始まりと終わりの行。`start` に当たった行の次から、`end` に当たる行の前までを読む（頁をまたぐ）
- `strip`: 名前から除く部分。`skip`: 名前に当たる施策は読まない。`unique`: 同じ名前は最初の1件だけにする
- `unit`: 数だけの金額の単位（`千円` 既定、`百万円`）
"""
from __future__ import annotations

import re

from ingestion.project.layouts.press import PressItem, amount, norm


def read(path, rules: dict) -> list[PressItem]:
    import pdfplumber
    item = re.compile(rules['item'])
    previous = re.compile(rules['previous']) if 'previous' in rules else None
    following = re.compile(rules['amount_next']) if 'amount_next' in rules else None
    start = re.compile(rules['start']) if 'start' in rules else None
    end = re.compile(rules['end']) if 'end' in rules else None
    tag = re.compile(rules['tag']) if 'tag' in rules else None
    strip = re.compile(rules['strip']) if 'strip' in rules else None
    skip = re.compile(rules['skip']) if 'skip' in rules else None
    unit, new = rules.get('unit', '千円'), set(rules.get('new', []))
    items: list[PressItem] = []
    inside = start is None
    with pdfplumber.open(path) as pdf:
        for number, page in enumerate(pdf.pages, start=1):
            rows = [norm(r) for r in (page.extract_text() or '').split('\n')]
            page.flush_cache()
            position = 0
            for index, row in enumerate(rows):
                if start and start.search(row):
                    inside = True
                    continue
                if not inside:
                    continue
                if end and end.search(row):
                    return items
                found = item.match(row)
                if not found or previous and not (index and previous.search(rows[index - 1])):
                    continue
                groups = found.groupdict()
                value, name = groups.get('amount'), groups['name']
                if not value and following:
                    for row_after in rows[index + 1:index + 1 + rules.get('lookahead', 1)]:
                        after = following.search(row_after)
                        if after:
                            value = after.group('amount')
                            groups = {**after.groupdict(), **{k: v for k, v in groups.items() if v}}
                            break
                        if item.match(row_after):
                            break
                        if rules.get('join'):
                            name += row_after
                if not value and rules.get('require_amount', True):
                    continue
                if tag:
                    marked = tag.search(name)
                    groups['tag'] = marked.group('tag') if marked else groups.get('tag')
                    name = name[:marked.start()] if marked else name
                if strip:
                    name = strip.sub('', name)
                name = name.strip()
                if skip and skip.search(name):
                    continue
                if rules.get('unique') and any(i.title == name for i in items):
                    continue
                position += 1
                items.append(PressItem(number, name, [name], groups.get('tag') in new, amount(value, unit), [], position))
    return items
