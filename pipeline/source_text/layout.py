"""PDF の頁の文字を、語の位置で行にまとめて並べる。アシスタントが読む頁の文字（marts の `source_page_text`）になる。

語の層（`ingestion/generic/page_words.py`）の語から、縦の位置で行にまとめ、語の左端の位置まで空白で寄せる。
表の列が行をまたいで揃い、見出しの年度と値の対応が文字列からも読める。
横長の頁で、幅の中ほどにどの語も跨がない縦の隙間があり、左右の行の高さが揃っていなければ、
左右の段（見開き・2段組み）に分けて左から順に並べる。縦長の頁の表の列の隙間や、見開きにまたがる表の行は分けない。
"""
from __future__ import annotations

import unicodedata
from pathlib import Path
from statistics import median

# 段の境目を探す範囲（頁の幅に対する割合）と、境目とみなす隙間の最小の幅
GUTTER_RANGE = (0.35, 0.65)
GUTTER_MIN = 0.01
# 片側の語がこれより少なければ2段とみなさない（見出しだけが片側にある頁など）
GUTTER_SIDE_MIN = 0.15
# 右の段の語のうち、左の段の行と同じ高さにある語がこれ以上なら、左右にまたがる1つの表とみなして分けない
GUTTER_SHARED_ROWS_MAX = 0.9
# 同じ行とみなす縦の中心のずれ、空白を挟まずに続ける全角の語の隙間（どちらも字の高さに対する割合）
SAME_LINE = 0.5
JOIN_GAP = 0.3
# 左右の段の語が同じ行にあるとみなす縦の中心のずれ（字の高さに対する割合）。見開きの表は左右で数 pt ずれるので行まとめより広い。
# 品川の資料の実測で、2段組みの評価シートは右の語の最大 87% が揃い、見開きにまたがる表は 91% 以上が揃う
SHARED_ROW = 0.6

Word = tuple[float, float, float, float, str]


def page_texts(path: Path) -> list[str]:
    """頁ごとの文字（物理頁の順）。文字の層の無い頁は空文字。"""
    from ingestion.generic import page_words

    return [page_text(p.width, p.height, [(w.x0, w.y0, w.x1, w.y1, w.text) for w in p.words]) for p in page_words.pages(path)]


def page_text(width: float, height: float, page_words: list[Word]) -> str:
    if not page_words:
        return ''
    split = gutter(width, page_words) if width > height else None
    columns = [page_words] if split is None else [[w for w in page_words if w[2] <= split], [w for w in page_words if w[2] > split]]
    return '\n\n'.join('\n'.join(lines(c)) for c in columns if c).strip('\n')


def gutter(width: float, page_words: list[Word]) -> float | None:
    """頁の中ほどで、どの語も跨がない一番広い縦の隙間の中央。2段でなければ None。"""
    low, high = width * GUTTER_RANGE[0], width * GUTTER_RANGE[1]
    spans = sorted((w[0], w[2]) for w in page_words if w[2] > low and w[0] < high)
    best: tuple[float, float] | None = None
    edge = low
    for x0, x1 in [*spans, (high, high)]:
        if x0 - edge > (best[1] - best[0] if best else 0):
            best = (edge, x0)
        edge = max(edge, x1)
    if not best or best[1] - best[0] < width * GUTTER_MIN:
        return None
    middle = (best[0] + best[1]) / 2
    left = sum(1 for w in page_words if w[2] <= middle)
    if not GUTTER_SIDE_MIN <= left / len(page_words) <= 1 - GUTTER_SIDE_MIN:
        return None
    if shared_rows(page_words, middle) >= GUTTER_SHARED_ROWS_MAX:
        return None
    return middle


def shared_rows(page_words: list[Word], split: float) -> float:
    """右の段の語のうち、左の段のどれかの語と同じ行（縦の中心のずれが字の高さの SHARED_ROW 以内）にある語の割合。"""
    height = median(w[3] - w[1] for w in page_words)
    left = [(w[1] + w[3]) / 2 for w in page_words if w[2] <= split]
    right = [(w[1] + w[3]) / 2 for w in page_words if w[2] > split]
    matched = sum(1 for center in right if any(abs(center - l) <= height * SHARED_ROW for l in left))
    return matched / len(right) if right else 0.0


def wide(c: str) -> bool:
    return unicodedata.east_asian_width(c) in 'WF'


def display_width(text: str) -> int:
    return sum(2 if wide(c) else 1 for c in text)


def joins(previous: Word, word: Word, height: float) -> bool:
    """空白を挟まずに続けるか。重なる語と、すき間の狭い全角どうし（日本語の語の切れ目）だけを続け、半角の語の間には空白を残す。"""
    gap = word[0] - previous[2]
    return gap <= 0 or (gap < height * JOIN_GAP and wide(previous[4][-1]) and wide(word[4][0]))


def lines(column: list[Word]) -> list[str]:
    """語を行にまとめ、語の左端の位置（半角1文字 = 字の高さの半分）まで空白で寄せる。"""
    if not column:
        return []
    height = median(w[3] - w[1] for w in column)
    left = min(w[0] for w in column)
    rows: list[tuple[float, list[Word]]] = []
    for w in sorted(column, key=lambda w: ((w[1] + w[3]) / 2, w[0])):
        center = (w[1] + w[3]) / 2
        if rows and abs(center - rows[-1][0]) <= height * SAME_LINE:
            rows[-1][1].append(w)
        else:
            rows.append((center, [w]))
    out = []
    for _, row in rows:
        row.sort(key=lambda w: w[0])
        text = ''
        previous: Word | None = None
        for w in row:
            if previous is not None and joins(previous, w, height):
                text += w[4]
            else:
                pad = round((w[0] - left) / (height / 2)) - display_width(text)
                text += ' ' * max(pad, 1 if text else 0) + w[4]
            previous = w
        out.append(text.rstrip())
    return out


def main(argv: list[str]) -> int:
    import argparse

    parser = argparse.ArgumentParser(description='PDF の頁の文字を、marts に入れるときと同じ組み方で表示する（抜き出しの目視の確認用）')
    parser.add_argument('pdf', type=Path)
    parser.add_argument('pages', nargs='*', type=int, help='物理頁（1始まり）。省略すると最初の3頁')
    args = parser.parse_args(argv)
    texts = page_texts(args.pdf)
    for page in args.pages or range(1, min(3, len(texts)) + 1):
        text = texts[page - 1]
        print(f'=== {page}頁（全{len(texts)}頁、{len(text)}文字）\n{text}\n')
    return 0


if __name__ == '__main__':
    import sys

    sys.exit(main(sys.argv[1:]))
