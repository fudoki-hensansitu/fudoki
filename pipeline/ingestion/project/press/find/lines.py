"""件の見つけ方: 頁の行のうち `item` の正規表現に当たる行を1件にする。

- `item`（必須）: 件の行。名前付きの組 `name`（必須）・`tag`（札）・`amount`（金額）を持つ。様式が2つある資料は list で並べる（前のものから当てる）
- `previous`: 件の行の直前の行が当たるときだけ読む（番号の行の次に事業名と金額を置く様式）
"""
from __future__ import annotations

import re

from ingestion.project.press import Candidate, Page


def find(page: Page, options: dict, state=None) -> list[Candidate]:
    items = [re.compile(p) for p in ([options['item']] if isinstance(options['item'], str) else options['item'])]
    previous = re.compile(options['previous']) if 'previous' in options else None
    match = lambda row: next((m for m in (i.match(row) for i in items) if m), None)
    page.is_item = lambda row: bool(match(row))
    out = []
    for index, row in enumerate(page.rows):
        found = match(row)
        if not found or previous and not (index and previous.search(page.rows[index - 1])):
            continue
        groups = found.groupdict()
        out.append(Candidate(page.number, groups['name'] or '', groups.get('amount'), groups.get('tag'), index=index))
    return out
