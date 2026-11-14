"""A scan of single pages whose header OCR reads differently on every page (東京都の予算説明書).

Each page prints one frame: the narrow 款・項 columns and the 目 column under one cell `科目`, 本年度予算額・前年度予算額・
比較増減・本年度の財源内訳, the 節 (区分 and 金額 under one cell `節（細節）`) and the 計上説明. The rules of the header are
read in pieces: the header's bottom rule is not drawn under the 款・項 cells, which run down from it, and on a page
that opens a 款 it is read with gaps, so the header runs down to the next rule across the frame and takes the rows with
it. The rules between the header cells are read short on some pages, and a heading runs over two columns (`項目`,
`節（細節）／計上説明`). Every page prints the same headings over the same columns, so they are not read: the body's
column rules (drawn down the whole frame) place the columns, and the header, the same height on every page, is drawn
again from them with the headings of its columns. A page whose rules do not fit the columns is read as printed.
"""
import re
from itertools import pairwise

from ingestion.generic import layout, mixed
from ingestion.generic.observe import Page, Rule, Word

HEADER = 46.5   # pt: the header's height under the frame's top rule
TALL = 25.0     # pt: a vertical rule this tall is a column's (a page that ends after one short row has no longer ones)
NEAR = 4.0      # pt: a rule read this close to a column's place is that column's
LONG = 300.0    # pt: a horizontal rule this long is the frame's top or foot
LINE = 10.0     # pt: the least pitch of the 説明's lines
SURE = 8        # inner and side rules read in place that tell the page's columns

# The headings as the shared dictionary names them: the print's `節（細節）` is the 節 axis, its `計上説明` the 説明.
HEADINGS = ('款', '項', '目', '本年度予算額', '前年度予算額', '比較増減', '本年度の財源内訳', '区分', '金額', '説明')
# The columns' rules, from the frame's left side (pt).
PLACES = (0, 10.5, 19.8, 88.0, 157.2, 227.2, 296.8, 371.0, 432.2, 502.0, 781.2)
SPANNING = (('科目', 0, 3), ('節', 7, 9))  # cells over columns in the header's upper half: heading, first, end


def verticals(page: Page) -> list[float]:
    """The x of each vertical rule read below the header, pieces of one rule together."""
    xs: list[list[float]] = []
    for x in sorted(r.x0 for r in page.rules if r.vertical and r.y1 - r.y0 >= TALL):
        if xs and x - xs[-1][-1] <= NEAR / 2:
            xs[-1].append(x)
        else:
            xs.append([x])
    return [sum(group) / len(group) for group in xs]


def fit(xs: list[float]) -> tuple[int, float]:
    """How many of the columns' rules are read in place, and the left side's x, at the best shift that reads both sides."""
    best = (0, 0.0)
    for x in xs:
        shift = x - PLACES[0]
        hits = [next(y for y in xs if abs(y - shift - p) <= NEAR) - p for p in PLACES
                if any(abs(y - shift - p) <= NEAR for y in xs)]
        ends = all(any(abs(y - shift - p) <= NEAR for y in xs) for p in (PLACES[0], PLACES[-1]))
        if ends and len(hits) > best[0]:
            best = (len(hits), sum(hits) / len(hits))
    return best


def word(text: str, x0: float, x1: float, middle: float) -> Word:
    return Word(text, x0 + 1, middle - 4, x1 - 1, middle + 4)


# An item number of the 説明 as it opens a line: `3`, `3 管理費`, `(3)`, `(3) 人件費`.
ITEM = re.compile(r'([(（]?)([0-9]{1,2})([)）]?)(?=\s|$|[^0-9,.])')
LETTERED = re.compile(r'[アイウエオカキクケコサシスセソタチツテト了](?![ァ-ヶー])')
WIDE = 168.0    # pt: a name line reaching this far right of the 説明's rule is full, and its name goes on the next line


def stacked(words: list[Word], x0: float, x1: float) -> list[Word]:
    """The 説明's item numbers printed one under another (`2` `3` `4` `5`, `(2)` … `(5)`), read as one tall word
    (`2,345`, `四`, `5四`), as pieces of it, or not at all.

    Between two numbers read at one place (`(1)` and `(6)`), the items are the names that start under the first
    one's name, but a line that goes on a full line above it (a wrapped name). When they are as many as the numbers
    between, each gets its number, and what was read at the numbers' place between is the numbers' ink. A list that
    ends at a number of another level is numbered on over its names but the wrapped lines (the tree check holds the
    count there). A tall figure with a digit for each name beside it is those numbers, with or without a number read
    around it. A list that comes over from the page before is numbered back from the number that ends it."""
    # (a tall figure with a digit for each name beside it: `2,345` over four names is `2` … `5`)
    split = []
    for w in words:
        digits = w.text.replace(',', '')
        beside = sorted((n for n in words if w.x1 - 1 <= n.x0 <= w.x1 + 16 and w.y0 < (n.y0 + n.y1) / 2 < w.y1),
                        key=lambda n: n.y0)
        if (x0 < w.x0 < x0 + 30 and w.x1 - w.x0 <= 18 and digits.isdigit()
                and len(beside) == len(digits)
                and (len(digits) >= 2 or w.y1 - w.y0 > 1.2 * (beside[0].y1 - beside[0].y0))):
            # (one number read taller than its line runs into the next line: it is its own line's. The numbers take
            # the brackets of the number printed above them at their place)
            above = max((n for n in words if abs(n.x0 - w.x0) <= 4 and n.y1 <= w.y0 + 8 and n is not w
                         and ITEM.match(n.text)), key=lambda n: n.y0, default=None)
            mark = (lambda d: f'({d})') if above is not None and above.text[:1] in '(（' else str
            split += [Word(mark(d), w.x0, n.y0, w.x0 + 12, n.y1) for d, n in zip(digits, beside)]
        else:
            split.append(w)
    words = split

    def item(w: Word):
        found = ITEM.match(w.text)
        return found if found and bool(found.group(1)) == bool(found.group(3)) and x0 < w.x0 < x0 + 30 else None
    anchors = sorted((w for w in words if item(w)), key=lambda w: w.y0)
    dropped: set[int] = set()
    added: list[Word] = []
    # (a list that comes over from the page before: its names open the page with their numbers left unread, the
    # stacked numbers' ink read as nothing, and are numbered back from the number that ends it. Nothing of the
    # 説明 is printed above them, and none of them is an item of the level under)
    for end in anchors[:1]:
        last = int(item(end).group(2))
        lines = sorted((n for n in words if end.x0 + 9 <= n.x0 <= end.x0 + 24 and n.x1 - n.x0 > 16
                        and (n.y0 + n.y1) / 2 < end.y0 - 2), key=lambda n: n.y0)
        if (not lines or last - len(lines) < 1 or any(LETTERED.match(n.text) for n in lines)
                or any(x0 < w.x0 < x0 + 60 and w.y1 <= lines[0].y0 + 2 for w in words)):
            continue
        mark = (lambda n: f'({n})') if item(end).group(1) else str
        added += [Word(mark(last - len(lines) + i), end.x0, n.y0, end.x0 + 12, n.y1) for i, n in enumerate(lines)]
    for upper in anchors:
        if id(upper) in dropped:
            continue  # (a number's ink of a run above, `3` for `(3)`)
        style = bool(item(upper).group(1))
        # The run ends at the next number of its list, or at a number printed at another place (another level: the
        # list ends there, and how many items it has is not read).
        end = next((w for w in anchors if w.y0 > upper.y1 - 2 and (
            abs(w.x0 - upper.x0) > 4 or bool(item(w).group(1)) == style)), None)
        closed = end is not None and abs(end.x0 - upper.x0) <= 4
        bottom = end.y0 if end is not None else max(w.y1 for w in words)
        first = int(item(upper).group(2))
        lines = sorted((w for w in words if upper.x0 + 9 <= w.x0 <= upper.x0 + 24 and w.x1 - w.x0 > 16
                        and upper.y1 - 2 < (w.y0 + w.y1) / 2 < bottom + 2), key=lambda w: w.y0)
        if not lines:
            continue
        # (the name's own word: a figure printed after it, a count or an amount, is no part of the name)
        reach = max(w.x1 for w in words if abs((w.y0 + w.y1) / 2 - (upper.y0 + upper.y1) / 2) <= 3
                    and upper.x0 <= w.x0 <= upper.x0 + 24)
        items = []
        for line in lines:
            if reach < x0 + WIDE:
                items.append(line)
            reach = line.x1
        if not closed:
            # (an item of the level under, `ア 人件費` (OCR: `了`), opens a list of its own: the run ends there)
            lettered = next((i for i, line in enumerate(items) if LETTERED.match(line.text)), None)
            items = items[:lettered] if lettered is not None else items
            if not items:
                continue
            bottom = min(bottom, items[-1].y1 + 1) if lettered is not None else bottom
        if closed:
            # (a name that fills its line may end there: every line is an item when that makes the count)
            last = int(item(end).group(2))
            items = next((found for found in (lines, items) if len(found) == last - first - 1), None)
            if items is None:
                continue
        dropped.update(id(w) for w in words if abs(w.x0 - upper.x0) <= 4 and w.x1 - w.x0 <= 16
                       and upper.y1 - 2 < (w.y0 + w.y1) / 2 < bottom + 2)
        mark = (lambda n: f'({n})') if style else str
        added += [Word(mark(first + 1 + i), upper.x0, w.y0, upper.x0 + 12, w.y1) for i, w in enumerate(items)]
    return [w for w in words if id(w) not in dropped] + added


KANA = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワ'


def lettered(words: list[Word], x0: float, x1: float) -> list[Word]:
    """A 説明 item lettered in katakana with its name glued on (`イその他職員関係費`), set apart from the name (`イ その他…`)
    when the letter before it opens a line at its place (`ア 人件費`): read whole, its name starting with hiragana
    hides the letter."""
    out = []
    for w in words:
        letter = w.text[:1]
        index = KANA.find(letter)
        if (x0 < w.x0 < x1 and index > 0 and len(w.text) > 1 and not re.match(r'[ァ-ヶー\s]', w.text[1])
                and any(abs(o.x0 - w.x0) <= 3 and o.text.startswith(KANA[index - 1]) and o.y1 <= w.y0 + 1 for o in words)):
            w = Word(f'{letter} {w.text[1:]}', w.x0, w.y0, w.x1, w.y1)
        out.append(w)
    return out


def bracketed(words: list[Word], x0: float, x1: float) -> list[Word]:
    """A 目 the year drops, printed in brackets over lines (`(参議院議` `員選挙費ほ` `か1目)`), is one name: its lines
    are joined until the bracket closes."""
    inside = sorted((w for w in words if x0 < w.x0 < x1), key=lambda w: w.y0)
    out = [w for w in words if not x0 < w.x0 < x1]
    while inside:
        w = inside.pop(0)
        while (w.text.count('(') + w.text.count('（') > w.text.count(')') + w.text.count('）') and inside
               and inside[0].y0 - w.y1 < 4 and abs(inside[0].x0 - w.x0) <= 12):
            n = inside.pop(0)
            w = Word(w.text + n.text, min(w.x0, n.x0), w.y0, max(w.x1, n.x1), n.y1)
        out.append(w)
    return out


GLUED_FUND = re.compile(r'([0-9]{1,3}(?:,[0-9]{3})+)([0-9]{2}[^0-9,].*)')
CODED = re.compile(r'([0-9]{2})([^0-9,()（）].*)')
HALF_BRACKETED = re.compile(r'([(（]?)([0-9]{2})([)）]?)([^0-9,()（）].*)')


def setsu_lines(words: list[Word], x0: float, x1: float) -> list[Word]:
    """The 節's lines as printed. A 財源内訳 figure read on one word with the 節 beside it (`565,06504勤勉手当`) is two
    words, cut at the column rule. A 細節 prints its number in small brackets (`(04)勤勉手当`) that OCR can drop
    (`04勤勉手当`) or read one of (`03)期末手当`): a number that is not the legal number of its name is a 細節's (a 節
    is a legal one, `04` 共済費)."""
    from ingestion.generic.patterns.quirks.legal_setsu_codes import _legal, _strip
    legal: dict[int, list[str]] = {}
    for label, code in _legal().items():
        legal.setdefault(code, []).append(_strip(label))
    words = list(words)
    # (the scan cuts such a word at the rule by its share of the characters: `565,0650` `4勤勉手当`,
    # `2,024,2780` `1)普通旅費`)
    for i, w in enumerate(words):
        if x0 - 2 < w.x0 < x0 + 6 and re.fullmatch(r'[0-9][)）]?[^0-9,()（）].*', w.text):
            left = next((j for j, o in enumerate(words) if o.x1 <= x0 + 2 and o.x1 > x0 - 40
                         and abs((o.y0 + o.y1) / 2 - (w.y0 + w.y1) / 2) <= 3
                         and re.fullmatch(r'[0-9]{1,3}(?:,[0-9]{3})+', o.text)), None)
            if left is not None:
                # (the figure is regrouped as read, `5,650,650`: its digits but the last are the 財源's)
                o = words[left]
                digits = o.text.replace(',', '')
                words[left] = Word(f'{int(digits[:-1]):,}', o.x0, o.y0, o.x1, o.y1)
                words[i] = Word(digits[-1] + w.text, w.x0, w.y0, w.x1, w.y1)
    out = []
    for w in words:
        if w.x0 < x0 - 2 < w.x1 and (glued := GLUED_FUND.fullmatch(w.text)):
            out += [Word(glued.group(1), w.x0, w.y0, x0 - 1, w.y1), Word(glued.group(2), x0 + 1, w.y0, w.x1, w.y1)]
            w = out.pop()
        half = HALF_BRACKETED.fullmatch(w.text) if x0 - 2 < w.x0 < x0 + 12 else None
        if half and bool(half.group(1)) != bool(half.group(3)):  # one of the small brackets read (`03)期末手当`)
            w = Word(f'({half.group(2)}){half.group(4)}', w.x0, w.y0, w.x1, w.y1)
        if x0 - 2 < w.x0 < x0 + 12 and w.x1 <= x1 + 2 and (coded := CODED.fullmatch(w.text)):
            name = _strip(coded.group(2))
            labels = legal.get(int(coded.group(1)), [])
            if name and labels and not any(name[:2] == label[:2] for label in labels):
                w = Word(f'({coded.group(1)}){coded.group(2)}', w.x0, w.y0, w.x1, w.y1)
        out.append(w)
    return out


def frame(page: Page) -> tuple[float, list[float]] | None:
    """The frame's top and its columns' rules, or None for a page whose rules do not fit the columns."""
    long = sorted(r.y0 for r in page.rules if not r.vertical and r.x1 - r.x0 >= LONG)
    read_xs = verticals(page)
    count, left = fit(read_xs)
    if not long or count < SURE:
        return None
    return long[0], [min(read_xs, key=lambda x: abs(x - left - place))
                     if any(abs(x - left - place) <= NEAR for x in read_xs) else left + place for place in PLACES]


def carried(pages: list[Page]) -> None:
    """A 節's name the page cuts (`16公有財産購`) goes on at the top of the next page with no number (`入費`): the
    rest is put back on the name's last line (read alone, it was taken as the start of the next 節's name)."""
    before: tuple[Page, Word] | None = None
    for page in pages:
        found = frame(page)
        if found is None:
            before = None
            continue
        top, xs = found
        foot = max((r.y1 for r in page.rules if r.vertical and abs(r.x0 - xs[0]) <= NEAR / 2), default=page.height)
        column = sorted((w for w in page.words if xs[7] - 2 < w.x0 < xs[7] + 12 and top + HEADER - 1 < w.y0
                         and w.y1 < foot + 1), key=lambda w: w.y0)
        if before is not None and column and not re.search(r'[0-9(（]', column[0].text):
            other, last = before
            other.words = [Word(w.text + column[0].text, w.x0, w.y0, w.x1, w.y1) if w is last else w
                           for w in other.words]
            page.words = [w for w in page.words if w is not column[0]]
            column = column[1:]
        before = (page, column[-1]) if column else None


def drawn(page: Page) -> Page:
    found = frame(page)
    if found is None:
        return page
    top, xs = found
    line, half = top + HEADER, top + HEADER / 3
    inner = {index for _, first, end in SPANNING for index in range(first + 1, end)}
    rules = [Rule(xs[0], top, xs[-1], top), Rule(xs[0], line, xs[-1], line)]
    rules += [Rule(x, half if index in inner else top, x, line) for index, x in enumerate(xs)]
    words = []
    for heading, first, end in SPANNING:
        rules.append(Rule(xs[first], half, xs[end], half))
        words.append(word(heading, xs[first], xs[end], (top + half) / 2))
    spanned = {index for _, first, end in SPANNING for index in range(first, end)}
    for index, (heading, (x0, x1)) in enumerate(zip(HEADINGS, pairwise(xs))):
        words.append(word(heading, x0, x1, (half + line) / 2 if index in spanned else (top + line) / 2))
    inside = lambda w: xs[0] < (w.x0 + w.x1) / 2 < xs[-1] and top < (w.y0 + w.y1) / 2 < line
    kept_rules = [r for r in page.rules if not (not r.vertical and top - 1 < r.y0 < line + 1)
                  and not (r.vertical and r.y0 < line - 1 and xs[0] - 1 <= r.x0 <= xs[-1] + 1)]
    # (a column rule read from the frame's top is cut at the header's bottom: the drawn header has its own)
    kept_rules += [Rule(r.x0, line, r.x1, r.y1) for r in page.rules
                   if r.vertical and r.y0 < line - 1 < r.y1 and xs[0] - 1 <= r.x0 <= xs[-1] + 1]
    # (a column rule read in pieces a point apart is one rule, at the column's place: pieces short of a rule each)
    kept_rules = [next((Rule(x, r.y0, x, r.y1) for x in xs if abs(r.x0 - x) <= NEAR / 2), r) if r.vertical else r
                  for r in kept_rules]
    # (a row rule OCR read from the columns right of the 目 only, its piece under the 目 lost: it closes the 目's cell
    # too, unless a word runs over it there)
    def subject_above(r: Rule) -> bool:
        # (a 目 printed in the cell the rule closes: the cell is a 目's row, not the rows a page carries over)
        closing = max((o.y0 for o in kept_rules if not o.vertical and o.y0 < r.y0 - 2 and o.x0 <= xs[2] + 1),
                      default=line)
        return any(xs[2] < w.x0 < xs[3] and closing < (w.y0 + w.y1) / 2 < r.y0 for w in page.words)
    kept_rules = [Rule(xs[2], r.y0, r.x1, r.y1) if (
        not r.vertical and r.y0 > line + 1 and r.x1 - r.x0 >= LONG / 3 and xs[2] + 1 < r.x0 <= xs[9]
        and (r.x0 <= xs[3] + NEAR or subject_above(r))
        and not any(not o.vertical and abs(o.y0 - r.y0) <= 2 and o.x0 <= xs[2] + 1 for o in kept_rules)
        and not any(w.x0 < r.x0 and w.x1 > xs[2] and w.y0 < r.y0 - 3 and w.y1 > r.y0 + 3 for w in page.words)) else r
        for r in kept_rules]
    # (a row rule read in pieces on one line, its gaps under no word that runs over it: one rule)
    joined: list[Rule] = []
    rows: list[list[Rule]] = []
    for r in sorted((r for r in kept_rules if not r.vertical), key=lambda r: r.y0):
        if rows and r.y0 - rows[-1][-1].y0 <= 1:
            rows[-1].append(r)
        else:
            rows.append([r])
    for row in rows:
        pieces: list[Rule] = []
        for r in sorted(row, key=lambda r: r.x0):
            last = pieces[-1] if pieces else None
            if (last is not None and r.y0 > line + 1 and r.x0 > last.x1
                    and not any(w.x0 < r.x0 and w.x1 > last.x1 and w.y0 < r.y0 - 1 and w.y1 > r.y0 + 1
                                for w in page.words)):
                pieces[-1] = Rule(last.x0, last.y0, max(last.x1, r.x1), last.y1)
            else:
                pieces.append(r)
        joined += pieces
    kept_rules = [r for r in kept_rules if r.vertical] + joined
    # (the frame's bottom rule read in pieces a few points apart, none from side to side: it is drawn where the
    # frame's sides end)
    sides = [r.y1 for r in kept_rules if r.vertical and r.y1 - r.y0 >= LONG / 3
             and (abs(r.x0 - xs[0]) <= NEAR / 2 or abs(r.x0 - xs[-1]) <= NEAR / 2)]
    if sides:
        bottom = min(sides)
        near = lambda r: not r.vertical and abs(r.y0 - bottom) <= 4
        if not any(near(r) and r.x0 <= xs[0] + NEAR and r.x1 >= xs[-1] - NEAR for r in kept_rules):
            kept_rules = [r for r in kept_rules if not near(r)] + [Rule(xs[0], bottom, xs[-1], bottom)]
    # (the rule left of a 項 or 目 column is not drawn over a row of the level above, whose name runs over it; read in
    # pieces where row rules cross it, its gaps under no such name are the rule's)
    for index in (1, 2):
        x = xs[index]
        pieces = sorted((r for r in kept_rules if r.vertical and abs(r.x0 - x) <= NEAR / 2 and r.y1 > line + 1),
                        key=lambda r: r.y0)
        if not pieces:
            # (none read on the page: the rule runs from the row under the last name that runs over it to the foot)
            over = [w.y1 for w in page.words if w.x0 < x - 1 and w.x1 > x + 1 and w.y0 > line - 1]
            below = [h.y0 for h in kept_rules if not h.vertical and h.x0 <= x + 1 and h.x1 >= x - 1
                     and h.y0 > (max(over) if over else line - 1)]
            foot = max((r.y1 for r in kept_rules if r.vertical and abs(r.x0 - xs[0]) <= NEAR / 2), default=line)
            start = min(below) if below else None
            if start is not None and start < foot - LINE:
                kept_rules.append(Rule(x, start, x, foot))
            continue
        end = line
        for rule in pieces:
            if rule.y0 > end + 1 and not any(w.x0 < x - 1 and w.x1 > x + 1 and end < (w.y0 + w.y1) / 2 < rule.y0
                                             for w in page.words):
                kept_rules[kept_rules.index(rule)] = rule = Rule(rule.x0, end, rule.x1, rule.y1)
            end = max(end, rule.y1)
    # (the rule left of a 項 or 目 column, drawn down from the rule closing the row above it or from the header,
    # read from a little under that rule: it starts at that rule, which runs left to it)
    for index in (1, 2):
        for rule in [r for r in kept_rules if r.vertical and abs(r.x0 - xs[index]) <= NEAR / 2 and r.y0 > line + 1]:
            above = [h for h in kept_rules + [rules[1]] if not h.vertical and rule.y0 - 20 <= h.y0 <= rule.y0 - .5
                     and h.x1 > rule.x0]
            if above and not any(r.vertical and abs(r.x0 - rule.x0) <= NEAR / 2 and r.y0 < rule.y0 <= r.y1 + 1
                                 for r in kept_rules):
                closing = max(above, key=lambda h: h.y0)
                kept_rules[kept_rules.index(rule)] = Rule(rule.x0, closing.y0, rule.x1, rule.y1)
                if closing.x0 > rule.x0 and closing in kept_rules:
                    kept_rules[kept_rules.index(closing)] = Rule(rule.x0, closing.y0, closing.x1, closing.y1)
    # (a sliver of a column rule OCR read as a stroke, `1`, on the rule)
    sliver = lambda w: w.text in ('1', 'l', 'I', '|', '｜') and w.x1 - w.x0 <= 4 and any(
        abs((w.x0 + w.x1) / 2 - x) <= 3 for x in xs)
    # (a 財源's name printed from its column's left rule, its first character's ink over the rule: the 財源's)
    fund = lambda w: (Word(w.text, xs[6] + .5, w.y0, w.x1, w.y1)
                      if w.x0 < xs[6] < w.x1 - 2 and not re.search(r'[0-9]', w.text) else w)
    body = [fund(w) for w in page.words if not inside(w) and not sliver(w)]
    body = setsu_lines(lettered(stacked(bracketed(body, xs[2], xs[3]), xs[9], xs[10]), xs[9], xs[10]), xs[7], xs[8])
    return Page(page.number, page.width, page.height, body + words, kept_rules + rules)


def read(pages, **options):
    lefts = {}
    for index, page in enumerate(pages):
        changed = drawn(page)
        # The observed page itself carries the drawn header (digit coverage reads the same words).
        page.words, page.rules = changed.words, changed.rules
        pages[index] = page
        count, left = fit(verticals(page))
        if count >= SURE:
            lefts[page.number] = left
    carried(pages)
    # The scan places each page a few points apart (the frame's left side at 31 to 37), and the builder reads where
    # the numbers of the 節 and the 説明 start by where they are on the page: each page is read moved to the place
    # most pages print the frame, and its words and columns keep how far they were moved (`offset`), as a spread's do.
    place = sorted(lefts.values())[len(lefts) // 2] if lefts else 0.0
    shifts = {number: place - left for number, left in lefts.items() if abs(place - left) >= 0.5}
    logicals = layout.logical_pages([mixed.moved(page, shifts.get(page.number, 0.0)) for page in pages], **options)
    for logical in logicals:
        for band in logical.bands:
            dx = shifts.get(band.page, 0.0)
            band.offset += dx
            for glyph in band.words:
                glyph.offset += dx
        for glyph in logical.outside:
            glyph.offset += shifts.get(glyph.page, 0.0)
    return logicals
