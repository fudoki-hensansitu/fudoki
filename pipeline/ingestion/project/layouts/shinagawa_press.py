"""品川区の予算案のプレス発表資料（主な施策を1件1頁で説明した資料）を読む。

頁の上から、見出し（大きい字）・事業名（16pt、複数のことがある）と新規の印・予算額・背景・目的・POINT（●の箇条書き）・事業概要が並ぶ。
POINT までを読み、事業概要より下は読まない。事業名と予算額の欄が無い頁（表紙・目次・一覧）は施策の頁ではない。
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass

# 見出し・副題は 18pt 以上、事業名は 1行に1つで 14〜16pt（括弧書きは小さいことがある）。右上の「都内初」などの札は 18pt の短い語
TITLE_SIZE = 17.5
NAME_SIZE = 11
LABELS = ('事業名', '予算額', '事業概要', '事業の概要')
BULLETS = ('●', '⚫')
# 前の行の事業名の続き（括弧書き・「および」で始まる行）
CONTINUED = ('(', 'および', '及び')
NUMBERED = re.compile(r'^[①-⑳]')
AMOUNT = re.compile(r'([\d,]+)千円')


@dataclass
class PressItem:
    page: int
    title: str
    names: list[str]
    is_new: bool
    budget_thousand: int | None
    points: list[str]


def _norm(text: str) -> str:
    return unicodedata.normalize('NFKC', text).strip()


def _lines(words: list[dict], tolerance: float = 3) -> list[list[dict]]:
    rows: list[list[dict]] = []
    for word in sorted(words, key=lambda w: (w['top'], w['x0'])):
        if rows and abs(rows[-1][0]['top'] - word['top']) <= tolerance:
            rows[-1].append(word)
        else:
            rows.append([word])
    return [sorted(row, key=lambda w: w['x0']) for row in rows]


def _row_text(row: list[dict]) -> str:
    """1行の語を空白でつなぐ。丸数字は NFKC で数字になり金額とつながるので、先に外す。"""
    return ' '.join(_norm(NUMBERED.sub('', w['text'])) for w in row if NUMBERED.sub('', w['text']))


def read_page(page, number: int) -> PressItem | None:
    words = page.extract_words(keep_blank_chars=False, use_text_flow=False, extra_attrs=['size'])
    labels = {_norm(w['text']): w for w in words if _norm(w['text']) in LABELS}
    if '事業名' not in labels or '予算額' not in labels:
        return None
    name_top, budget_top = labels['事業名']['top'], labels['予算額']['top']
    overview = next((labels[k]['top'] for k in ('事業概要', '事業の概要') if k in labels), page.height)
    value_x = max(labels['事業名']['x1'], labels['予算額']['x1']) + 10
    names_from, names_to = name_top - 30, budget_top - 25
    is_new = any(_norm(w['text']) == '新規' for w in words if names_from <= w['top'] <= names_to + 10)
    names: list[str] = []
    for row in _lines([w for w in words if names_from <= w['top'] <= names_to and w['x0'] >= value_x
                       and w['size'] >= NAME_SIZE and _norm(w['text']) != '新規']):
        text = _row_text(row)
        if names and text.startswith(CONTINUED):
            names[-1] += text
        else:
            names.append(text)
    title_words = [w for w in words if w['size'] >= TITLE_SIZE and w['top'] < names_from
                   and not (len(_norm(w['text'])) <= 6 and w['size'] < 20)]
    title = ''.join(_row_text(row) for row in _lines(title_words))
    amounts = [int(m.group(1).replace(',', ''))
               for row in _lines([w for w in words if budget_top - 25 < w['top'] < budget_top + 25 and w['x0'] >= value_x])
               for m in AMOUNT.finditer(''.join(_norm(NUMBERED.sub('', w['text'])) for w in row))]
    points: list[str] = []
    for row in _lines([w for w in words if budget_top + 10 < w['top'] < overview - 5 and w['x0'] >= value_x]):
        text = _row_text(row)
        if text[:1] in BULLETS:
            points.append(text[1:].strip())
        elif points:
            points[-1] += text
    if not names:
        raise ValueError(f'p{number}: 事業名が読めない')
    return PressItem(number, title, names, is_new, sum(amounts) if amounts else None, points)


def read(path) -> list[PressItem]:
    import pdfplumber
    items = []
    with pdfplumber.open(path) as pdf:
        for number, page in enumerate(pdf.pages, start=1):
            item = read_page(page, number)
            if item is not None:
                items.append(item)
            page.flush_cache()
    return items
