"""品川区の「事務事業評価の結果について」を読む。

評価結果の表（部ごとの評価事業数・A〜D 評価の数・予算削減額（千円））の合計の行（「合計」または「全体集計」）だけを読む。
頁の行は語の層（`page_words.lines`）で組む。合計の行は「合計 <事業数> <削減額>」で、A〜D の数はその上の行に印字される（行の組み方によっては合計の行の中に入る）。
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path

from ingestion.generic import page_words

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
        if len(numbers) == 6:  # A〜D の数が合計の行と同じ高さに組まれた（事業数・A〜D・削減額の順）
            numbers, above = [numbers[0], numbers[5]], numbers[1:5]
        else:
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
    lines = [(page.number, line) for page in page_words.pages(Path(path)) for line in page_words.lines(page) if line.strip()]
    return parse(lines)
