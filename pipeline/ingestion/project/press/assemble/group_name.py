"""名前と金額の組み立て: 件の上の見出し（経費名・取組名など）を、件の別名として names に足す。

- `pattern`（必須）: 見出しの行（組 `name`）。見出しは次の見出しまでの件に効く（頁をまたがない）
- `require`: true なら見出しの下の件だけを残す
"""
from __future__ import annotations

import re

from ingestion.project.press import Candidate, Page


def apply(found: list[Candidate], page: Page, options: dict) -> list[Candidate]:
    heading = re.compile(options['pattern'])
    groups = [(index, m['name']) for index, row in enumerate(page.rows) if (m := heading.match(row))]
    out = []
    for candidate in found:
        group = next((name for index, name in reversed(groups) if candidate.index is not None and index < candidate.index), None)
        if group is None and options.get('require'):
            continue
        if group and group != candidate.name:
            candidate.names.append(group)
        out.append(candidate)
    return out
