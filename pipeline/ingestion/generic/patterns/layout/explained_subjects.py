"""Tables of 款・項・目 whose 目 are explained in text printed after the table (神戸市の局別の予算説明書).

Each 項 opens a ruled table under its titles (`第４款 民生費` / `第３項 こども家庭費`): `款 項 目 | 本年度 | 前年度 |
比較 | 本年度の財源内訳`, a row per 款・項 and 目, as `running_titles` reads it. The table draws no 説明 column. After it,
on the rest of the page and the pages that follow, each 目 is explained in unruled text: a heading naming the 目 by
its code (`1 こども総務費`, `（1目） 調査費 15,960千円`), a sentence on what the 目 is for, and the 目's items, each
with its amount (`(1) こべっこウェルカム定期便 442,100 千円`).

Here each 目's explanation is read as the 目's 説明: the table is laid out again with a 説明 column right of the
page, and each 目 row is stretched down to hold the lines of its explanation in that column, at their own
indentation. The words of the table stay at their printed x (the amount columns are where they are printed); the
words below a stretched row move down, and each moved word, and each line of the explanation, keeps the place
where it is printed (`Carried`, on its own page) for the location and the coverage check.

- A heading is a line the declared `heading` pattern matches: its `code` group names the 目 among the 目 rows of
  the tables printed before it (the latest first), and its `name` group, when it has one, the 目's name (a heading
  with no `code` names the 目 by its name only: 港湾局 `①職員費`, a running number). The heading
  is no item: its digits are an excluded region (本文). With no `heading` declared, each table is a card of one 目
  (選挙管理委員会: `款 項 目 | 本年度 …` over each 目), and the lines under it explain its last 目.
- The lines of an explanation before its first item (the declared `item` pattern) say what the 目 is for, and may
  print the 目's amount again (`こども家庭局所属職員の給料、職員手当等の経費 15,023,070 千円`): no item; their
  digits are an excluded region (本文). A 目 whose explanation holds no item keeps no 説明.
- A line the declared `skip` pattern matches is a note in an explanation, no item (`（別途 令和８年２月補正予算
  1,297,400千円）`, an amount of another budget; `（項） ２ 環境保全費 1,761,529 千円`, the 項's amount again): its
  digits are an excluded region (本文).
- The titles over a table (`第４款`, `第１項`, `（単位：千円）`, `(3) 歳出予算の説明`) and a page's number are no
  explanation.
- A lone Latin letter in the subject cells of a table is a glyph the page does not show (行政委員会: an `I` 14.3pt
  tall left of each 目's number, under the 項's rule), not a letter of the 目's name: it is left off.
"""
import math
import re
import unicodedata
from dataclasses import dataclass, field

from ingestion.generic import layout
from ingestion.generic.layout import Glyph, is_amount
from ingestion.generic.observe import Page, Rule, Word
from ingestion.generic.patterns.layout import running_titles as rt

LINE = 2.5
LONG = 60.0  # points: a frame's side is at least this long (a glyph's stroke read as a rule is not; a table of a 款, a 項 and one 目 is 92 long, 経済観光局)
REACH = 3.0
PITCH = 15.0
GAP = 4.0
STROKE = 8.0
COLUMN_GAP = 20.0  # points: the gap before the second column of items
SIGN_GAP = 12.0  # points: a minus sign stands this close before its amount
COLUMN_RULE = 45.0  # points: over the 40 a vertical rule needs to be a column's edge (`layout._frames`)
HEAD = 80.0  # points: a table's header stands this far under its top
OVER = 45.0  # points: the titles of a table stand this close over its top
MARGIN = 20.0
TITLE = re.compile(r'^(第[0-9]+[款項]|[（(][0-9]+[款項][)）]|[（(]?単位|.{0,5}歳[入出]予算の説明(?:[（(][^）)]*[）)])?$)')  # 健康局 R7: `(3) 歳出予算の説明（ は新規事業を示す。）`
END = re.compile(r'^[（(]?[0-9０-９]*[)）.．]?\s*債務負担行為')  # the section after the 歳出 (`４ 債務負担行為`), not a line that names one
AMOUNT = re.compile(r'[0-9],[0-9]{3}|[0-9]千円')
SUBJECT_HEAD = re.compile(r'(?:款|科目)(.*?)(?:本年度|(?:令和)?[0-9０-９]+年度)')  # the subject cells, then the first amount column's
STRAY = re.compile(r'[A-Za-z]')  # a lone Latin letter in the subject cells (no 款・項・目 name is one)
FOLIO = re.compile(r'^-?[0-9]+-?$')
HEADING_REASON = '局別の予算説明書で目の説明の見出し（目の番号と名前、目の金額）。目の行で読み取り済み。'
SKIP_REASON = '局別の予算説明書で説明の中の注記（「（別途 令和８年２月補正予算 1,297,400千円）」、款・項の金額の再掲など、項目でない金額）。'
OTHER_REASON = '局別の予算説明書で歳出の款・項・目でない表（同じ頁の歳入予算の説明の表、地方債の調書など）。'
REPEAT_REASON = '局別の予算説明書で同じ頁の2つ目の表が印字し直した款・項の行（金額は1つ目の表の行で読み取り済み）。'
ORPHAN_REASON = '局別の予算説明書で目の見出しの無い表の説明（「議会費の説明」「繰出金の説明」など、目ごとの金額の再掲）。項目ではない。'
PURPOSE_REASON = '局別の予算説明書で目の説明の書き出し（目の目的の文と、目の金額の再掲）。項目ではない。'


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


def text(line: list[Word]) -> str:
    return norm(''.join(w.text for w in line))


@dataclass
class Frame:
    page: int
    left: float
    right: float
    top: float
    bottom: float
    rows: list[float]  # full horizontal rules
    inner: float  # the left edge of the 目 level's column
    amounts: float  # the left edge of the first amount column
    drawn: float  # how long the 目 level's column rule is drawn
    subjects: list = field(default_factory=list)  # (code, name, bottom rule of its row)


def joined(rules: list[Rule]) -> list[Rule]:
    """Vertical rules with the pieces of one rule (drawn apart at a row, `合計`) joined."""
    result: list[Rule] = []
    for rule in sorted(rules, key=lambda r: (round(r.x0), r.y0)):
        last = result[-1] if result else None
        if last is not None and abs(last.x0 - rule.x0) <= 1 and rule.y0 - last.y1 <= 2 * REACH:
            result[-1] = Rule(last.x0, last.y0, last.x1, max(last.y1, rule.y1))
        else:
            result.append(rule)
    return result


def frames(page: Page, others: list | None = None) -> list[Frame]:
    """The ruled tables of the 款・項・目 on the page, top to bottom; the other tables go to `others`."""
    sides = sorted((r for r in page.rules if r.vertical and r.y1 - r.y0 >= LONG), key=lambda r: (r.y0, r.x0))
    found: list[Frame] = []
    for rule in sides:
        if any(f.top - REACH <= rule.y0 <= f.bottom + REACH for f in found):
            continue
        group = [r for r in sides if abs(r.y0 - rule.y0) <= REACH or (rule.y0 - REACH <= r.y0 <= rule.y1)]
        left, right = min(r.x0 for r in group), max(r.x0 for r in group)
        top = min(r.y0 for r in group)
        bottom = max(r.y1 for r in group)
        # A frame whose outer edges are drawn as rectangles too wide to be read as rules (教育委員会: 2pt) ends where
        # its row rules end: the edges are drawn again on the laid-out page (`edges`).
        across = [r for r in page.rules if not r.vertical and top - REACH <= r.y0 <= bottom + REACH and r.x1 - r.x0 >= LONG]
        left = min([left, *(r.x0 for r in across)])
        right = max([right, *(r.x1 for r in across)])
        rows = sorted(r.y0 for r in page.rules if not r.vertical and top - REACH <= r.y0 <= bottom + REACH
                      and r.x1 >= right - REACH and r.x1 - r.x0 > (right - left) / 3)
        verticals = joined([r for r in page.rules if r.vertical and left + REACH < r.x0 < right - REACH
                            and r.y1 > top and r.y0 < bottom and r.y1 - r.y0 >= STROKE])
        full = sorted(r.x0 for r in verticals if r.y0 <= top + REACH and r.y1 - r.y0 >= (bottom - top) * .8)
        amounts = full[0] if full else right
        staircase = [r for r in verticals if r.x0 < amounts - REACH and r.y0 > top + REACH]
        inner = max((r.x0 for r in staircase), default=left)
        drawn = sum(r.y1 - r.y0 for r in staircase if abs(r.x0 - inner) <= 1)
        head = ''.join(text(line) for line in lines([w for w in page.words
                                                     if top <= (w.y0 + w.y1) / 2 <= top + HEAD and left <= w.x0 <= right]))
        frame = Frame(page.number, left, right, top, bottom, rows, inner, amounts, drawn)
        columns = SUBJECT_HEAD.search(head)
        # (a 歳入 table names 節 before the year, `款 項 目 節`; a table of the 債務負担行為, `事項名 期間 限度額`, no 款)
        if columns and '節' not in columns.group(1):
            found.append(frame)
        elif others is not None:
            others.append(frame)
    return found


def edges(frame: Frame, rules: list[Rule], top: float, bottom: float, end: float) -> list[Rule]:
    """The frame's outer rules the page does not draw as rules: its left side, its top and bottom (the right side is
    the 説明 column's left)."""
    near = lambda r, vertical, at: r.vertical == vertical and abs((r.x0 if vertical else r.y0) - at) <= REACH \
        and ((r.y1 - r.y0) if vertical else (r.x1 - r.x0)) >= LONG
    added = []
    if not any(near(r, True, frame.left) for r in rules):
        added.append(Rule(frame.left, top, frame.left, bottom))
    if not any(near(r, True, frame.right) for r in rules):
        added.append(Rule(frame.right, top, frame.right, bottom))
    if not any(near(r, False, frame.top) for r in rules):
        added.append(Rule(frame.left, top, end, top))
    if not any(near(r, False, frame.bottom) for r in rules):
        added.append(Rule(frame.left, bottom, end, bottom))
    return added


def inside(frame: Frame, word: Word) -> bool:
    middle = (word.y0 + word.y1) / 2
    return frame.top - REACH <= middle <= frame.bottom + REACH and frame.left - REACH <= (word.x0 + word.x1) / 2 <= frame.right + REACH


def subject_rows(frame: Frame, words: list[Word]) -> None:
    """The 目 rows of the frame: a line whose first word starts in the 目 level's column with a code; with the
    row's name (its words left of the amounts between the rules above and below it, the code taken off)."""
    body = [w for w in words if inside(frame, w) and frame.left - REACH <= w.x0 < frame.amounts]
    for line in lines(body):
        first = line[0]
        found = re.match(r'[0-9]+', norm(first.text))
        if not found or first.x0 < frame.inner - REACH:
            # (a 項's code may stand right in its cell, over the 目 column's edge: such a row is a candidate too, and
            # the explanation names the row it explains)
            continue
        middle = (first.y0 + first.y1) / 2
        below = next((y for y in frame.rows if y > middle), frame.bottom)
        above = max((y for y in frame.rows if y < middle), default=frame.top)
        cell = [w for w in body if above < (w.y0 + w.y1) / 2 < below and w.x0 >= frame.inner - REACH]
        name = ''.join(norm(w.text)[len(found.group()):] if w is first else norm(w.text)
                       for row in lines(cell) for w in row)
        frame.subjects.append((int(found.group()), name, below))


@dataclass
class Block:
    heading: list[Word]
    page: int
    code: int | None  # None: the heading names the 目 by its name only (港湾局 `①職員費`, a running number)
    name: str | None  # the 目's name the heading prints (None: the heading names it by its code only)
    frame: 'Frame | None' = None  # no heading declared: the table the explanation follows, whose last 目 it explains
    lines: list[tuple[int, list[Word]]] = field(default_factory=list)  # (page, words)


def explanations(pages: list[Page], found: dict[int, list[Frame]], heading: re.Pattern | None,
                 skip: re.Pattern | None = None, others: dict[int, list[Frame]] | None = None) -> tuple[list, list, list, list]:
    """The explanation lines of the pages in reading order, cut into blocks at each heading: blocks, the lines
    before the first heading (an error unless none), the lines `skip` matches, and the lines under a table no
    heading follows (orphans)."""
    blocks: list[Block] = []
    loose, skipped, orphans = [], [], []
    ended = False
    latest = None  # the last table read before the line
    for page in pages:
        ended = ended and not found.get(page.number)
        tables = [*found.get(page.number, ()), *(others or {}).get(page.number, ())]
        free = [w for w in page.words if not any(inside(f, w) for f in tables)]
        for line in lines(free):
            value = text(line)
            if any(f.top > line[0].y1 for f in found.get(page.number, ())):
                ended = False  # a table further down the page opens a 項 again
            if END.search(value):
                ended = True
            if ended or TITLE.match(value) or (FOLIO.match(value) and line[0].y0 > page.height - 80):
                continue
            if any(0 <= f.top - line[0].y1 < OVER for f in tables) and not AMOUNT.search(value):
                continue  # a table's title (`小 学 校 費`, `（単位 千円）`); an item's line prints its amount
            if skip is not None and skip.match(value):
                skipped.append((page.number, line))
                continue
            above = [f for f in found.get(page.number, ()) if f.bottom < line[0].y0]
            latest = above[-1] if above else latest
            if heading is None:
                # each table is a card of its last 目, explained by the lines under it (選挙管理委員会)
                if latest is not None and latest.subjects and (not blocks or blocks[-1].frame is not latest):
                    code, name, _ = latest.subjects[-1]
                    blocks.append(Block([], page.number, code, name, latest))
                if blocks:
                    blocks[-1].lines.append((page.number, line))
                else:
                    loose.append((page.number, value))
                continue
            matched = heading.match(value)
            opened = (blocks[-1].page, blocks[-1].heading[0].y0) if blocks else (0, 0.0)
            if not matched and latest is not None and (latest.page, latest.top) > opened:
                # under a table no heading of whose 目 follows (行財政局 `議会費の説明` / `○ 議員の報酬、… 1,210,831
                # 千円`, a line per 目): the 目's amounts again, no item
                orphans.append((page.number, line))
                continue
            if matched:
                name = matched.groupdict().get('name')
                words = line
                if name == '' and blocks and blocks[-1].lines and blocks[-1].lines[-1][0] == page.number \
                        and not re.search(r'[0-9]', text(blocks[-1].lines[-1][1])):
                    # a 目's name wrapped around the line of its code (`特別支援学校` / `4 本目は、…` / `建 設 費`):
                    # the line above is the heading's
                    words = blocks[-1].lines.pop()[1] + line
                code = matched.groupdict().get('code')
                blocks.append(Block(words, page.number, int(code) if code else None, norm(name) if name else None))
            elif blocks:
                blocks[-1].lines.append((page.number, line))
            else:
                loose.append((page.number, value))
        # the last table of the page is before every line of the next (a table that runs to the foot of its page)
        latest = (found.get(page.number) or [latest])[-1]
    return blocks, loose, skipped, orphans


@dataclass
class Placed:
    words: list[Word] = field(default_factory=list)
    rules: list[Rule] = field(default_factory=list)
    shifts: list = field(default_factory=list)  # (synthetic box, dx, printed box, printed page)

    def put(self, word: Word, page: int, x0: float, y0: float) -> None:
        moved = Word(word.text, x0, y0, x0 + (word.x1 - word.x0), y0 + (word.y1 - word.y0))
        self.words.append(moved)
        self.shifts.append(((moved.x0, moved.y0, moved.x1, moved.y1), x0 - word.x0,
                            (word.x0, word.y0, word.x1, word.y1), page))


def side_by_side(rows: list[tuple[int, list[Word]]], item: re.Pattern) -> list[tuple[int, list[tuple[Word, float]]]]:
    """The lines of an explanation, each word with its x from the left edge of its column. Items printed in two
    columns (`１ 投票所経費 17,884 千円 ６ 不在者・期日前投票経費 14,449 千円`, 選挙管理委員会) are read down the left
    column, then down the right one: the right column starts at an item that follows an amount on its line."""
    starts = []
    for _, line in rows:
        for before, word in zip(line, line[1:]):
            if norm(before.text).endswith('千円') and word.x0 - before.x1 > COLUMN_GAP \
                    and item.match(text(line[line.index(word):])):
                starts.append(word.x0)
    split = min(starts) - REACH if starts else math.inf
    result = []
    for first in (True, False):
        half = [(page, [w for w in line if (w.x0 < split) == first]) for page, line in rows]
        half = [(page, line) for page, line in half if line]
        left = min((w.x0 for _, line in half for w in line), default=0.0)
        result += wrapped_around([(page, [(w, w.x0 - left) for w in line]) for page, line in half], item)
    return result


def wrapped_around(rows: list, item: re.Pattern) -> list:
    """An item whose name wraps around the line of its number and amount (`明るい選挙推進協議会` / `５ 730 千円` /
    `運営等経費`): the lines above and below are its name, laid out on its line between the number and the amount."""
    result = list(rows)
    index = 1
    while index < len(result) - 1:
        page, pairs = result[index]
        words = sorted((w for w, _ in pairs), key=lambda w: w.x0)
        above, below = result[index - 1], result[index + 1]
        plain = lambda row: row[0] == page and not re.search(r'[0-9]', text([w for w, _ in row[1]]))
        bare = len(words) > 1 and item.match(norm(words[0].text) + '　') and all(
            is_amount(norm(w.text).removesuffix('千円')) or norm(w.text) == '千円' for w in words[1:])
        if bare and plain(above) and plain(below):
            number, tail = words[:1], words[1:]
            x = max(dx + (w.x1 - w.x0) for w, dx in pairs if w in number) + COLUMN_GAP / 2
            laid = [(w, dx) for w, dx in pairs if w in number]
            for w, _ in above[1] + below[1]:
                laid.append((w, x)); x += w.x1 - w.x0
            x += COLUMN_GAP
            for w in tail:
                laid.append((w, x)); x += w.x1 - w.x0 + REACH
            result[index - 1:index + 2] = [(page, laid)]
        index += 1
    return result


def signed(words: list[Word]) -> list[Word]:
    """`△ 2,499` (教育委員会): a minus sign set apart from its amount is one word with it. The tree would join them
    after the words are laid out, and the joined word would lose the place where it is printed."""
    result: list[Word] = []
    for word in sorted(words, key=lambda w: (round((w.y0 + w.y1) / 2), w.x0)):
        last = result[-1] if result else None
        if (last is not None and last.text in ('△', '▲') and is_amount(word.text) and 0 <= word.x0 - last.x1 < SIGN_GAP
                and abs((last.y0 + last.y1) / 2 - (word.y0 + word.y1) / 2) < LINE):
            result[-1] = Word(last.text + word.text, last.x0, min(last.y0, word.y0), word.x1, max(last.y1, word.y1))
        else:
            result.append(word)
    return result


def carry(glyph: Glyph, shifts: list) -> Glyph:
    cx, cy = (glyph.x0 + glyph.x1) / 2, (glyph.y0 + glyph.y1) / 2
    for (x0, y0, x1, y1), dx, printed, page in shifts:
        if x0 - 0.01 <= cx <= x1 + 0.01 and y0 - 0.01 <= cy <= y1 + 0.01:
            if (y0, y1) == (printed[1], printed[3]) and page == glyph.page:
                return Glyph(glyph.text, glyph.x0, glyph.y0, glyph.x1, glyph.y1, glyph.page, glyph.offset + dx)
            return rt.Carried(glyph.text, glyph.x0, glyph.y0, glyph.x1, glyph.y1, page, glyph.offset,
                              (glyph.x0 - dx, printed[1] + (glyph.y0 - y0), glyph.x1 - dx, printed[3] + (glyph.y1 - y1)))
    return glyph


def region(page: int, words: list[Word], reason: str) -> dict:
    return {'kind': '本文', 'reason': reason, 'page': page,
            'bbox': [min(w.x0 for w in words) - 1, min(w.y0 for w in words) - 1,
                     max(w.x1 for w in words) + 1, max(w.y1 for w in words) + 1]}


def read(pages, *, header: dict | None = None, **options):
    spec = (header or {}).get('explanations') or {}
    heading = re.compile(spec['heading']) if spec.get('heading') else None
    item = re.compile(spec['item'])
    if heading is not None and not {'code', 'name'} & set(heading.groupindex):
        raise ValueError('header.explanations.heading names its 目 by a code or a name group')
    skip = re.compile(spec['skip']) if spec.get('skip') else None
    for page in pages:
        # On the observed page itself: digit coverage reads the same words (`runtime.run_pages`).
        page.words = signed(rt.join_full_width(page.words))
    others = {page.number: [] for page in pages}
    found = {page.number: frames(page, others[page.number]) for page in pages}
    for page in pages:
        page.words = [w for w in page.words if not (STRAY.fullmatch(w.text) and any(
            inside(frame, w) and w.x1 < frame.amounts for frame in found[page.number]))]
        for frame in found[page.number]:
            subject_rows(frame, page.words)
    blocks, loose, skipped, orphans = explanations(pages, found, heading, skip, others)
    if loose:
        raise ValueError(f'Explanation lines before any heading: p{loose[0][0]} {loose[0][1]!r}')
    ordered = [frame for page in pages for frame in found[page.number]]
    excluded: dict[int, list[dict]] = {}
    for page in pages:
        for frame in others[page.number]:
            words = [w for w in page.words if inside(frame, w)]
            if any(re.search(r'[0-9]', w.text) for w in words):
                excluded.setdefault(page.number, []).append(region(page.number, words, OTHER_REASON))
    for page, line in skipped:
        if re.search(r'[0-9]', text(line)):
            excluded.setdefault(page, []).append(region(page, line, SKIP_REASON))
    for page, line in orphans:
        if item.match(text(line)):  # an item under a heading the pattern missed would be dropped with no trace
            raise ValueError(f'An item under no heading: p{page} {text(line)!r}')
        if re.search(r'[0-9]', text(line)):
            excluded.setdefault(page, []).append(region(page, line, ORPHAN_REASON))
    inserts: dict[int, list] = {}  # table page → (bottom rule of the 目 row, lines)
    for block in blocks:
        if block.heading:
            excluded.setdefault(block.page, []).append(region(block.page, block.heading, HEADING_REASON))
        start = next((i for i, (_, line) in enumerate(block.lines) if item.match(text(line))), len(block.lines))
        for page, line in block.lines[:start]:
            if re.search(r'[0-9０-９]', text(line)):
                excluded.setdefault(page, []).append(region(page, line, PURPOSE_REASON))
        if start == len(block.lines):
            continue
        rows = side_by_side(block.lines[start:], item)
        before = [f for f in ordered if block.heading and (f.page, f.top) < (block.page, block.heading[0].y0)]
        target = (block.frame, block.frame.subjects[-1][2]) if block.frame is not None else next(
            ((f, bottom) for f in reversed(before) for code, name, bottom in reversed(f.subjects)
             if block.code in (None, code) and (block.name is None or name == block.name)), None)
        if target is None:
            raise ValueError(f'No 目 {block.code} for the explanation on p{block.page}: {text(block.heading)!r}')
        frame, bottom = target
        if any(f is frame and b == bottom for f, b, _ in inserts.get(frame.page, ())):
            raise ValueError(f'Two explanations for one 目 row: p{block.page} {text(block.heading)!r}')
        inserts.setdefault(frame.page, []).append((frame, bottom, rows))
    synthetic, shifts_by_page = [], {}
    for page in pages:
        if not found[page.number]:
            continue
        placed = Placed()
        # A table under another on the page prints its 款 (and 項) row again, amounts and all (市場事業費: `1 事業費
        # 9,298,327 …` over each 項). The layout reads the tables of a page as one frame, so the row would print one
        # node's amounts twice: it is left off, and its digits are an excluded region.
        printed, repeated = set(), set()
        for frame in found[page.number]:
            rows = [line for line in lines([w for w in page.words if inside(frame, w)])
                    if line[0].x1 < frame.inner - REACH and re.match(r'[0-9]', text(line)) and AMOUNT.search(text(line))]
            for line in rows:
                if text(line) in printed:  # (in a table above: a 項 row of a table may print what its 款 row does)
                    repeated.update(id(w) for w in line)
                    excluded.setdefault(page.number, []).append(region(page.number, line, REPEAT_REASON))
            printed.update(text(line) for line in rows)
        listed = {id(w) for block in blocks for number, line in [(block.page, block.heading), *block.lines]
                  if number == page.number for w in line}
        moves = [(bottom, PITCH * len(rows) + 2 * GAP) for _, bottom, rows in inserts.get(page.number, ())]
        for frame in found[page.number]:
            # The layout takes a column rule drawn shorter than `layout.COLUMN_RULE` for none: a 目 column of one
            # row with no explanation (`14 教育施設整備費` / `1 教育施設整備費`) is drawn as long as that.
            grown = frame.drawn + sum(d for at, d in moves if frame.top < at <= frame.bottom + REACH)
            if frame.subjects and 0 < grown < COLUMN_RULE:
                moves.append((frame.subjects[-1][2], COLUMN_RULE - grown))
        moves.sort()

        def down(y: float, rule: bool = False) -> float:
            return y + sum(d for at, d in moves if (at <= y + REACH if rule else at < y - 0.5))

        width = max((max(dx + w.x1 - w.x0 for _, pairs in rows for w, dx in pairs)
                     for _, _, rows in inserts.get(page.number, ())), default=60.0)
        start = page.width + MARGIN
        end = start + width + MARGIN
        # the titles over a frame (the lines between it and the explanation or the frame above it); a title the
        # explanation prints again under the frame (`第２款 総務費` over `第１目 職員費`) is none
        titles = set()
        for line in lines([w for w in page.words if not any(inside(f, w) for f in found[page.number])]):
            under = [f for f in found[page.number] if f.top > line[0].y1]
            # (the layout reads tables stacked on a page as one frame: a title between two is none, or it reads as a row)
            over = any(f.bottom < line[0].y0 for f in found[page.number])
            if under and not over and not any(id(w) in listed for w in line) and min(f.top for f in under) - line[0].y1 < OVER:
                titles.update(id(w) for w in line)
        for word in page.words:
            middle = (word.y0 + word.y1) / 2
            if id(word) in titles or (id(word) not in repeated and any(inside(f, word) for f in found[page.number])):
                if norm(word.text) == '科' and any(inside(f, word) and word.x1 < f.amounts and middle < f.top + HEAD
                                                    for f in found[page.number]):
                    # the header cell `科 目` over the code columns (会計室) names 款・項・目, as `款 項 目` does
                    word = Word('款項', word.x0, word.y0, word.x1, word.y1)
                placed.put(word, page.number, word.x0, word.y0 + down(middle) - middle)
        for rule in page.rules:
            framed = next((f for f in found[page.number] if f.top - REACH <= rule.y0 <= f.bottom + REACH
                           and f.left - REACH <= rule.x0 <= f.right + REACH), None)
            if framed is None or max(rule.x1 - rule.x0, rule.y1 - rule.y0) < STROKE:
                continue  # (a glyph's stroke read as a rule: `ー` in a name)
            if rule.vertical:
                placed.rules.append(Rule(rule.x0, down(rule.y0, True), rule.x1, down(rule.y1, True)))
            else:
                x1 = end if rule.x0 <= framed.left + REACH and rule.x1 >= framed.right - REACH else rule.x1
                placed.rules.append(Rule(rule.x0, down(rule.y0, True), x1, down(rule.y0, True)))
        for frame in found[page.number]:
            top, bottom = down(frame.top, True), down(frame.bottom, True)
            placed.rules.append(Rule(end, top, end, bottom))
            placed.rules.extend(edges(frame, page.rules, top, bottom, end))
            heads = [y for y in frame.rows if y > frame.top + REACH]
            label = down(heads[0], True) if heads else top + 20
            placed.words.append(Word('説明', start + 10, (top + label) / 2 - 5, start + 30, (top + label) / 2 + 5))
        for frame, bottom, rows in inserts.get(page.number, ()):
            y = down(bottom, True) - PITCH * len(rows) - GAP
            for printed, pairs in rows:
                tall = max(w.y1 - w.y0 for w, _ in pairs)
                for word, dx in pairs:  # on one baseline (a name wrapped around its line is laid out on it)
                    placed.put(word, printed, start + dx, y + tall - (word.y1 - word.y0))
                y += PITCH
        synthetic.append(Page(page.number, end + MARGIN, max(page.height, max((r.y1 for r in placed.rules), default=0) + 40),
                              placed.words, placed.rules))
        shifts_by_page[page.number] = placed.shifts
    logicals = layout.logical_pages(synthetic, header=header, **options)
    for logical in logicals:
        for band in logical.bands:
            # `442,100 千円`: the unit after each amount of the explanation, as `running_titles` reads it
            words = rt.rejoin_total_tails(rt.join_split_yen(rt.split_glued_yen(rt.drop_units(band.words))))
            band.words = [carry(g, shifts_by_page.get(band.page, ())) for g in words]
        logical.outside = [carry(g, shifts_by_page.get(g.page, ())) for g in logical.outside]
    for number, regions in excluded.items():
        owner = next((l for l in logicals if number in l.pages), None) or next(
            (l for l in reversed(logicals) if l.pages and min(l.pages) <= number), None) or (logicals or [None])[0]
        if owner is None:
            raise ValueError(f'No table of 款・項・目 to hold the excluded regions of p{number}')
        owner.excluded.extend(regions)
    return logicals
