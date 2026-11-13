"""A scan of facing pages headed `款項目` whose header rules OCR's page does not show (港区・大田区の予算説明書 R6・R7).

The printed format is the one `facing_pages` reads from 港区's text PDF: the left page holds the 款・項・目 (codes in
three narrow columns, the name in a fourth, all under one header cell `款 項 目`), 本年度・前年度・比較 and the 財源内訳
(特定財源・一般財源 under one cell); the right page holds the 節 (区分・金額 under one cell) and the 説明. On the scan
the header's rules are drawn light and short: the narrow columns' rules start below the header, the 財源内訳's middle
rule is not read, and specks inside the header are read as characters, so the header OCR reads changes with every page
and runs down into the first rows. The body's column rules, drawn down the whole frame, are read in place: they tell
the left page (10 rules) from the right (4), and the header, the same height on every page, is drawn again from them
with its headings. The scans of each year and ward are printed at their own size, so the columns' places are fractions
of the frame's width. A page whose rules fit neither (an account's summary) is read as printed.

OCR's rereading of unread ink reads a piece of a column rule as a digit (`1`, `2`, a point wide on the rule): a word of
one or two characters whose box takes in a column's rule is the rule's (a word OCR read is cut at the rules, so a
printed figure never takes one in). The bracketed amounts of a 目's history of supplementary budgets (`(△` `353,600`
`)`, under `補正経過`) are read with their brackets apart; a bracket next to a figure on its line is joined to it. The
box round `補正経過` is drawn too short to be read as a rule: its top and bottom are drawn again in its column, so that
their ink is a rule's piece (`rule_ink`), and a dash OCR read on them is theirs.

The pages then go to `facing_pages`, which joins each left page with the right page after it.
"""
import re

from ingestion.generic.observe import Page, Rule, Word
from ingestion.generic.patterns.layout import facing_pages
from ingestion.generic.patterns.layout.redrawn_headers import frame, join_comma_groups, sides, verticals, word

# The columns' rules, as fractions of the frame's width from its left side (measured on 港区・大田区 R6・R7: within .002).
LEFT = (0, .0415, .083, .1245, .288, .4305, .5725, .7155, .858, 1)
RIGHT = (0, .1635, .306, 1)
# (heading, first column, last column + 1, the headings under it in the header's lower half)
CELLS = {LEFT: (('款', 0, 1, ()), ('項', 1, 2, ()), ('目', 2, 3, ()), ('科目', 3, 4, ()), ('本年度', 4, 5, ()), ('前年度', 5, 6, ()), ('比較', 6, 7, ()),
                ('本年度の財源内訳', 7, 9, ('特定財源', '一般財源'))),
         RIGHT: (('節', 0, 2, ('区分', '金額')), ('説明', 2, 3, ()))}
SURE = {LEFT: 7, RIGHT: 4}  # rules read in place that tell the page without its neighbours
HEADER, HEADER_LEAST, HEADER_MOST = .083, .03, .1  # the header's height, fractions of the frame's width
NEAR = 4.0  # pt: a rule read this close to a column's place is that column's
THIN, THIN_REACH = 2.0, 2.5  # pt: a mark this narrow, this far from a rule, is the rule's
PAIR, DIGIT = 8.0, 5.0  # pt: two figures, or a figure other than `1` (a rule's piece reads `1`), this wide with their
# middle off the rule are an amount set against it (`49`, `8`)
REVISION, BOX_MARGIN = '補正経過', 3.0  # pt: the box's rules stand this far above and below the word
BRACKET_GAP = 8.0  # pt: a bracket stands this far from its figure
OPENING, CLOSING = ('(', '(△', '（', '（△'), (')', '）')
DASH = re.compile(r'[-‐―—ー－_]+')  # the box's rule read as a word
FIGURE = re.compile(r'△?[0-9]{1,3}(,[0-9]{3})*')


def fit(xs: list[float], places: tuple) -> tuple[int, float, float]:
    """How many of the columns' rules are read in place, with the frame's left side and width, over the pairs of read
    rules that can be its two sides."""
    best = (0, 0.0, 0.0)
    for index, left in enumerate(xs):
        for right in xs[index + 1:]:
            width = right - left
            if width < 200:
                continue
            matched = sum(1 for p in places if any(abs(x - left - p * width) <= NEAR for x in xs))
            if matched > best[0]:
                best = (matched, left, width)
    return best


def kind(page: Page) -> tuple[tuple | None, float, float]:
    xs = verticals(page)
    scores = {places: fit(xs, places) for places in (LEFT, RIGHT)}
    sure = [p for p in (LEFT, RIGHT) if scores[p][0] >= SURE[p]
            and scores[p][0] / len(p) > scores[RIGHT if p is LEFT else LEFT][0] / len(RIGHT if p is LEFT else LEFT)]
    if sure:
        return sure[0], scores[sure[0]][1], scores[sure[0]][2]
    return None, 0.0, 0.0


def rule_pieces(words: list[Word], xs: list[float], top: float, bottom: float) -> list[Word]:
    """The words that are no piece of a column rule (a word of at most two characters whose box takes in the rule; a
    bracket or a sign printed against the rule is the figure's, and so is a code whose box OCR drew past the rule in
    the left page's code columns, its middle off the rule (`1` at 48–62 beside the rule at 60.5), and an amount of one or two
    figures set right against the rule (`49` at 191–207.1, `8` at 201–210 on 港区 R7)."""
    codes = xs[3] if len(xs) == len(LEFT) else xs[0]  # the right side of the left page's code columns
    def reach(w: Word) -> float:  # (a mark a point wide is read beside the rule as well as on it)
        return THIN_REACH if w.x1 - w.x0 <= THIN else .5
    return [w for w in words if not (len(w.text) <= 2 and not set(w.text) & set('()（）△') and top < (w.y0 + w.y1) / 2 < bottom
                                     and any(w.x0 - reach(w) <= x <= w.x1 + reach(w) and not (
                                         ((w.x0 + w.x1) / 2 < codes or (re.fullmatch(r'[1-9][0-9]', w.text) and w.x1 - w.x0 >= PAIR)
                                          or (re.fullmatch(r'[2-9]', w.text) and w.x1 - w.x0 >= DIGIT))
                                         and abs((w.x0 + w.x1) / 2 - x) > max(3., (w.x1 - w.x0) / 4))
                                             for x in xs))]


def join_brackets(words: list[Word]) -> list[Word]:
    """An opening bracket joined to the figure right of it on its line, and a closing bracket to the figure left of it."""
    ordered = sorted(words, key=lambda w: (w.x0, w.y0))
    joined: list[Word] = []
    for word in ordered:
        middle = (word.y0 + word.y1) / 2
        last = next((j for j in reversed(joined) if abs((j.y0 + j.y1) / 2 - middle) <= 3), None)
        if last is not None and 0 <= word.x0 - last.x1 <= BRACKET_GAP and (
                (last.text in OPENING and FIGURE.fullmatch(word.text))
                or (word.text in CLOSING and re.fullmatch(r'[(（]△?[0-9,]+', last.text))):
            joined[joined.index(last)] = Word(last.text + word.text, last.x0, min(last.y0, word.y0), word.x1, max(last.y1, word.y1))
        else:
            joined.append(word)
    return joined


def revision_boxes(words: list[Word], xs: list[float], line: float) -> list[Rule]:
    """The box drawn round `補正経過` in its column: its top and bottom rules, which the scan does not read as rules (they
    are shorter than a row's), so that their ink is a rule's piece (`rule_ink`), not an unread figure."""
    boxes = []
    for w in words:
        if w.text != REVISION or w.y0 < line:
            continue
        middle = (w.x0 + w.x1) / 2
        column = next(((a, b) for a, b in zip(xs, xs[1:]) if a < middle < b), None)
        if column is not None:
            boxes += [Rule(column[0], w.y0 - BOX_MARGIN, column[1], w.y0 - BOX_MARGIN),
                      Rule(column[0], w.y1 + BOX_MARGIN, column[1], w.y1 + BOX_MARGIN)]
    return boxes


def join_wrapped_names(words: list[Word], xs: list[float], rules: list[Rule], line: float) -> list[Word]:
    """A 款・項・目's name wrapped in the narrow name column (`国民健康保` / `険事業費納` / `付金`): a line of the column
    with no code beside it, right under a line of the same cell, goes on that line's word (its box stays the first
    line's, where the amounts are printed)."""
    name = lambda w: xs[3] < (w.x0 + w.x1) / 2 < xs[4] and (w.y0 + w.y1) / 2 > line
    coded = lambda w: any(xs[0] < (c.x0 + c.x1) / 2 < xs[3] and c.y0 < (w.y0 + w.y1) / 2 < c.y1 for c in words)
    ruled = lambda a, b: any(not r.vertical and r.x0 < xs[4] and r.x1 > xs[3] and a < r.y0 < b for r in rules)
    joined: dict[int, Word] = {}  # a name's first line by the index of its first word
    last = None  # (index of the name's first word, the last line's word)
    for index, w in sorted(((i, w) for i, w in enumerate(words) if name(w)), key=lambda p: (p[1].y0, p[1].x0)):
        if last is not None and not coded(w) and -(w.y1 - w.y0) / 2 < w.y0 - last[1].y1 < (w.y1 - w.y0) / 2 \
                and not ruled((last[1].y0 + last[1].y1) / 2, (w.y0 + w.y1) / 2):
            first = joined[last[0]]
            joined[last[0]] = Word(first.text + w.text, first.x0, first.y0, max(first.x1, w.x1), first.y1)
            joined[index] = None
            last = (last[0], w)
            continue
        joined[index] = w
        last = (index, w)
    return [joined.get(i, w) for i, w in enumerate(words) if joined.get(i, w) is not None]


def header(xs: list[float], places: tuple, top: float, line: float) -> tuple[list[Word], list[Rule]]:
    """The header's words and rules: a cell for each heading, split in two where headings stand under it."""
    half = (top + line) / 2
    rules = [Rule(xs[0], top, xs[-1], top), Rule(xs[0], line, xs[-1], line)]
    words = []
    inner = {index for _, first, last, under in CELLS[places] if under for index in range(first + 1, last)}
    for index, x in enumerate(xs):
        spans = [first < index < last for _, first, last, _ in CELLS[places]]
        if index in inner:
            rules.append(Rule(x, half, x, line))
        elif not any(spans):
            rules.append(Rule(x, top, x, line))
    for heading, first, last, under in CELLS[places]:
        if under:
            rules.append(Rule(xs[first], half, xs[last], half))
            words.append(word(heading, xs[first], xs[last], (top + half) / 2))
            words += [word(text, xs[first + i], xs[first + i + 1], (half + line) / 2) for i, text in enumerate(under)]
        else:
            words.append(word(heading, xs[first], xs[last], half))
    return words, rules


def redrawn(page: Page, places: tuple | None, left: float, width: float) -> Page:
    found = frame(page)
    if found is None or places is None:
        return page
    top, bottom = found
    read_xs = verticals(page)
    xs = [min(read_xs, key=lambda x: abs(x - left - p * width)) if any(abs(x - left - p * width) <= NEAR for x in read_xs)
          else left + p * width for p in places]
    # The header's bottom rule: the first rule read across the frame below the header's least height and above its
    # most (a scan set tighter, 大田区 R7, draws a lower header), or at its usual place.
    across = [r.y0 for r in page.rules if not r.vertical and r.x1 - r.x0 >= .6 * width
              and top + HEADER_LEAST * width < r.y0 < top + HEADER_MOST * width]
    line = min(across) if across else top + HEADER * width
    inside = lambda w: xs[0] < (w.x0 + w.x1) / 2 < xs[-1] and top < (w.y0 + w.y1) / 2 < line
    drawn_words, drawn_rules = header(xs, places, top, line)
    # One table to a page: a frame drawn under it is the head of the next table (`令和10年度` of the 債務負担行為 under an
    # account's last page, 港区 R6), and its ink and words are no part of this one.
    spans = sides(page, xs[0], top, bottom)[:1]
    body = [Rule(x, max(a, line), x, b) for a, b in spans for x in xs]
    under = spans[0][1]  # the frame's left side ends at its bottom
    rules = [r for r in page.rules if not r.vertical and not (top - 1 < r.y0 < line + 1) and r.y0 < under + 1] + body + drawn_rules
    words = join_brackets(rule_pieces(join_comma_groups(page.words), xs, line, bottom))
    # (under the frame: the account's name, the page number and the next table's head)
    words = [w for w in words if not inside(w) and (w.y0 + w.y1) / 2 < under + 1] + drawn_words
    boxes = revision_boxes(words, xs, line)
    words = [w for w in words if not (DASH.fullmatch(w.text) and any(
        b.x0 <= (w.x0 + w.x1) / 2 <= b.x1 and w.y0 - 1 <= b.y0 <= w.y1 + 1 for b in boxes))]
    rules += boxes
    if places is LEFT:
        words = join_wrapped_names(words, xs, rules, line)
    return Page(page.number, page.width, page.height, words, rules)


def read(pages, **options):
    kinds = [kind(page) for page in pages]
    numbers = {page.number: index for index, page in enumerate(pages)}
    for index, page in enumerate(pages):
        places, left, width = kinds[index]
        if places is None:
            # A page whose rules do not tell it: the right half of a spread after a left page, the left half before a
            # right page.
            before = kinds[numbers[page.number - 1]][0] if page.number - 1 in numbers else None
            after = kinds[numbers[page.number + 1]][0] if page.number + 1 in numbers else None
            places = RIGHT if before is LEFT else LEFT if after is RIGHT else None
            if places is not None:
                count, left, width = fit(verticals(page), places)
                places = places if count >= 2 else None
        changed = redrawn(page, places, left, width)
        # The observed page itself carries the redrawn header (digit coverage reads the same words).
        page.words, page.rules = changed.words, changed.rules
        pages[index] = page
    return facing_pages.read(pages, **options)
