"""千代田区の予算案のプレス資料（重点的に取り組む施策を、見出しと大きな字の予算額で並べた資料）を読む。

施策は「大きな字の数＋小さな字の単位（万円・億 万円）」の予算額を目印にし、その左上の見出しを施策名にする。
1頁に複数の施策が載ることがある。見出しの形は年度で違う。

- R7（2025）: 見出しは「１ー① 新規学童クラブの運営を補助」のように番号を付けた 18pt の行。番号を外して施策名にする。
- R6（2024）・R8（2026）: 見出しは予算額の左に並ぶ 17〜20pt の行（R6 は「〜を軽減！」のような惹句）。
  頁の上端の帯（分野名・基本構想の文）と、施策の種類の札（子ども・ＤＸ など、小さい字）は除く。

新規の印は施策ごとに付かない（R6 は「掲載事業は全て新規・拡充事業」と頁で断る）ので、is_new は常に偽。
予算額は資料の注のとおり「事業全体の予算額」。
"""
from __future__ import annotations

import re
from pathlib import Path

from ingestion.project.layouts.press import PressItem, big_amounts, lines, norm, text, words

AMOUNT_SIZE = 19
NUMBERED_TITLE = re.compile(r'^\d+[ー-]\d+\s*')  # 「１ー①」は NFKC で「1ー1」になる
HEADER_BAND = 40  # 頁の上端の分野名・基本構想の文
TITLE_SIZES = (16.5, 21.5)


def _numbered_titles(items: list[dict]) -> list[tuple[float, str]]:
    out = []
    for row in lines([w for w in items if w['top'] > HEADER_BAND]):
        joined = text(row, ' ')
        if NUMBERED_TITLE.match(joined):
            out.append((row[0]['top'], NUMBERED_TITLE.sub('', joined).replace(' ', '')))
    return out


LABEL = re.compile(r'^取組み\d+$')
# 見出しの字が無く、規則で施策名が決まらない施策（PDF の sha256 の先頭8桁, 頁, 頁の中の順）→ 資料の表記の施策名
TITLES = {
    ('f95915de', 33, 1): '認知症とともによりよく生きるためのプログラム',
}


def _labelled_title(items: list[dict], amounts: list, amount) -> str:
    """R7 の「取組み１」の札の右に印字した題（同じ段の左右に札があれば、予算額の列の札）。"""
    labels = [w for w in items if LABEL.match(norm(w['text'])) and w['top'] <= amount.top + 5 and w['x0'] < amount.x0]
    if not labels:
        return ''
    nearest_top = max(w['top'] for w in labels)
    label = max((w for w in labels if abs(w['top'] - nearest_top) < 10), key=lambda w: w['x0'])
    right = min((w['x0'] for w in labels if abs(w['top'] - label['top']) < 10 and w['x0'] > label['x0']), default=amount.x0)
    row = [w for w in items if abs(w['top'] - label['top']) < 6 and label['x1'] < w['x0'] < right and w['size'] >= 13]
    return text(sorted(row, key=lambda w: w['x0']))


def read_page(page, number: int, digest: str = '') -> list[PressItem]:
    items = words(page)
    if any(norm(w['text']) == '予算規模' for w in items):  # 会計ごとの予算の総額の頁
        return []
    amounts = sorted(big_amounts(items, AMOUNT_SIZE), key=lambda a: a.top)
    if not amounts:
        return []
    numbered = _numbered_titles(items)
    out: list[PressItem] = []
    for position, amount in enumerate(amounts, start=1):
        above = [t for t in numbered if t[0] <= amount.top + 10]
        title = TITLES.get((digest, number, position)) or _labelled_title(items, amounts, amount)
        if not title and above:
            title = above[-1][1]
        if not title:
            title = _block_title(items, amounts, amount)
            if len(title) > 40:  # 見出しでなく本文を拾った。頁の上の見出しにする
                title = _top_heading(items) or title

        if not title:
            raise ValueError(f'p{number}: 予算額 {amount.thousand} 千円の施策名が読めない')
        out.append(PressItem(number, title, [title], False, amount.thousand, [], position))
    return out


def _top_heading(items: list[dict]) -> str:
    rows = lines([w for w in items if HEADER_BAND < w['top'] < 100 and TITLE_SIZES[0] <= w['size'] <= TITLE_SIZES[1]])
    return text(rows[0]) if rows else ''


def _block_title(items: list[dict], amounts: list, amount) -> str:
    """予算額の左上にある見出しの字の行のうち、予算額にいちばん近いひとかたまり。

    同じ高さに予算額が並ぶ（2段組）ときは、左の予算額より右の語だけを見る。上は1つ上の段の予算額まで。
    """
    left = max((a.x0 for a in amounts if abs(a.top - amount.top) < 10 and a.x0 < amount.x0), default=None)
    floor = max((a.top for a in amounts if a.top < amount.top - 10), default=HEADER_BAND)
    candidates = [w for w in items if TITLE_SIZES[0] <= w['size'] <= TITLE_SIZES[1]
                  and floor + 5 < w['top'] <= amount.top + 12 and w['x0'] < amount.x0
                  and (left is None or w['x0'] > left + 30)
                  and not norm(w['text']).replace(',', '').isdigit()]
    rows = lines(candidates)
    block: list[list[dict]] = []
    for row in reversed(rows):
        if block and block[0][0]['top'] - row[0]['top'] > row[0]['size'] * 1.9:
            break
        block.insert(0, row)
    return ''.join(text(row) for row in block)


def read(path) -> list[PressItem]:
    import pdfplumber
    from ingestion.fiscal.manifest import sha_file
    digest = sha_file(Path(path))[:8]
    items: list[PressItem] = []
    with pdfplumber.open(path) as pdf:
        for number, page in enumerate(pdf.pages, start=1):
            items.extend(read_page(page, number, digest))
            page.flush_cache()
    return items
