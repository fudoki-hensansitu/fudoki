"""出典 PDF の頁の語と位置。事業の資料の取り込みと、アシスタントが読む頁の文字が共通に使う（docs/prd/page-words/dd.md）。

語は fiscal と同じ `observe.words`（固定版の Poppler の `pdftotext -bbox`）で取り、`observe.drop_hidden_copies` で見えない複製を落とす。
fiscal の変換器はこのモジュールを import しないので、ここを直しても fiscal の表の指紋は古くならない。
文字の層の無い頁は語が空のまま（OCR はかけない）。
"""
from __future__ import annotations

import re
import subprocess
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from statistics import median

from ingestion.generic import observe
from ingestion.lib import poppler

# 同じ行とみなす縦の中心のずれ、空白を挟まずに続ける全角の語の隙間（どちらも字の高さに対する割合）
SAME_LINE = 0.5
JOIN_GAP = 0.3


@dataclass(frozen=True)
class Word:
    text: str
    x0: float
    y0: float
    x1: float
    y1: float


@dataclass(frozen=True)
class Page:
    number: int  # 物理頁（1始まり）
    width: float
    height: float
    words: list[Word]


def page_count(pdf: Path) -> int:
    out = subprocess.run(['pdfinfo', str(pdf)], check=True, capture_output=True, text=True).stdout
    found = re.search(r'^Pages:\s+(\d+)', out, re.M)
    if not found:
        raise ValueError(f'頁数を読めない: {pdf}')
    return int(found.group(1))


def pages(pdf: Path) -> list[Page]:
    """全頁の語。頁の順は物理頁の順。"""
    poppler.require()  # 語は Poppler の版で変わる
    count = page_count(pdf)
    if count == 0:
        return []
    observed = observe.words(pdf, 1, count)
    out = []
    for number in range(1, count + 1):
        width, height, items = observed[number]
        items = observe.drop_hidden_copies(pdf, number, width, items)
        out.append(Page(number, width, height, [Word(w.text, w.x0, w.y0, w.x1, w.y1) for w in items]))
    return out



def wide(c: str) -> bool:
    return unicodedata.east_asian_width(c) in 'WF'


def rows(words: list[Word]) -> tuple[float, list[list[Word]]]:
    """語を行にまとめる。字の高さ（語の高さの中央値）と、上からの行（行の中は左から）を返す。
    縦の中心が行の最初の語の中心から字の高さの SAME_LINE 倍以内なら同じ行にする。"""
    if not words:
        return 0.0, []
    height = median(w.y1 - w.y0 for w in words)
    out: list[tuple[float, list[Word]]] = []
    for w in sorted(words, key=lambda w: ((w.y0 + w.y1) / 2, w.x0)):
        center = (w.y0 + w.y1) / 2
        if out and abs(center - out[-1][0]) <= height * SAME_LINE:
            out[-1][1].append(w)
        else:
            out.append((center, [w]))
    return height, [sorted(row, key=lambda w: w.x0) for _, row in out]


def joins(previous: Word, word: Word, height: float) -> bool:
    """空白を挟まずに続けるか。重なる語と、すき間の狭い全角どうし（日本語の語の切れ目・字の間を空けた見出し）だけを続け、
    半角の語（数・英字）の間には空白を残す。"""
    gap = word.x0 - previous.x1
    return gap <= 0 or (gap < height * JOIN_GAP and wide(previous.text[-1]) and wide(word.text[0]))


def lines(page: Page) -> list[str]:
    """頁の語を行に組む（`rows`）。行の中は左から、`joins` なら詰め、そうでなければ空白を1つ入れる。"""
    height, grouped = rows(page.words)
    out = []
    for row in grouped:
        text = row[0].text
        for previous, word in zip(row, row[1:]):
            text += ('' if joins(previous, word, height) else ' ') + word.text
        out.append(text)
    return out
