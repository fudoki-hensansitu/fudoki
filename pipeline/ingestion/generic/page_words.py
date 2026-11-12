"""出典 PDF の頁の語と位置。事業の資料の取り込みと、アシスタントが読む頁の文字が共通に使う（docs/prd/page-words/dd.md）。

語は fiscal と同じ `observe.words`（固定版の Poppler の `pdftotext -bbox`）で取り、`observe.drop_hidden_copies` で見えない複製を落とす。
fiscal の変換器はこのモジュールを import しないので、ここを直しても fiscal の表の指紋は古くならない。
文字の層の無い頁は語が空のまま（OCR はかけない）。
"""
from __future__ import annotations

import re
import subprocess
from dataclasses import dataclass
from pathlib import Path

from ingestion.generic import observe
from ingestion.lib import poppler


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



def lines(page: Page) -> list[str]:
    """頁の語を行に組む。縦の中心が行の中心から字の高さの半分より近い語を1行にまとめ、行の中は左からつなぐ（`join`）。行は上から。"""
    rows: list[list[Word]] = []
    for word in sorted(page.words, key=lambda w: ((w.y0 + w.y1) / 2, w.x0)):
        middle, height = (word.y0 + word.y1) / 2, word.y1 - word.y0
        if rows:
            last = rows[-1]
            center = sum((w.y0 + w.y1) / 2 for w in last) / len(last)
            if abs(middle - center) <= min(height, min(w.y1 - w.y0 for w in last)) / 2:
                last.append(word)
                continue
        rows.append([word])
    return [join(sorted(row, key=lambda w: w.x0)) for row in rows]


def join(row: list[Word]) -> str:
    """行の語を左からつなぐ。隙間が字の幅の半分より狭ければ詰め（字の間を空けた見出しなど）、広ければ空白を1つ入れる。"""
    def width(word: Word) -> float:
        return (word.x1 - word.x0) / max(1, len(word.text))

    out = row[0].text
    for before, word in zip(row, row[1:]):
        gap = word.x0 - before.x1
        out += ('' if gap < min(width(before), width(word)) / 2 else ' ') + word.text
    return out
