"""Amount headings as the shared dictionary knows them.

The builder keeps the heading path as it is printed (`予算現額／節／金額`, `支出済額(B)`, a column whose
stacked kinds the text layer joined: `翌年度繰越額継続費逓次繰越繰越明許費事故繰越し`). The amount contract
(`dbt/tests/fiscal_amounts_contract.sql`) wants the path, or its last segment, to be a heading of
`shared/fiscal_amount_map.csv`. A path that fails it is brought to the heading it prints, by rules that
read the printed words only:

1. the symbols a heading carries (`(A)`, `(B)-(C)`, `(逓)`) are not part of the heading;
2. the longest suffix of two or more segments the dictionary knows (`予算現額／節／金額` → `節／金額`), or,
   for a bare `金額` column, the axis of the item it belongs to (`節／金額`);
3. the headings a cell prints joined together (`継続費逓次繰越繰越明許費事故繰越し`) are one column of those
   kinds: the heading of the group above it when there is one, the first of them otherwise;
4. `…との比較` is `比較`; a column whose last segment the dictionary knows is that segment; a path whose
   last segment is none but whose first segments are a heading is that heading.

A path that the dictionary already knows (or whose last segment it knows) is never touched.
"""
from __future__ import annotations

import re

SYMBOL = re.compile(r'(?:[（(][A-ZＡ-Ｚ][)）][-－−]?)+|[（(][^0-9０-９()（）][)）]')
SEPARATOR = '／'


def clean(segment: str) -> str:
    return SYMBOL.sub('', segment).strip()


def parse(text: str, known: set[str]) -> list[str] | None:
    """The known headings a text is made of, joined (`繰越明許費事故繰越し`), or None."""
    if not text:
        return []
    for end in range(len(text), 0, -1):
        if text[:end] in known:
            rest = parse(text[end:], known)
            if rest is not None:
                return [text[:end], *rest]
    return None


def canonical(path: str, axis: str | None, known: set[str]) -> str:
    segments = path.split(SEPARATOR)
    if path in known or segments[-1] in known:
        return path
    segments = [clean(s) for s in segments]
    joined = SEPARATOR.join(segments)
    if joined in known or segments[-1] in known:
        return joined if joined in known else segments[-1]
    for start in range(1, len(segments) - 1):
        suffix = SEPARATOR.join(segments[start:])
        if suffix in known:
            return suffix
    if segments[-1] == '金額' and axis and f'{axis}{SEPARATOR}金額' in known:
        return f'{axis}{SEPARATOR}金額'
    for index in range(len(segments) - 1, -1, -1):
        parts = parse(segments[index], known)
        if parts and len(parts) >= 2:
            above = SEPARATOR.join(segments[:index])
            if above and above in known:
                return above
            if index == 0:
                return parts[0]
            return SEPARATOR.join([*segments[:index], parts[0]])
    if segments[-1].endswith('比較') and '比較' in known:
        return '比較'
    for end in range(len(segments) - 1, 0, -1):
        prefix = SEPARATOR.join(segments[:end])
        if prefix in known:
            return prefix
    return joined
