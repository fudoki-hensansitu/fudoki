"""名前と金額の組み立て: 名前の無い件は、前の行と次の行から名前を組む（名前が長く、件の行の上下に分けて印字する様式）。

- `before`: 前の行の正規表現（組 `name`）。当たればその組を名前の頭にする
- `after`: 次の行の正規表現（組 `name`）。当たればその組を名前の続きにする
"""
from __future__ import annotations

import re

from ingestion.project.press import Candidate, Page


def apply(found: list[Candidate], page: Page, options: dict) -> list[Candidate]:
    before = re.compile(options['before']) if 'before' in options else None
    after = re.compile(options['after']) if 'after' in options else None
    for candidate in found:
        if candidate.name.strip() or candidate.index is None:
            continue
        index = candidate.index
        head = before.match(page.rows[index - 1]) if before and index else None
        tail = after.match(page.rows[index + 1]) if after and index + 1 < len(page.rows) else None
        candidate.name = (head['name'] if head else '') + (tail['name'] if tail else '')
    return found
