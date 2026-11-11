"""名前と金額の組み立て: 金額の無い件は、続く行から金額を探す。

- `pattern`（必須）: 金額の行。組 `amount`（必須）・`tag`・`name`（金額の前の名前の続き）を持つ
- `lookahead`: 何行先まで探すか（既定 1）。次の件の行の前まで
- `join`: true なら、金額の行までの行（金額の行の組 `name` も）を名前の続きにする
"""
from __future__ import annotations

import re

from ingestion.project.press import Candidate, Page


def apply(found: list[Candidate], page: Page, options: dict) -> list[Candidate]:
    following = re.compile(options['pattern'])
    for candidate in found:
        if candidate.amount or candidate.index is None:
            continue
        for row in page.rows[candidate.index + 1:candidate.index + 1 + options.get('lookahead', 1)]:
            if page.is_item and page.is_item(row):
                break
            after = following.search(row)
            if after:
                groups = after.groupdict()
                candidate.amount = groups['amount']
                candidate.tag = candidate.tag or groups.get('tag')
                if options.get('join') and groups.get('name'):
                    candidate.name += groups['name']
                break
            if options.get('join'):
                candidate.name += row
    return found
