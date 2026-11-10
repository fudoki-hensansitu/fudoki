"""品川区の「事務事業評価の結果について」を読む。

評価結果の表（部ごとの評価事業数・A〜D 評価の数・予算削減額（千円））の合計の行（「合計」または「全体集計」）だけを読む。
合計の行は「合計 <事業数> <削減額>」で、A〜D の数はその上の行に印字される。
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass

NUMBER = re.compile(r'-?[\d,]+')
TOTAL = re.compile(r'^(合\s*計|全体集計)\s')


@dataclass
class Result:
    page: int
    evaluated_count: int
    grade_counts: dict[str, int]
    reduced_thousand: int


def _norm(text: str) -> str:
    return unicodedata.normalize('NFKC', text)


def parse(lines: list[tuple[int, str]]) -> Result:
    """(頁, 行の文字) の並びから合計の行を探す。合計の行が1つでなければ止める。"""
    found = []
    for i, (page, line) in enumerate(lines):
        text = _norm(line).strip()
        label = TOTAL.match(text)
        if not label:
            continue
        numbers = [int(n.replace(',', '')) for n in NUMBER.findall(text[label.end():])]
        above = [int(n.replace(',', '')) for n in NUMBER.findall(_norm(lines[i - 1][1]))] if i else []
        if len(numbers) != 2 or len(above) != 4:
            raise ValueError(f'p{page}: 合計の行が読めない: {text}')
        if sum(above) != numbers[0]:
            raise ValueError(f'p{page}: A〜D の数の和が評価事業数と合わない: {above} {numbers[0]}')
        found.append(Result(page, numbers[0], dict(zip('ABCD', above)), numbers[1]))
    if len(found) != 1:
        raise ValueError(f'評価結果の合計の行が {len(found)} 個ある')
    return found[0]


def read(path) -> Result:
    import pdfplumber
    lines = []
    with pdfplumber.open(path) as pdf:
        for number, page in enumerate(pdf.pages, start=1):
            text = page.extract_text(layout=True) or ''
            lines += [(number, line) for line in text.splitlines() if line.strip()]
            page.flush_cache()
    return parse(lines)
