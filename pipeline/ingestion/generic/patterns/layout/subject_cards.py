"""Cards of one 目 each (予算説明書): the 目's frame, then its 財源内訳, 節区分 and 計上説明 printed under it.

台東区・中央区の歳出の頁は、目ごとに `目 | 本年度予算額 | 前年度予算額 | 比較増減額` の枠を置き、その下に
財源内訳の枠、節区分の枠、計上説明の欄を順に印字する（1頁に複数の目が並ぶことも、1つの目が数頁に続くこともある）。
これを欄が横に並ぶ表として読めるよう、目ごとに枠を組み直す。目の欄の右に、節区分の各升を1行ずつ並べた `節` の欄と、
計上説明の欄（`説明`）を置く。計上説明は印字の高さのまま右へ動かすだけなので、語の印字の位置は横のずれ
（`Glyph.offset`）で戻る。節区分の升は1行に組み直すので、印字の位置を語ごとに持たせる（`Carried`）。

中央区は目の枠の中で、目の行の上に `(款)` `(項)` の行を印字する。これらは枠の左に足した款・項の欄へ横に動かし、
款・項・目を欄で分けた表として読む。台東区は枠の上に `（款） 2 保険給付費` / `（項） 5 出産育児諸費 98,000` を
毎頁印字するので、`running_titles` と同じく枠の外の題字として読む。この書式は款・項の終わりに `計` の行を
印字しないが、どの款・項も会計の範囲の中で全部読むので、題字の金額は読む（`complete_titles` は使わない）。

財源内訳は取り込まない。目の金額を財源の種類ごとに分けた額で、支出の内訳ではない。目ごとの財源内訳の枠と、
計上説明の中に罫で囲んだ表（継続費の年度割、補助率の表など）は、款・項・目の欄も金額の欄も持たない表として
別に渡す（木の組み立てがそれを外し、その範囲の数字は網羅の検査から外れる）。款ごとに項を並べた頁
（`項 | 本年度 | 前年度 | 比較 | 本年度の財源内訳`）も同じく外す。そこに並ぶ項とその金額は、各項のカードの上に
再び印字されているからである。款を並べた歳出の頁の右半分（`比較 | 本年度予算額の財源内訳`）も外す（左半分が
款と歳出合計を持つ）。合計の下の `〔入湯税対象経費 17,171〕` は項への注記で、項目ではないので同じく外す。

組み直した枠は、頁の右の外に置く。網羅の検査は金額の欄の帯を頁の上から下まで引くので、組み直した欄が印字の
頁に重なると、目の行の下に印字された計上説明の数字が金額の欄の中にあると見なされるためである。語ごとの横の
ずれが印字の位置へ戻す。網羅の検査が読む範囲は、各カードの印字の矩形を語の無い帯として渡す。

計上説明では、行の途中の金額を行の末尾へ動かす。課の名前の前の金額（`98,000 〔国民健康保険課〕`）と、
積算の基の額（`対象医療費 16,527,123 負担率8／10・7／10`）である。後者の行の種類は `note_kinds` で宣言する。
金額の後ろが単位だけ（`212,388 人`）の行は動かさない。
"""
import re
import unicodedata
from collections import defaultdict
from dataclasses import dataclass, field

from ingestion.generic import layout
from ingestion.generic.layout import Band, Glyph, Logical, is_amount
from ingestion.generic.observe import Page, Rule, Word
from ingestion.generic.patterns.layout import running_titles as rt

FRAME_REACH = 3.0
LINE = 2.5
PITCH = 14.0
GAP = 18.0
MARK = re.compile(r'^[(（](款|項|目)[)）]$')
UNIT_WORDS = {'千円', '(単位:千円)'}


def norm(value: str) -> str:
    return re.sub(r'\s+', '', unicodedata.normalize('NFKC', value))


def lines(words: list[Word]) -> list[list[Word]]:
    found: list[tuple[float, list[Word]]] = []
    for word in sorted(words, key=lambda w: ((w.y0 + w.y1) / 2, w.x0)):
        centre = (word.y0 + word.y1) / 2
        if found and abs(found[-1][0] - centre) < LINE:
            found[-1][1].append(word)
        else:
            found.append((centre, [word]))
    return [sorted(ws, key=lambda w: w.x0) for _, ws in found]


def kind(line: list[Word]) -> str | None:
    value = norm(''.join(w.text for w in line))
    if '本年度予算額' in value and '前年度予算額' in value and value.startswith(('目', '科目')):
        return 'header'  # (a 款's list, `款 | 本年度予算額 | 前年度予算額`, is a table of its own)
    if value == '財源内訳':
        return 'funds'
    if value == '節区分':
        return 'setsu'
    if value.endswith('計上説明'):
        return 'notes'
    return None


@dataclass
class Placed:
    """Synthetic words of a page and, per word, where it is printed: (box placed, dx, box printed)."""
    words: list[Word] = field(default_factory=list)
    shifts: list[tuple[tuple, float, tuple]] = field(default_factory=list)
    rules: list[Rule] = field(default_factory=list)

    def put(self, word: Word, dx: float, y0: float | None = None, height: float | None = None) -> None:
        """Move a word right by `dx`; a word given a line of its own (`y0`, `height`) keeps its printed box."""
        top = word.y0 if y0 is None else y0
        bottom = word.y1 if y0 is None else top + (height if height is not None else word.y1 - word.y0)
        moved = Word(word.text, word.x0 + dx, top, word.x1 + dx, bottom)
        self.words.append(moved)
        self.shifts.append(((moved.x0, moved.y0, moved.x1, moved.y1), dx, (word.x0, word.y0, word.x1, word.y1)))

    def made(self, text: str, x0: float, y0: float, x1: float, y1: float) -> None:
        self.words.append(Word(text, x0, y0, x1, y1))


def frame_edges(page: Page) -> tuple[float, float] | None:
    verticals = sorted((r for r in page.rules if r.vertical), key=lambda r: r.y0 - r.y1)
    if len(verticals) < 2:
        return None
    longest = verticals[0].y1 - verticals[0].y0
    edges = sorted(r.x0 for r in verticals if r.y1 - r.y0 > longest * 0.8)
    return (edges[0], edges[-1]) if len(edges) >= 2 else None


def full_rows(page: Page, left: float, right: float) -> list[float]:
    return sorted(r.y0 for r in page.rules
                  if not r.vertical and r.x0 <= left + FRAME_REACH and r.x1 >= right - FRAME_REACH)


def above(rows: list[float], y: float) -> float:
    return max((r for r in rows if r <= y + 1), default=y - 2)


def split_cards(page: Page, left: float, right: float):
    """The page's outside words above the first block, its blocks (subject / funds / setsu / notes) in order, and
    the foot (under the frame)."""
    rows = full_rows(page, left, right)
    bottom = rows[-1] if rows else page.height
    marks = []
    for line in lines(page.words):
        found = kind(line)
        if found:
            top = above(rows, min(w.y0 for w in line))
            marks.append((found, top, line))
    if not any(k == 'header' or k == 'notes' for k, _, _ in marks):
        return None
    # A heading row with no row under it before the next heading row (the 中央区 R7 scans read the headings again
    # in the `(3) 歳出予算` box over the first card) heads nothing.
    empty = {id(w) for (k, _, line), (n, _, _) in zip(marks, marks[1:]) if k == n == 'header' for w in line}
    marks = [m for m in marks if not (m[0] == 'header' and id(m[2][0]) in empty)]
    blocks = []
    for index, (found, top, line) in enumerate(marks):
        end = marks[index + 1][1] if index + 1 < len(marks) else bottom
        heading = {id(w) for w in line} if found != 'header' else set()
        words = [w for w in page.words if top <= (w.y0 + w.y1) / 2 < end and id(w) not in heading and id(w) not in empty]
        blocks.append((found if found != 'header' else 'subject', top, end, words, line))
    first = marks[0][1]
    outside = [w for w in page.words if (w.y0 + w.y1) / 2 < first and id(w) not in empty]
    foot = [w for w in page.words if (w.y0 + w.y1) / 2 >= bottom]
    return outside, blocks, foot, rows


def dividing(page: Page, top: float, bottom: float, left: float, right: float) -> tuple[list[float], list[float]]:
    """The inner verticals and horizontals that divide a block of the frame whole. The short strokes some years draw
    inside a cell (中央区 R8: by a 目's name, between the cells of the 節区分) are no edges of it."""
    reach = defaultdict(float)
    for r in page.rules:
        if not r.vertical and top + 1 < r.y0 < bottom - 1:
            reach['h', round(r.y0, 1)] += min(r.x1, right) - max(r.x0, left)
    horizontals = sorted(y for (kind, y), length in reach.items() if kind == 'h' and length >= (right - left) * .9)
    # The block's heading row (`節 区 分`) spans the frame: its cells start under the first horizontal (台東区).
    start = horizontals[0] if horizontals and horizontals[0] - top < 25 else top
    # The last card on a page ends at the frame's foot: the empty space under its last row is no part of its cells.
    end = horizontals[-1] if horizontals and bottom - horizontals[-1] > 100 and horizontals[-1] > start else bottom
    for r in page.rules:
        if r.vertical and r.y0 < end - 1 and r.y1 > start + 1 and left + FRAME_REACH < r.x0 < right - FRAME_REACH:
            reach['v', round(r.x0, 1)] += min(r.y1, end) - max(r.y0, start)
    verticals = sorted(x for (kind, x), length in reach.items() if kind == 'v' and length >= (end - start) * .6)
    return verticals, horizontals


def cut_at(word: Word, edge: float) -> list[Word]:
    """A word read across a cell's edge (`7028旅` over `702 | 8 旅費`, the 中央区 R7 scans), cut at the character
    boundary nearest the edge; a digit is set half as wide as a kanji."""
    text = word.text
    units = [0.5 if re.fullmatch(r'[0-9,.]', ch) else 1.0 for ch in text]
    scale = (word.x1 - word.x0) / sum(units)
    bounds, x = [], word.x0
    for unit in units[:-1]:
        x += unit * scale
        bounds.append(x)
    if not bounds:
        return [word]
    index = min(range(len(bounds)), key=lambda i: abs(bounds[i] - edge))
    cut = bounds[index]
    return [Word(text[:index + 1], word.x0, word.y0, cut, word.y1), Word(text[index + 1:], cut + 1, word.y0, word.x1, word.y1)]


def setsu_lines(page: Page, words: list[Word], top: float, bottom: float, left: float, right: float,
                fallback: list[float] = ()) -> list[list[Word]]:
    """Each cell of the 節区分 frame as one entry: its words in reading order. A scan whose cell edges are too short
    to be found divides the cells where the 目's frame divides its amounts (`fallback`), and a word read across an
    edge is cut there."""
    verticals, horizontals = dividing(page, top, bottom, left, right)
    if not verticals and fallback:
        verticals = list(fallback)
        for edge in verticals:
            words = [part for w in words
                     for part in (cut_at(w, edge) if w.x0 + 3 < edge < w.x1 - 3 else [w])]
    edges = [left, *verticals, right]
    bands = [top, *horizontals, bottom]
    cells = []
    for upper, lower in zip(bands, bands[1:]):
        for x0, x1 in zip(edges, edges[1:]):
            inside = [w for w in words if upper <= (w.y0 + w.y1) / 2 < lower and x0 <= (w.x0 + w.x1) / 2 < x1
                      and norm(w.text) not in UNIT_WORDS]
            if inside:
                cells.append(inside)
    return cells


def cell_line(cell: list[Word]) -> tuple[list[Word], list[Word]]:
    """A 節区分 cell's name words (its number first) and its amount words. The amount is the run of amounts that ends
    a line (`２給料 16,870`, 中央区) or a line of amounts only (`129` under `10 需用費`, 台東区); the number is the
    first word of a line that goes on with a name (`13 賃借料・・` under `使用料及び`)."""
    names, amounts, number = [], [], None
    first = min(cell, key=lambda w: w.x0)
    if re.fullmatch(r'[0-9０-９]+', norm(first.text)) and any(not is_amount(w.text) for w in cell):
        number = first  # `13` printed between the two lines of `使用料及び` / `賃借料・・`
    for line in lines([w for w in cell if w is not number]):
        words, tail = list(line), []
        while words and is_amount(words[-1].text):
            tail.insert(0, words.pop())
        names.extend(words)
        amounts.extend(tail)
    return ([number] if number is not None else []) + names, amounts


DEPARTMENT_OPEN, DEPARTMENT_CLOSE = '〔[【・', '〕]】・'  # `･子育て支援課･` (中央区) between dots


def after_departments(words: list[Word]) -> dict[int, float]:
    """How far to move each amount printed before the line's department (`98,000 〔国民健康保険課〕`,
    `46,081千円 [保険年金課]`, `12,571,351千円 ･子育て支援課･`, `17,122千円 保険年金課`): the department ends the
    item's name, the amount ends the line."""
    moves = {}
    for line in lines(words):
        # A dot opens a department only when one also closes the line (`･子育て支援課･`): `・補助事業費` is a bullet.
        dotted = len(line) > 1 and norm(line[-1].text)[-1:] == '・'
        opening = max((i for i, w in enumerate(line) if norm(w.text)[:1] in DEPARTMENT_OPEN
                       and (dotted or norm(w.text)[:1] != '・')), default=None)
        last = max((i for i, w in enumerate(line) if rt.priced([Glyph(w.text, 0, 0, 0, 0, 0, 0)])), default=None)
        tail = ''.join(norm(w.text) for w in line[last + 1:]) if last is not None else ''
        if last and (opening is None or opening > last) and re.search(r'(課|室|所)・?$', tail) \
                and not re.search(r'[0-9]', tail):
            # `17,122千円 保険年金課`, `16,238,313千円 子 ど も 子 育 て 支 援 課 ･`: a department without its brackets
            moves[id(line[last])] = line[-1].x1 + 4 - line[last].x0
            continue
        if opening is None:
            # `対象医療費 16,527,123 負担率8／10・7／10`: the basis of a 積算 ends the line like an item's amount.
            priced = [i for i, w in enumerate(line) if re.fullmatch(r'[0-9][0-9,]*', norm(w.text))
                      and rt.priced([Glyph(w.text, 0, 0, 0, 0, 0, 0)])]
            # A count's unit after it (`212,388 人`) is no text of its own.
            if len(priced) == 1 and 0 < priced[0] < len(line) - 1 and len(norm(line[priced[0] + 1].text)) > 3 and not any(
                    rt.priced([Glyph(w.text, 0, 0, 0, 0, 0, 0)]) for w in line[priced[0] + 1:]):
                moves[id(line[priced[0]])] = line[-1].x1 + 4 - line[priced[0]].x0
            continue
        closing = next((i for i in range(opening, len(line)) if norm(line[i].text)[-1:] in DEPARTMENT_CLOSE), None)
        if closing is None or closing != len(line) - 1:
            continue
        before = line[:opening]
        amounts = []
        while before and rt.priced([Glyph(before[-1].text, 0, 0, 0, 0, 0, 0)]):
            amounts.insert(0, before.pop())
        if not amounts:
            continue
        end = line[closing].x1 + 4
        for word in amounts:
            moves[id(word)] = end - amounts[0].x0
    return moves


def apart_amounts(words: list[Word]) -> dict[int, float]:
    """`「中央区育ちのサポートシステム」12,830千円`: an amount printed right against the end of its name is set a gap
    apart, so that it reads as the line's amount and not as part of the name."""
    moves = {}
    for line in lines(words):
        for before, word in zip(line, line[1:]):
            if word.x0 - before.x1 < rt.SPLIT_GAP and not rt.priced([Glyph(before.text, 0, 0, 0, 0, 0, 0)]) \
                    and re.fullmatch(r'[0-9]{1,3}(?:,[0-9]{3})*千円', norm(word.text)):
                moves[id(word)] = rt.SPLIT_GAP + 1 - (word.x0 - before.x1)
    return moves


def office_headings(words: list[Word]) -> dict[int, float]:
    """`日本橋特別出張所 2,332,236千円 [日本橋特別出張所]` heads the numbered items under it (`1 日本橋特別出張所
    管理事業`), which start a little right of it (the number's box is narrower than a character): it is laid out
    where they start, so that the tree reads them as printed at its indentation."""
    moves = {}
    printed = lines(words)
    for line, following in zip(printed, printed[1:]):
        texts = [norm(w.text) for w in line]
        priced = next((i for i, w in enumerate(line) if rt.priced([Glyph(w.text, 0, 0, 0, 0, 0, 0)])), None)
        if not priced or re.match(r'[0-9(（]', texts[0]):
            continue
        name, tail = ''.join(texts[:priced]), ''.join(texts[priced + 1:])
        if tail != f'[{name}]':
            continue
        dx = following[0].x0 - line[0].x0
        if 0 < dx <= 6:
            for word in line[:priced]:
                moves[id(word)] = dx
    return moves


def amount_value(text: str) -> int | None:
    found = re.fullmatch(r'([0-9]{1,3}(?:,[0-9]{3})*)(?:千円)?', norm(text))
    return int(found.group(1).replace(',', '')) if found else None


def restated_lines(words: list[Word], held: set) -> list[list[Word]]:
    """The lines of a 目's 計上説明 that print the 目's amount again: the first, which says what the 目 is for
    (`療養の給付に要する経費を計上 6,626,796千円 [保険年金課]`, 中央区), and the 合計 of its items at the end. The
    amount is the 目's, no item of it."""
    printed = lines(words)
    found = []
    for index, line in enumerate(printed):
        text = norm(''.join(w.text for w in line))
        if ((index == 0 and '計上' in text) or text.startswith('合計')) and any(amount_value(w.text) in held for w in line):
            found.append(line)
    return found


def inner_boxes(page: Page, top: float, bottom: float, left: float, right: float) -> list[tuple]:
    """The ruled tables printed inside the 計上説明 (a 継続費's years, a 補助率 table): boxes of rules narrower than
    the frame. Their figures are no items of the explanation."""
    rules = [r for r in page.rules if top < (r.y0 + r.y1) / 2 < bottom
             and not (not r.vertical and r.x0 <= left + FRAME_REACH and r.x1 >= right - FRAME_REACH)
             and not (r.vertical and (abs(r.x0 - left) < FRAME_REACH or abs(r.x0 - right) < FRAME_REACH))]
    boxes: list[list[float]] = []
    for rule in sorted(rules, key=lambda r: (r.y0, r.x0)):
        box = [rule.x0, rule.y0, rule.x1, rule.y1]
        for other in boxes:
            if box[0] <= other[2] + 2 and other[0] <= box[2] + 2 and box[1] <= other[3] + 2 and other[1] <= box[3] + 2:
                other[0], other[1] = min(other[0], box[0]), min(other[1], box[1])
                other[2], other[3] = max(other[2], box[2]), max(other[3], box[3])
                break
        else:
            boxes.append(box)
    return [tuple(b) for b in boxes if b[2] - b[0] > 20 and b[3] - b[1] > 8]



@dataclass
class Columns:
    left: float          # the frame's left rule
    right: float         # the frame's right rule
    inner: list[float]   # the column rules of the 目's frame (目 | 本年度予算額 | 前年度予算額 | 比較増減額)
    headings: list[str]  # the headings over the amount columns
    levels: tuple        # the levels the frame prints in its rows: 款・項・目 (中央区, marked) or 目 only (台東区)
    held: set = field(default_factory=set)  # the amounts the last card's frame prints: its 計上説明 may go on overleaf


LEVEL_HEADINGS = ('款', '項', '目')


def amount_headings(line: list[Word], inner: list[float], right: float) -> list[str]:
    """The heading of each amount column, its words joined (`本 年 度 予 算 額` → `本年度予算額`)."""
    edges = [*inner, right]
    return [norm(''.join(w.text for w in line if a <= (w.x0 + w.x1) / 2 < b)) for a, b in zip(edges, edges[1:])]


def split_code(line: list[Word], names_right: float) -> list[Word]:
    """`2高` `額療養費` (the 中央区 R7 scans): the OCR glues a row's number to its name; the number is a word of its own."""
    first = min(line, key=lambda w: w.x0)
    found = re.fullmatch(r'([0-9]{1,2})([^0-9,，.．、].*)', norm(first.text))
    if found is None or first.x1 > names_right:
        return line
    units = [0.5 if ch.isdigit() else 1.0 for ch in first.text]  # a digit is set half as wide as a kanji
    cut = first.x0 + (first.x1 - first.x0) * sum(units[:len(found.group(1))]) / sum(units)
    return [Word(found.group(1), first.x0, first.y0, cut, first.y1), Word(found.group(2), cut + 3, first.y0, first.x1, first.y1),
            *(w for w in line if w is not first)]


def line_glyphs(line: list[Word]) -> list[Glyph]:
    return [Glyph(w.text, w.x0, w.y0, w.x1, w.y1, 0, 0.0) for w in line]


def place_page(page: Page, columns: Columns | None):
    """The synthetic page of a page of cards, its frames to leave out, and the columns for the next page."""
    edges = frame_edges(page)
    if edges is None:
        return None
    left, right = edges
    split = split_cards(page, left, right)
    if split is None:
        return None
    outside, blocks, _foot, rows = split
    width = right - left
    placed = Placed()
    left_out = []
    marked_page = any(MARK.match(norm(w.text)) for b in blocks if b[0] == 'subject' for w in b[3])
    titled = {id(w) for line in lines(outside) if rt.title(line_glyphs(line)) is not None for w in line}
    for word in outside:
        if marked_page and id(word) in titled:
            continue  # `第７款 都市整備費` over the page: the frame prints the 款's row itself
        if norm(word.text) in UNIT_WORDS:  # `（単位：千円）` printed on the 項's title line: a line of its own above
            top = min(w.y0 for w in outside) - (word.y1 - word.y0) - 4
            placed.put(word, 0, top)
        else:
            placed.put(word, 0)
    scopes = []  # the printed rectangle of each card: what the digit coverage check reads on the page
    cards = []
    for block in blocks:
        if block[0] == 'subject' or not cards:
            cards.append([])
        cards[-1].append(block)
    # Columns, left to right: 款 | 項 | 目 | amounts (as printed, moved right by two 目 widths) | 節 | 説明.
    level_width = None
    for index, card in enumerate(cards):
        subject = next((b for b in card if b[0] == 'subject'), None)
        if subject is not None:
            _, s_top, s_bottom, s_words, header_line = subject
            inner = dividing(page, s_top, s_bottom, left, right)[0]
            if not inner:
                return None
            marked = any(MARK.match(norm(w.text)) for b in blocks if b[0] == 'subject' for w in b[3])
            columns = Columns(left, right, inner, amount_headings(header_line, inner, right),
                              LEVEL_HEADINGS if marked else ('目',))
            # The amounts the frame prints, also when the 計上説明 starts only overleaf.
            columns.held = {amount_value(w.text) for w in s_words} - {None}
        elif columns is None:
            return None
        level_width = columns.inner[0] - left
        shift = (len(columns.levels) - 1) * level_width  # where the 目 column and the amounts go
        setsu_left = right + shift
        notes_left = setsu_left + width
        far = notes_left + width + 80
        card_top = subject[1] if subject is not None else card[0][1]
        header_bottom = card_top + 28  # a row of headings, then a row of the units under them
        next_top = cards[index + 1][0][1] if index + 1 < len(cards) else max(rows) if rows else page.height
        # The heading row, made from what the card prints (a page that goes on with the 目's notes prints none).
        mid = card_top + 7
        made = [(heading, left + i * level_width, left + (i + 1) * level_width)
                for i, heading in enumerate(columns.levels)]
        amount_edges = [x + shift for x in [*columns.inner, right]]
        made += [(h, a, b) for h, a, b in zip(columns.headings, amount_edges, amount_edges[1:])]
        made += [('節', setsu_left, notes_left), ('説明', notes_left, far)]
        for heading, a, b in made:
            placed.made(heading, (a + b) / 2 - 5 * len(heading), mid - 5, (a + b) / 2 + 5 * len(heading), mid + 5)
        bottoms = [header_bottom + 2]
        first_row = None
        if subject is not None:
            # Rows under the heading: `(款)` / `(項)` / `(目)` marks (中央区) send the row to its level's column.
            body = [w for w in s_words if (w.y0 + w.y1) / 2 > max(w.y1 for w in header_line) + 1]
            units = [w for w in body if norm(w.text) in UNIT_WORDS]
            for word in units:  # `千円` under each heading, printed in the first row (中央区): into the heading row
                placed.put(word, shift, header_bottom - 2 - min(word.y1 - word.y0, 10), min(word.y1 - word.y0, 10))
            level, rows_of = '目', []
            for line in lines([w for w in body if w not in units]):
                marks = [w for w in line if MARK.match(norm(w.text))]
                rest = [w for w in line if w not in marks]
                if marks:  # the level goes on to the lines under the mark (a name wrapped round its number)
                    level = MARK.match(norm(marks[0].text)).group(1)
                if rest:
                    rows_of.append([split_code(rest, columns.inner[0]), level])
            priced = [i for i, (rest, _) in enumerate(rows_of)
                      if any((w.x0 + w.x1) / 2 >= columns.inner[0] for w in rest)]
            if len(columns.levels) > 1 and priced and rows_of[priced[-1]][1] != '目':
                # A card ends with its 目's row: an unread `(目)` (the 中央区 R7 scans) is that row's mark. The row's
                # name wraps round its number, so the lines nearer its amounts than the row above's are its own.
                last = rows_of[priced[-1]][0][0].y0
                before = rows_of[priced[-2]][0][0].y0 if len(priced) > 1 else None
                for row in rows_of:
                    y = row[0][0].y0
                    # With no priced row above it, only the row and the lines wrapped under it: the rows above (a
                    # 款 or 項 that prints no amount of its own) keep their marks.
                    if (y >= last) if before is None else (y > before and abs(y - last) < abs(y - before)):
                        row[1] = '目'
            heads = {}  # a name's first line printed on its mark's line (`（目） 地域密着型介護` over `8 サービス等給付`)
            for (rest, _), following in zip(rows_of, rows_of[1:]):
                bare = not any((w.x0 + w.x1) / 2 >= columns.inner[0] for w in rest) and not re.match(
                    r'[0-9]', norm(min(rest, key=lambda w: w.x0).text))
                coded = re.fullmatch(r'[0-9]{1,2}', norm(min(following[0], key=lambda w: w.x0).text))
                gap = following[0][0].y0 - max(w.y0 for w in rest)
                if bare and coded and 8 < gap < 16:
                    heads.update({id(w): following[0][0].y0 - 6 for w in rest})
            for rest, level in rows_of:
                row_level = LEVEL_HEADINGS[0] if '合計' in norm(''.join(w.text for w in rest)) else level
                offset = {'款': 0, '項': level_width, '目': shift}[row_level if row_level in columns.levels else '目']
                for word in rest:
                    in_names = (word.x0 + word.x1) / 2 < columns.inner[0]
                    placed.put(word, offset if in_names else shift, heads.get(id(word)))
                first_row = min(w.y0 for w in rest) if first_row is None else first_row
                bottoms.append(max(w.y1 for w in rest))
        row_top = first_row if first_row is not None else header_bottom + 4
        for name, b_top, b_bottom, words, _ in card:
            if name == 'funds':
                left_out.append(((left, b_top, right, b_bottom), words))
            elif name == 'setsu':
                cells = [cell_line(split_code(cell, right)) for cell in
                         setsu_lines(page, words, b_top, b_bottom, left, right, columns.inner)]
                room = max(next_top - 8 - row_top, 1.0)
                pitch = max(6.0, min(PITCH, room / (len(cells) + 1)))
                height = pitch - 2
                y = row_top
                for names, amounts in cells:
                    # The number ends at one place and the name starts at one place whatever the number's width
                    # (`8 旅費` / `10 需用費`); a marked 細節 (`(1)消耗品費`) starts further in.
                    x = setsu_left + 28
                    for position, word in enumerate(names):
                        if position == 0 and re.fullmatch(r'[0-9０-９]+', norm(word.text)):
                            placed.put(word, setsu_left + 16 - word.x1, y, height)
                            continue
                        placed.put(word, x - word.x0, y, height)
                        x += word.x1 - word.x0 + 1
                    for word in amounts:
                        placed.put(word, setsu_left + width - 4 - word.x1, y, height)
                    y += pitch
                bottoms.append(y)
            elif name == 'notes' and words:
                boxes = inner_boxes(page, b_top, b_bottom, left, right)
                inside = lambda w, box: box[0] <= (w.x0 + w.x1) / 2 <= box[2] and box[1] <= (w.y0 + w.y1) / 2 <= box[3]
                for box in boxes:
                    held = [w for w in words if inside(w, box)]
                    if held:
                        left_out.append((box, held))
                words = [w for w in words if not any(inside(w, box) for box in boxes)]
                for line in lines(words):  # `〔入湯税対象経費 17,171〕` under the 合計: a note on the 項, no item of it
                    text = norm(''.join(w.text for w in line))
                    if text.startswith('〔') and text.endswith('〕'):
                        box = (min(w.x0 for w in line), min(w.y0 for w in line), max(w.x1 for w in line),
                               max(w.y1 for w in line))
                        left_out.append((box, line))
                        words = [w for w in words if w not in line]
                # 中央区 restates the 目's amount in its 計上説明; 台東区's `合計` stays, closing the items above it.
                for restated in (restated_lines(words, columns.held) if len(columns.levels) > 1 else []):
                    box = (min(w.x0 for w in restated), min(w.y0 for w in restated), max(w.x1 for w in restated),
                           max(w.y1 for w in restated))
                    left_out.append((box, restated))
                    words = [w for w in words if w not in restated]
                moves = after_departments(words)
                for key, dx in apart_amounts(words).items():
                    moves.setdefault(key, dx)
                for key, dx in office_headings(words).items():
                    moves[key] = moves.get(key, 0.0) + dx
                for word in words:
                    placed.put(word, notes_left - left + moves.get(id(word), 0.0))
                if words:
                    bottoms.append(max(w.y1 for w in words))
        bottom = max(bottoms) + 3
        scopes.append((left, card_top, right, card[-1][2]))
        for x in (*(left + i * level_width for i in range(len(columns.levels))), *amount_edges, notes_left, far):
            placed.rules.append(Rule(x, card_top, x, bottom))
        for y in (card_top, card_top + 15, header_bottom, bottom):
            placed.rules.append(Rule(left, y, far, y))
    # The frame is laid out right of the printed page: its columns are no printed columns (the coverage check's
    # amount bands run down the whole page, and under a card's 目 row the page prints its 計上説明). Each word's
    # offset brings it back to where it is printed.
    base = page.width + 50
    words = [Word(w.text, w.x0 + base, w.y0, w.x1 + base, w.y1) for w in placed.words]
    shifts = [((b[0] + base, b[1], b[2] + base, b[3]), dx + base, printed) for b, dx, printed in placed.shifts]
    rules = [Rule(r.x0 + base, r.y0, r.x1 + base, r.y1) for r in placed.rules]
    synthetic = Page(page.number, far + base + 20, max(page.height, max(r.y1 for r in rules) + 20), words, rules)
    placed.shifts = shifts
    return synthetic, left_out, placed.shifts, columns, scopes


def carry(glyph: Glyph, shifts) -> Glyph:
    """The glyph with its printed place: moved sideways only, by its offset; set on a line of its own, `Carried`."""
    cx, cy = (glyph.x0 + glyph.x1) / 2, (glyph.y0 + glyph.y1) / 2
    for (x0, y0, x1, y1), dx, printed in shifts:
        if x0 - 0.01 <= cx <= x1 + 0.01 and y0 - 0.01 <= cy <= y1 + 0.01:
            if (y0, y1) == (printed[1], printed[3]):
                return Glyph(glyph.text, glyph.x0, glyph.y0, glyph.x1, glyph.y1, glyph.page, glyph.offset + dx)
            return rt.Carried(glyph.text, glyph.x0, glyph.y0, glyph.x1, glyph.y1, glyph.page, glyph.offset,
                              (glyph.x0 - dx, printed[1], glyph.x1 - dx, printed[3]))
    return glyph

def funds_logical(page: int, left: float, right: float, top: float, bottom: float, words: list[Word]) -> Logical:
    glyphs = [Glyph(w.text, w.x0, w.y0, w.x1, w.y1, page, 0.0) for w in words]
    band = Band(left, right, page, ('財源内訳',), [], top, bottom, glyphs, kind='label', top=top)
    return Logical([page], [band], None, [])


def split_glue(head: str, tail: str) -> str | None:
    """What goes between the two pieces of one amount cut at its comma, or None when they are no such pieces:
    `20,` `765千円` (the text 冊 set a space after the comma), and in the scans `14` `,291件` and `960` `382千円`
    (the OCR cuts the amount at the comma, keeping it on either side or on neither)."""
    if re.fullmatch(r'[△▲]?[0-9,]*[0-9],', head) and re.match(r'[0-9]{3}(?:[,千円]|$)', tail):
        return ''
    if re.fullmatch(r'[△▲]?[0-9]{1,3}(?:,[0-9]{3})*', head):
        if re.fullmatch(r',[0-9]{3}(?:,[0-9]{3})*(?:千円|円|件|人)?', tail):
            return ''
        if re.fullmatch(r'[0-9]{3}(?:,[0-9]{3})*千円', tail):
            return ','
    return None


def join_comma_splits(words: list[Word]) -> list[Word]:
    """An amount cut at its comma into two words (`split_glue`): one amount, one word."""
    result, taken = [], set()
    ordered = sorted(words, key=lambda w: (round(w.y0), w.x0))
    for index, word in enumerate(ordered):
        if id(word) in taken:
            continue
        joined = word
        for following in ordered[index + 1:]:
            if abs(following.y0 - joined.y0) > LINE:
                break
            glue = split_glue(joined.text, following.text)
            if (glue is None and following.x0 - joined.x1 < 1 and re.fullmatch(r'[△▲]?[0-9,]+', joined.text)
                    and re.fullmatch(r'[0-9,]+', following.text)):
                glue = ''  # `7` `05` (the scans): the OCR cuts one amount into touching pieces
            if glue is not None and 0 <= following.x0 - joined.x1 < 6:
                joined = Word(joined.text + glue + following.text, joined.x0, min(joined.y0, following.y0),
                              following.x1, max(joined.y1, following.y1))
                taken.add(id(following))
            else:
                break
        result.append(joined)
    return result


def join_open_parens(words: list[Word]) -> list[Word]:
    """`( 1)` / `( ｱ)` (the same 冊): the bracket and the number in it are one number, as `(1)` is elsewhere. So is
    a level's mark read in two (`(目` `)`, the 中央区 R7 scans)."""
    result, taken = [], set()
    ordered = sorted(words, key=lambda w: (round(w.y0), w.x0))
    for word, following in zip(ordered, [*ordered[1:], None]):
        if id(word) in taken:
            continue
        if (following is not None and abs(following.y0 - word.y0) <= LINE and 0 <= following.x0 - word.x1 < 6
                and (norm(word.text) == '(' and re.fullmatch(r'[^()（）]{1,3}\)', norm(following.text))
                     or re.fullmatch(r'\((?:款|項|目)', norm(word.text)) and norm(following.text) == ')')):
            result.append(Word(word.text + following.text, word.x0, min(word.y0, following.y0), following.x1,
                               max(word.y1, following.y1)))
            taken.add(id(following))
        else:
            result.append(word)
    return result


def contained_fragments(words: list[Word]) -> list[Word]:
    """Paddle also reads a piece of a longer word as a word of its own inside it (`頁` inside `本年度予算額`, 131024
    R7 scans): a shorter word whose box lies inside a longer word's box is that piece, not printed text."""
    size = {id(w): len(norm(w.text)) for w in words}

    def inside(small: Word, large: Word) -> bool:
        return (small.x0 >= large.x0 - 1.5 and small.x1 <= large.x1 + 1.5 and small.y0 >= large.y0 - 1.5
                and small.y1 <= large.y1 + 1.5 and size[id(small)] < size[id(large)])
    return [w for w in words if not any(o is not w and inside(w, o) for o in words)]


def strip_bars(words: list[Word]) -> list[Word]:
    """`|4共済費` (the 中央区 R7 scans): the OCR reads a cell's edge as a bar before the word; the bar is no text."""
    result = []
    for w in words:
        text = w.text.lstrip('|｜').rstrip('|｜')
        if not text:
            continue
        if text != w.text:
            width = (w.x1 - w.x0) / max(len(w.text), 1)
            lead = len(w.text) - len(w.text.lstrip('|｜'))
            trail = len(w.text) - len(w.text.rstrip('|｜'))
            w = Word(text, w.x0 + lead * width, w.y0, w.x1 - trail * width, w.y1)
        result.append(w)
    return result


def split_marks(words: list[Word]) -> list[Word]:
    """`（目）地域密着型介護` (the 中央区 R7 scans): the OCR glues a level's mark to the name under it; the mark is a word
    of its own."""
    result = []
    for w in words:
        found = re.match(r'([(（](?:款|項|目)[)）])(.+)', w.text)
        if found is None:
            result.append(w)
            continue
        cut = w.x0 + (w.x1 - w.x0) * 3 / len(w.text)
        result += [Word(found.group(1), w.x0, w.y0, cut, w.y1), Word(found.group(2), cut + 2, w.y0, w.x1, w.y1)]
    return result


def summary_page(page: Page) -> bool:
    """A 款's page of its 項 (`項 | 本年度 | 前年度 | 比較 | 本年度の財源内訳`, closed by `計`) between the cards: the
    項 and their amounts are printed again over each 項's cards, so the page is left out whole. So is the right half of
    the 歳出 list of 款 (`比較 | 本年度予算額の財源内訳`): its left half prints the 款 and the 歳出合計."""
    for line in lines(page.words):
        value = norm(''.join(w.text for w in line))
        if value.startswith('項') and '本年度' in value and '前年度' in value:
            return True
        if value.startswith('比較'):
            return True
    return False




def read(pages, **options):
    shifts_by_page, scopes_by_page, left_out, synthetic, columns = {}, {}, [], [], None
    for page in pages:
        # On the observed page itself: digit coverage reads the same words (`runtime.run_pages`).
        page.words = join_open_parens(join_comma_splits(rt.join_full_width(split_marks(strip_bars(contained_fragments(page.words))))))
        wide = rt.extend_columns(page)
        page.words = rt.inside_rules(page.words, wide.rules)
        if summary_page(page):
            left_out.append(funds_logical(page.number, 0.0, page.width, 0.0, page.height, page.words))
            continue
        made = place_page(page, columns)
        if made is None:  # a table of its own (the 歳出 list of 款): as printed, laid out right of the page too
            base = page.width + 50
            synthetic.append(Page(page.number, wide.width + base, wide.height,
                                  [Word(w.text, w.x0 + base, w.y0, w.x1 + base, w.y1) for w in page.words],
                                  [Rule(r.x0 + base, r.y0, r.x1 + base, r.y1) for r in wide.rules]))
            shifts_by_page[page.number] = [((w.x0 + base, w.y0, w.x1 + base, w.y1), base, (w.x0, w.y0, w.x1, w.y1))
                                           for w in page.words]
            if wide.rules:
                scopes_by_page[page.number] = [(min(r.x0 for r in wide.rules), min(r.y0 for r in wide.rules),
                                                max(r.x1 for r in wide.rules), max(r.y1 for r in wide.rules))]
            continue
        built, frames, shifts, columns, scopes = made
        scopes_by_page[page.number] = scopes
        synthetic.append(built)
        shifts_by_page[page.number] = shifts
        left_out.extend(funds_logical(page.number, box[0], box[2], box[1], box[3], words) for box, words in frames)
    logicals = layout.logical_pages(synthetic, **options)
    for logical in logicals:
        for band in logical.bands:
            band.words = [carry(g, shifts_by_page.get(g.page, ())) for g in band.words]
        logical.outside = [carry(g, shifts_by_page.get(g.page, ())) for g in logical.outside]
    # Every column is laid out right of the printed page, so no column is taken for a printed column by the checks
    # that work on the page's own x. What the digit coverage check reads is each card's printed rectangle (and each
    # table's), given as an empty band.
    seen = set()
    for logical in logicals:
        for number in sorted({band.page for band in logical.bands} - seen):
            seen.add(number)
            logical.bands.extend(Band(x0, x1, number, ('枠',), [], top, bottom, [], kind=None, top=top)
                                 for x0, top, x1, bottom in scopes_by_page.get(number, ()))
    heading = (options.get('header') or {}).get('title_amount')
    full = {page.number: rt.full_rules(page) for page in synthetic}
    verticals = {page.number: [rule for rule in page.rules if rule.vertical and rule.y1 - rule.y0 >= rt.stacked_titles.MIN_RULE]
                 for page in synthetic}
    for logical in logicals:
        moved = rt.between_tables(logical, verticals, full)
        gone = {id(w) for _, w in moved}
        for band in logical.bands:
            band.words = rt.rejoin_total_tails(rt.join_split_yen(rt.split_glued_yen(rt.drop_units(
                [w for w in band.words if id(w) not in gone]))))
        logical.outside.extend(w for _, w in moved)
        logical.level_titles = rt.titles(logical, heading)
    rt.carry_amounts(logicals)
    return logicals + left_out
