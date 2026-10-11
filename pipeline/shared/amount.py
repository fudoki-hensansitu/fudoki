"""Printed amount reading shared by ingestion and dbt staging.

Moved from ingestion (``node_tables.number`` and ``sum_check.parse_amount``) so both
layers read the same integers from the same printed text. Whitespace, digit grouping,
a 円 unit mark before or after the number and one enclosing bracket pair are layout;
△/▲/- is a printed minus sign; a dash alone ('－', '―', '—', '-', 'ー') reads as 0.
Absent values are never read as 0: anything else unreadable returns None and the
caller stops instead of guessing.
"""
from __future__ import annotations

import re
import unicodedata

_AMOUNT = re.compile(r'(?P<sign>[△▲\-])?(?P<digits>[0-9]{1,3}(?:,[0-9]{3})*|[0-9]+)')
_BRACKETS = [('(', ')'), ('<', '>'), ('[', ']')]
_DASHES = ('－', '―', '—', '-', 'ー')
# Trailing-word Japanese-era year/period notation (e.g. 令和 6 年度, 令和 2 ~ 6 年度,
# 平成30~令和4年度). Past-year breakdown columns carry no current-year phase.
# Canonical form is NFKC (fullwidth tildes/digits/spaces are already folded).
# The same literal is embedded in dbt SQL (regexp_full_match); keep both identical.
FISCAL_YEAR_PATTERN = (r'^(?:明治|大正|昭和|平成|令和)\s*(?:元|\d+)'
                       r'(?:\s*[~〜\-・,、]\s*(?:(?:明治|大正|昭和|平成|令和)\s*)?(?:元|\d+))*\s*年度$')
_YEAR_NOTATION = re.compile(FISCAL_YEAR_PATTERN)


def is_fiscal_year_notation(text: object) -> bool:
    """Whether the trailing header word names a fiscal year or period, not an amount kind."""
    if text is None:
        return False
    return _YEAR_NOTATION.match(unicodedata.normalize('NFKC', str(text)).strip()) is not None


def parse_amount(value: object) -> int | None:
    """Printed amount as an integer, or None when the text is not a single amount."""
    if value is None:
        return None
    text = unicodedata.normalize('NFKC', str(value))
    text = re.sub(r'\s+', '', text).replace('−', '-').removeprefix('円').removesuffix('円')
    for opening, closing in _BRACKETS:
        if text.startswith(opening) and text.endswith(closing):
            text = text[1:-1]
            break
    match = _AMOUNT.fullmatch(text)
    if match is None:
        return None
    number = int(match['digits'].replace(',', ''))
    return -number if match['sign'] else number


def number(text: object) -> int | None:
    """Ingestion reading: a dash alone is a printed 0, otherwise parse_amount."""
    if text is not None and str(text).strip() in _DASHES:
        return 0
    return parse_amount(text)
