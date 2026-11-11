"""名前と金額の組み立て: 件の行の次から続く行を名前の続きにする（金額を印字した後の行へ名前を折り返す様式）。

- `pattern`（必須）: 名前の続きの行。当たる行が続く間だけ足す。次の件の行の前まで
"""
from __future__ import annotations

import re

from ingestion.project.press import Candidate, Page


def apply(found: list[Candidate], page: Page, options: dict) -> list[Candidate]:
    following = re.compile(options['pattern'])
    for candidate in found:
        if candidate.index is None:
            continue
        for row in page.rows[candidate.index + 1:]:
            if page.is_item and page.is_item(row) or not following.match(row):
                break
            candidate.name += row
    return found
