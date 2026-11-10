"""A 説明 column whose first row is split into 財源内訳 cells (板橋区の予算説明書).

The 説明 column of each 目 prints, on the 目's row (or on the 計 row of a 項 that ends on the page), the 財源内訳 of
the 目: 使用料及び手数料 … 一般財源 in eight cells divided by short vertical rules. Below it the column holds the
explanation itself, one wide cell (`1 人件費 152人 … 1,442,436千円`, `政策企画課 … 3,904千円`). The short rules
make the layout read the column as eight bands, so the explanation's words straddle their edges.

The bands to the right of the 節's amount band are read here as one band `説明`, and the words of the 財源 row
(those a short rule between two cells crosses) are taken out of it. The 財源 row is not taken in: each one becomes
an excluded box (財源内訳) of the coverage check, the size of the row, not the whole column, so a digit of the
explanation left unread is still found. Otherwise the tables are read as `marked_titles` reads them.
"""
from dataclasses import replace
import re

from ingestion.generic import layout
from ingestion.generic.layout import Band, Glyph, is_amount, lines, normalize, runs, text
from ingestion.generic.observe import Word
from ingestion.generic.patterns.layout import marked_titles, stacked_titles

HEADING = '説明'
REASON = ('説明の欄の最初の行に罫線で区切って印字された目の財源内訳（使用料及び手数料〜一般財源）を取り込まない。'
          '歳出の目の和は本年度予算額で確かめる。')
# An amount of the explanation prints its unit after it (`592,878千円`, the page's unit), touching it or set apart.
MARKED = re.compile(r'^(.*[0-9])千円$')


def unmarked(words: list[Glyph]) -> list[Glyph]:
    """The words without the 千円 printed after each amount: the amount is the line's last run, as in a column of
    bare amounts. The unit is the page's (`(単位 千円)` is not printed, each column heads 千円)."""
    kept = []
    for word in words:
        shown = normalize(word.text)
        found = MARKED.match(shown)
        if shown == '千円':
            continue
        if found and len(shown) == len(word.text):
            keep = len(found.group(1))
            width = (word.x1 - word.x0) / len(word.text)
            word = Glyph(word.text[:keep], word.x0, word.y0, word.x0 + keep * width, word.y1, word.page, word.offset)
        kept.append(word)
    return kept


# A 款・項 title's mark joined to its code and name in one word.
MARK = re.compile(r'^([(（](?:款|項)[)）])\s*(?=[0-9])')
# How far past a rule the box of a digit printed against it may run and still be the cell's print.
OVERRUN = 1.5
# How far apart OCR starts two lines of one indentation (SNAP), and the start of a numbered line (`1` `(1)` `〔`).
SNAP = 6
CODED = re.compile(r'^[0-9０-９(（〔［\[]')
# A 財源 row's rules run the height of the row; a shorter stroke on a cell's edge is part of a print (a bracket of
# `(3) 短期集中型通所サービス事業` drawn over the edge, 2026年度 p435).
ROW = 8
# A glyph box the text layer gives is wider than its advance: the last digit of a right-aligned 一般財源 runs past
# the frame's edge. The excluded box reaches this far beyond the row's cells.
OVERHANG = 8


def explanation_bands(bands: list[Band]) -> dict[int, list[Band]]:
    """Per page, the bands to the right of the 節's amount band (`節／金額`), left to right. On a spread the 説明 is
    printed on the right page and the 節 on the left one."""
    setsu = [b for b in bands if b.header[:1] == ('節',) and normalize(b.header[-1]) == '金額']
    if not setsu:
        return {}
    edge = max(b.x1 for b in setsu) - 1
    found: dict[int, list[Band]] = {}
    for band in sorted(bands, key=lambda b: b.x0):
        if band.x0 >= edge:
            found.setdefault(band.page, []).append(band)
    return found


def funding_rows(cells: list[Band]) -> list[tuple[float, float]]:
    """The spans of the 財源 rows: where a short rule divides two cells below the header."""
    return merged_spans([(top, bottom) for band in cells[1:] for top, bottom in band.left_rules
                         if bottom > band.body_top + 1 and bottom - top >= ROW])


def reclaimed(logical: layout.Logical, cells: list[Band], verticals: list) -> list[Glyph]:
    """The words of the explanation `stacked_titles` took out as printed between two tables: only the short rules of
    the 財源 row stand on the cells' edges, so a word inside one cell (`152人`, `1,386,835千円`) crosses no rule of its
    own cell. Over the whole 説明 column the frame's edges cross it. They go back, in the spread's coordinates."""
    first, last = cells[0], cells[-1]
    whole = replace(first, x1=last.x1)
    left, right = first.x0 - first.offset, last.x1 - first.offset
    back = [g for g in logical.outside if g.page == first.page and left <= (g.x0 + g.x1) / 2 <= right
            and first.body_top <= (g.y0 + g.y1) / 2 <= first.body_bottom
            and not stacked_titles.between_tables(Glyph(g.text, g.x0 + first.offset, g.y0, g.x1 + first.offset, g.y1,
                                                        g.page, first.offset), whole, verticals)]
    gone = {id(g) for g in back}
    logical.outside = [g for g in logical.outside if id(g) not in gone]
    return [Glyph(g.text, g.x0 + first.offset, g.y0, g.x1 + first.offset, g.y1, g.page, first.offset) for g in back]


def figure_rows(words: list[Glyph]) -> list[tuple[float, float]]:
    """The spans of lines that print only amounts, three or more: a 財源 row whose short rules the scan did not
    detect. A line of the explanation prints at most one amount, at its end (`1 人件費 129人 … 956,750千円`)."""
    found = []
    for line in lines(words):
        # word by word: the boxes of two cells' amounts can touch (`16,799,498` `17,723,503`, 2024年度 p205)
        shown = [normalize(glyph.text) for glyph in line]
        figures = [value for value in shown if is_amount(value)]
        if len(figures) >= 3 and all(is_amount(value) or value == '千円' for value in shown):
            found.append((min(g.y0 for g in line), max(g.y1 for g in line)))
    return found


def merged_spans(spans: list[tuple[float, float]]) -> list[tuple[float, float]]:
    merged: list[list[float]] = []
    for top, bottom in sorted(spans):
        if merged and top <= merged[-1][1] + 1:
            merged[-1][1] = max(merged[-1][1], bottom)
        else:
            merged.append([top, bottom])
    return [(top, bottom) for top, bottom in merged]


def merge(logical: layout.Logical, cells: list[Band], verticals: list) -> list[Band]:
    """The cells as one 説明 band, and one excluded band for each 財源 row."""
    words = [w for band in cells for w in band.words] + reclaimed(logical, cells, verticals)
    rows = merged_spans(funding_rows(cells) + figure_rows(words))

    def funding(word: Glyph) -> bool:
        middle = (word.y0 + word.y1) / 2
        return any(top - 1 <= middle <= bottom + 1 for top, bottom in rows)

    first, last = cells[0], cells[-1]
    common = set(first.rows).intersection(*(band.rows for band in cells[1:]))
    explanation = replace(first, x1=last.x1, header=(HEADING,), rows=sorted(common), kind='label', spans=[],
                          words=unmarked(sorted((w for w in words if not funding(w)), key=lambda w: (w.y0, w.x0))),
                          left_rules=list(first.left_rules), excluded=None, inline=False, inline_free=False)
    excluded = []
    for top, bottom in rows:
        held = [w for w in words if top - 1 <= (w.y0 + w.y1) / 2 <= bottom + 1]
        x0 = min([first.x0, *(w.x0 for w in held)]) - first.offset
        x1 = max([last.x1, *(w.x1 for w in held)]) - first.offset + OVERHANG
        excluded.append(replace(first, x1=last.x1, header=(HEADING, '財源内訳'), rows=[], words=[], kind=None,
                                spans=[], excluded={'kind': '財源内訳', 'reason': REASON, 'page': first.page,
                                                    'bbox': [x0, top - 1, x1, bottom + 1]}))
    return [explanation, *excluded]


def snapped(band: Band) -> Band:
    """OCR starts the lines of one indentation a few points apart (`健康推進課` at 130.3, `おとしより保健福祉センター`
    at 135.1 under it, 2024年度 p433): an uncoded line with an amount (a 所管課 and its share) starts where the
    leftmost of its neighbours within SNAP starts, so its level is read as theirs."""
    found = [line for line in lines(band.words) if line and not CODED.match(normalize(line[0].text))
             and is_amount(normalize(text(runs(line)[-1]))) and len(runs(line)) > 1]
    starts = sorted(line[0].x0 for line in found)
    groups: list[list[float]] = []
    for x in starts:
        if groups and x - groups[-1][-1] <= SNAP:
            groups[-1].append(x)
        else:
            groups.append([x])
    target = {x: group[0] for group in groups for x in group}
    moved = {id(line[0]): target[line[0].x0] for line in found}
    words = [Glyph(w.text, moved[id(w)], w.y0, w.x1, w.y1, w.page, w.offset) if id(w) in moved else w for w in band.words]
    return replace(band, words=words)


def aligned(band: Band, x0: float) -> Band:
    """The band and its words moved right to start at `x0`, their place on the page (`original`) kept: the levels of
    the explanation are read from where its lines start, and the 説明 column of some pages stands 9pt to the right of
    the others' (2026年度 p265-337)."""
    shift = x0 - band.x0
    words = [Glyph(w.text, w.x0 + shift, w.y0, w.x1 + shift, w.y1, w.page, w.offset + shift) for w in band.words]
    return replace(band, x0=band.x0 + shift, x1=band.x1 + shift, offset=band.offset + shift, words=words)


def marked_apart(word: Word) -> list[Word]:
    """OCR reads a title as one word with its mark (`(項） 2減債基金積立金`, 2024年度 p323): the mark is a word of its
    own, as the text layer prints it, and the rest reads as the 項's code and name."""
    found = MARK.match(word.text)
    if not found:
        return [word]
    width = (word.x1 - word.x0) / len(word.text)
    cut = word.x0 + found.end(1) * width
    rest = word.text[found.end():]
    return [Word(found.group(1), word.x0, word.y0, cut, word.y1),
            Word(rest, word.x0 + found.end() * width, word.y0, word.x1, word.y1)]


def fit_digits(page) -> None:
    """Digits as the cells print them.

    A word of bare digits a vertical rule crosses is the prints of two cells: the 比較 `0` set against the rule and
    the 節's number `22` after it come out of the text layer as one word `022` (2026年度 p392). It is cut at the
    rule by the width of its characters (`layout.split_at_rules`); a right-aligned amount whose box only overhangs
    the rule keeps all its characters on the left and stays whole. A grouped amount (`1,234`) is never cut.

    The box of a right-aligned digit runs past its cell's rule by a fraction of a point (`1` of 繰越金 ends at 302.2,
    the rule stands at 301.7, 2026年度 p485): it ends at the rule, inside the cell the digit is printed in."""
    verticals = [rule for rule in page.rules if rule.vertical]
    words = []
    for word in (piece for whole in page.words for piece in marked_apart(whole)):
        pieces = layout.split_at_rules(word, verticals) if len(word.text) > 1 and normalize(word.text).isdigit() else [word]
        for piece in pieces:
            middle = (piece.y0 + piece.y1) / 2
            edge = min((rule.x0 for rule in verticals if piece.x1 - OVERRUN <= rule.x0 < piece.x1
                        and rule.x0 > piece.x0 + 1 and layout._crosses(rule, middle)), default=None)
            if edge is not None and any(c.isdigit() for c in normalize(piece.text)):
                piece = Word(piece.text, piece.x0, piece.y0, edge - .1, piece.y1)
            words.append(piece)
    page.words = words


def read(pages, **options):
    for page in pages:
        fit_digits(page)
    logicals = marked_titles.read(pages, **options)
    verticals = {page.number: [rule for rule in page.rules if rule.vertical and rule.y1 - rule.y0 >= stacked_titles.MIN_RULE]
                 for page in pages}
    merged = []
    for logical in logicals:
        for page, cells in explanation_bands(logical.bands).items():
            gone = {id(b) for b in cells}
            explanation, *excluded = merge(logical, cells, verticals[page])
            logical.bands = [b for b in logical.bands if id(b) not in gone] + excluded
            merged.append((logical, explanation))
    start = max((band.x0 for _, band in merged), default=0)
    for logical, explanation in merged:
        explanation = aligned(explanation, start)
        logical.bands.append(snapped(explanation))
    return logicals
