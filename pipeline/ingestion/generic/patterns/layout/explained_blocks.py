"""Tables whose rows are explained in blocks printed under them, across the subject and amount columns (中央区の
決算事項別明細書及び予算執行説明書の歳入).

Each spread is one ruled table: `科目 | 当初予算額 | 補正予算額 | 繰越財源充当額 | 予算現額計 | 節（区分・金額）| 調定額 |
収入済額 | …`. Under the rows of a 目 (and of the 款・項 above it), the table leaves the columns from 科目 to 予算現額計 open
and prints the 目's explanation there: what the 目 took in (`1 現年課税分 40,990,965,946 円`), the department, and
boxed tables of its 調定額・収入済額・件数. The 節 column and the columns right of it go on ruled beside the block, and
hold the 目's 節 rows. Read as columns, the block's words would fall into the subject and amount columns of the 目.

The rule left of the first amount column (`当初予算額`) is drawn only beside the rows of the table: where it stops, a
block runs from the frame's left edge to the next rule drawn the frame's whole height (the 節 column's left rule).
Each block's words and rules are cut out of the page before the columns are read, and its rectangle is an excluded
region of the coverage check (本文), so the digits of the explanation are accounted for and none of them is read as
an amount. A page that prints no `当初予算額` heading inside its frame is explanation only (a 目's explanation that
runs on over a whole page): its frame is cut out whole. The coverage check reads the printed words, and the regions
say which of them are explanation; the one change to the printed words is an amount glued to the next column's sign
(`split_signs`), which the coverage check reads cut too.

The subject column prints each row's level as a mark glued to its code (`（款）1`), and every level's name starts at
one place: `leveled` sets the code where its level's codes start, and raises a code printed on the middle line of a
wrapped name (and a 節区分 cell's number) to the first line. Moved words keep their printed box (`Carried`).
"""
from __future__ import annotations

import re
import unicodedata
from collections import defaultdict
from dataclasses import replace

from ingestion.generic import layout
from ingestion.generic.layout import Glyph, normalize
from ingestion.generic.observe import Page, Rule, Word
from ingestion.generic.patterns.layout import running_titles as rt

MARKER = '当初予算額'
KIND = '本文'
REASON = ('科目の行の下に、科目から予算現額計までの欄にまたがって印字された説明（予算執行説明書の文と、調定額・収入済額・'
          '件数などの表）。科目の金額でも節の内訳でもないので、取り込まない。')
GAP = 2.0  # pt: a break this long in the rule left of the first amount column is a block
MIN_ROWS = 3  # row rules that start on the same x: a frame's edge, not one cell's
EDGE = 2.0  # pt: a rule within this of the frame's top and bottom is drawn the frame's whole height
LEVEL_MARK = re.compile(r'^[(（]([款項目])[)）]\s*([0-9]+)$')  # `（款）1`: the level's mark and the code, one word
LEVELS = '款項目'
STEP = 6.0  # pt between where the codes of two levels are set
CODE = re.compile(r'^[0-9]+$')
GLUED_SIGN = re.compile(r'^([0-9][0-9,]*)([△▲])$')  # `0△`: an amount and the next column's sign, one word


def _verticals(page: Page) -> list[Rule]:
    return [r for r in page.rules if r.vertical]


def _marker(page: Page) -> Word | None:
    found = [w for w in page.words if normalize(w.text) == MARKER]
    return min(found, key=lambda w: w.y0) if found else None


def _frame(page: Page) -> tuple[float, float, float, float] | None:
    """The table's frame: its leftmost and rightmost rule drawn as tall as the tallest one."""
    verticals = _verticals(page)
    if not verticals:
        return None
    tall = max(r.y1 - r.y0 for r in verticals)
    full = [r for r in verticals if r.y1 - r.y0 >= tall - EDGE]
    return min(r.x0 for r in full), min(r.y0 for r in full), max(r.x0 for r in full), max(r.y1 for r in full)


def _subject_edge(page: Page, marker: Word, left: float) -> float:
    """The rule left of the first amount column: the right edge of the subject column."""
    middle = (marker.y0 + marker.y1) / 2
    beside = [r for r in _verticals(page) if r.y0 <= middle <= r.y1]
    before = [r.x0 for r in beside if left + EDGE < r.x0 < marker.x0]
    if not before:
        raise ValueError(f'No rule left of {MARKER}: p{page.number}')
    return max(before)


def _setsu_edge(page: Page, marker: Word, frame) -> tuple[float, float]:
    """The 節 column's left rule, the first drawn from the header to the foot of the columns right of the marker,
    and that foot: the frame's bottom, or higher where the table ends above it (the last 目 of a 款 going on
    overleaf, with the rest of the page blank)."""
    left, top, right, bottom = frame
    inner = [r for r in _verticals(page) if r.x0 > marker.x1 and r.x0 < right - EDGE]
    if not inner:
        raise ValueError(f'No column rule right of {MARKER}: p{page.number}')
    foot = max(r.y1 for r in inner)
    reach = [r.x0 for r in inner if r.y0 <= marker.y0 and r.y1 >= foot - EDGE]
    if not reach:
        raise ValueError(f'No rule drawn from the header to the foot of the columns right of {MARKER}: p{page.number}')
    return min(reach), foot


def blocks_of(page: Page) -> tuple[list[tuple[float, float, float, float]], bool]:
    """The rectangles of a page's blocks (left, top, right, bottom), and whether the page is explanation only."""
    frame = _frame(page)
    if frame is None:
        return [], False
    left, top, right, bottom = frame
    marker = _marker(page)
    if marker is None or not (left < marker.x0 < right and top < marker.y0 < bottom):
        return [frame], True
    x = _subject_edge(page, marker, left)
    end, foot = _setsu_edge(page, marker, frame)
    spans = sorted((r.y0, r.y1) for r in _verticals(page) if abs(r.x0 - x) < 1)
    found, drawn = [], spans[0][1]
    for y0, y1 in [*spans[1:], (foot, foot)]:
        if y0 - drawn > GAP:
            found.append((left, drawn, end, y0))
        drawn = max(drawn, y1)
    return found, False


def _nfkc(text: str) -> str:
    return re.sub(r'\s+', '', unicodedata.normalize('NFKC', text))


def _cells(page: Page, x0: float, x1: float) -> list[tuple[float, float]]:
    """The rows between the rules that run from x0 to x1."""
    ys = sorted({round(r.y0, 1) for r in page.rules
                 if not r.vertical and r.x0 <= x0 + EDGE and r.x1 >= x1 - EDGE})
    return list(zip(ys, ys[1:]))


def _held(words: list[Word], x0: float, x1: float, y0: float, y1: float) -> list[Word]:
    return [w for w in words if x0 < (w.x0 + w.x1) / 2 < x1 and y0 < (w.y0 + w.y1) / 2 < y1]


def leveled(page: Page, printed: Page) -> tuple[Page, list[tuple[tuple, tuple]]]:
    """The page with each subject row's code set where its level's codes start, on the row's first line.

    The subject column prints the level's mark and the code as one word (`（款）1`, `（項）1`, `（目）1`), and every
    level's name starts at one place: the mark is all that tells the levels apart. The code is set where the codes
    of its level start (STEP apart), so that the levels are read by where their codes start. A name over two or
    three lines prints its code (and the mark) on the middle line, and the code is set on the row's first line, so
    the name is read whole after its code; a 節区分 cell does the same with its number. Each moved word is returned
    with its printed box (placed box, printed box). The columns are found on the `printed` page, before its blocks
    were cut out (`cut` draws the column rules on through them)."""
    frame, marker = _frame(printed), _marker(printed)
    if frame is None or marker is None:
        return page, []
    left, top, right, bottom = frame
    edge = _subject_edge(printed, marker, left)
    moves: dict[int, Word] = {}
    for y0, y1 in _cells(page, left, edge):
        inside = _held(page.words, left, edge, y0, y1)
        marks = [w for w in inside if LEVEL_MARK.match(_nfkc(w.text))]
        if len(marks) != 1:
            continue
        mark = marks[0]
        level, code = LEVEL_MARK.match(_nfkc(mark.text)).groups()
        first = min(w.y0 for w in inside)
        x0 = left + 8 + STEP * LEVELS.index(level)
        moves[id(mark)] = Word(code, x0, first, x0 + 4.5 * len(code), first + mark.y1 - mark.y0)
    start, _ = _setsu_edge(printed, marker, frame)
    after = sorted(r.x0 for r in _verticals(printed) if r.x0 > start + EDGE and r.y0 <= marker.y0 + 20)
    end = after[0] if after else start
    for y0, y1 in _cells(page, start, end) if after else []:
        inside = _held(page.words, start, end, y0, y1)
        codes = [w for w in inside if CODE.match(_nfkc(w.text)) and w.x0 < start + 15]
        first = min(w.y0 for w in inside) if inside else 0
        if len(codes) == 1 and codes[0].y0 > first + 1:
            moves[id(codes[0])] = Word(codes[0].text, codes[0].x0, first, codes[0].x1, first + codes[0].y1 - codes[0].y0)
    if not moves:
        return page, []
    shifts = [((m.x0, m.y0, m.x1, m.y1), (w.x0, w.y0, w.x1, w.y1)) for w in page.words if (m := moves.get(id(w)))]
    return replace(page, words=[moves.get(id(w), w) for w in page.words]), shifts


def carry(glyph: Glyph, shifts) -> Glyph:
    """The glyph with the box it is printed in, when it was moved (`leveled`)."""
    x0, y0, x1, y1 = glyph.original
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    for (a, b, c, d), printed in shifts:
        if a - 0.01 <= cx <= c + 0.01 and b - 0.01 <= cy <= d + 0.01:
            return rt.Carried(glyph.text, glyph.x0, glyph.y0, glyph.x1, glyph.y1, glyph.page, glyph.offset, printed)
    return glyph


def split_signs(page: Page) -> list[Word]:
    """The page's words with an amount and the sign of the amount right of it (`0△` over `0 | △ 38,099,391`) cut
    at the column rule between them."""
    result = []
    for word in page.words:
        glued = GLUED_SIGN.match(word.text)
        middle = (word.y0 + word.y1) / 2
        edges = [r.x0 for r in _verticals(page) if r.y0 <= middle <= r.y1 and word.x0 + 1 < r.x0 < word.x1 - 1]
        if glued is None or len(edges) != 1:
            result.append(word)
            continue
        result += [Word(glued.group(1), word.x0, word.y0, edges[0], word.y1),
                   Word(glued.group(2), edges[0] + 1, word.y0, word.x1, word.y1)]
    return result


def without_percent(page: Page) -> Page:
    """The page without the `%` under `執行率`. Some pages draw no rule between `比較増減額` and `執行率` in the row of
    units under the headings, and `円` and `%` are read as one cell under both, a heading of their own; `円` alone is
    read as the unit, as under the other headings. The rates are not taken in."""
    marker = _marker(page)
    if marker is None:
        return page
    words = [w for w in page.words if not (_nfkc(w.text) == '%' and marker.y0 < w.y0 < marker.y1 + 20)]
    return replace(page, words=words) if len(words) != len(page.words) else page


def _inside(box, x: float, y: float) -> bool:
    return box[0] < x < box[2] and box[1] < y < box[3]


def cut(page: Page, blocks) -> Page:
    """The page without the words and rules of its blocks."""
    words = [w for w in page.words if not any(_inside(b, (w.x0 + w.x1) / 2, (w.y0 + w.y1) / 2) for b in blocks)]
    rules = []
    for rule in page.rules:
        within = any(b[0] - 1 <= min(rule.x0, rule.x1) and max(rule.x0, rule.x1) <= b[2] + 1
                     and b[1] - 1 <= min(rule.y0, rule.y1) and max(rule.y0, rule.y1) <= b[3] + 1
                     and not (rule.vertical and abs(rule.x0 - b[0]) < 1) for b in blocks)
        if within:
            continue
        # A column rule that stops where a block starts goes on through it: a page whose subject and amount columns
        # are a block from the header down (a 目's 節 going on overleaf) still has its columns, and reads as the
        # table going on, not as a page of other columns.
        below = [b for b in blocks if rule.vertical and b[0] + 1 < rule.x0 < b[2] - 1 and abs(rule.y1 - b[1]) <= EDGE]
        if below:
            rule = Rule(rule.x0, rule.y0, rule.x1, max(b[3] for b in below))
        rules.append(rule)
    return replace(page, words=words, rules=rules)


def opened(page: Page) -> Page:
    """The page with the open edge of a frame drawn where its row rules start.

    The right page of the spread draws no rule on the left of its first column (`調定額`): the row rules start there
    with no vertical rule under them, and the column's figures would lie outside every frame. Where at least MIN_ROWS
    row rules start on the same x with no vertical rule there, an edge is drawn from the highest to the lowest."""
    starts = defaultdict(list)
    for rule in page.rules:
        if not rule.vertical:
            starts[round(rule.x0)].append(rule.y0)
    added = [Rule(x, min(ys), x, max(ys)) for x, ys in starts.items() if len(ys) >= MIN_ROWS
             and not any(abs(r.x0 - x) <= EDGE for r in _verticals(page))]
    return replace(page, rules=page.rules + added) if added else page


def read(pages, **options):
    kept, excluded, shifts = [], {}, {}
    for page in pages:
        # On the observed page itself: the digit coverage reads the same words.
        page.words = split_signs(page)
        blocks, whole = blocks_of(page)
        excluded[page.number] = [{'kind': KIND, 'reason': REASON, 'page': page.number, 'bbox': list(b)} for b in blocks]
        if whole:
            continue
        made, shifts[page.number] = leveled(without_percent(opened(cut(page, blocks))), page)
        kept.append(made)
    logicals = layout.logical_pages(kept, **options)
    for logical in logicals:
        for band in logical.bands:
            band.words = [carry(g, shifts.get(g.page, ())) for g in band.words]
        logical.outside = [carry(g, shifts.get(g.page, ())) for g in logical.outside]
    for number, regions in excluded.items():
        if not regions:
            continue
        owner = next((l for l in logicals if number in l.pages), None) or next(
            (l for l in reversed(logicals) if l.pages and min(l.pages) <= number), None) or (logicals or [None])[0]
        if owner is None:
            raise ValueError(f'No table to hold the explanation of p{number}')
        owner.excluded.extend(regions)
    return logicals
