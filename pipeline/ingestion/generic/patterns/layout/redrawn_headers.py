"""A scan of facing pages whose column headings OCR reads differently on every page (新宿区の予算事項別明細書).

The left page prints 目・本年度予算額・前年度予算額・比較増(△)減 and four columns of the 財源内訳, the right page the 節 (区分
and 金額) and the 説明, under 款・項 titles printed above the frame (`running_titles`). The rules of the headings are drawn
light and short: on a page where one of them is not read, a heading runs over two columns, or the header runs down to
the next rule across the frame and takes the rows with it (`節／区分／1報酬／2給料…`). Every page prints the same headings
over the same columns, so they are not read: the body's column rules (drawn down the whole frame) tell the left page (8
columns) from the right (3), and the header, the same height on every page, is drawn again from them, with the
headings of its columns. A page with another number of columns (the 款 summary of an account) is read as printed.

The 款・項 title lines set a space after each comma of their amounts (`1,044, 426`), and OCR reads the groups apart: a
group that starts with its comma is joined back to the figures before it, or the title's name takes the amount; a name
read together with its amount is parted from it.
"""
import re

from ingestion.generic.observe import Page, Rule, Word
from ingestion.generic.patterns.layout import running_titles

HEADER = 40.0    # pt: the header's height under the frame's top rule
NEAR = 4.0       # pt: a rule read this close to a column's place is that column's
LONG = 100.0     # pt: a horizontal rule this long is the frame's or a row's
SIDE_GAP = 15.0  # pt: pieces of a frame's side read with a gap shorter than this are one side
COMMA_GAP = 4.0  # pt: a comma group stands this far from the figures before it
YEN_GAP = 6.0    # pt: the 円 of a reckoning stands this far from its figures
TEXT_GAP = 8.0   # pt: a figure set this close after the text of the 説明 is part of it
EDGE = 30.0      # pt: and stands at least this far from the column's right edge
PIECE_GAP = 6.0  # pt: the pieces of a figure a rule cut stand this far apart
FIGURE = re.compile(r'[0-9,△▲]+')
TITLE_AMOUNT = re.compile(r'(.*[^0-9,△▲])(△?[0-9]{1,3}(?:,[0-9]{3})+)')

LEFT = ('目', '本年度予算額', '前年度予算額', '比較', '財源内訳', '財源内訳', '財源内訳', '財源内訳')
RIGHT = ('区分', '金額', '説明')
# The columns' rules, from the frame's left side (pt). Both pages are about as wide, so a page is told by its inner rules.
PLACES = {LEFT: (0, 68, 135, 203, 270, 333, 395, 457, 516), RIGHT: (0, 79, 157, 518)}
SPANNING = {RIGHT: ('節', 2)}  # a cell over the first columns of the header's upper half
SURE = {LEFT: 4, RIGHT: 3}  # inner and side rules read in place that tell the page without its neighbours


def frame(page: Page) -> tuple[float, float] | None:
    """The top and bottom of the frames: the highest and lowest long rules in the upper and lower part of the page."""
    long = [r.y0 for r in page.rules if not r.vertical and r.x1 - r.x0 >= LONG]
    upper = [y for y in long if y < page.height * .35]
    if not upper or max(long) - min(upper) < HEADER * 2:
        return None
    return min(upper), max(long)


def verticals(page: Page) -> list[float]:
    """The x of each vertical rule read, pieces of one rule together."""
    xs: list[list[float]] = []
    for x in sorted(r.x0 for r in page.rules if r.vertical and r.y1 - r.y0 >= HEADER):
        if xs and x - xs[-1][-1] <= NEAR / 2:
            xs[-1].append(x)
        else:
            xs.append([x])
    return [sum(group) / len(group) for group in xs]


def fit(xs: list[float], places: tuple) -> tuple[int, float]:
    """How many of the columns' rules are read in place, and the left side's x, at the best shift that reads both sides."""
    best = (0, 0.0)
    for x in xs:
        for place in places:
            shift = x - place
            matched = [next(y for y in xs if abs(y - shift - p) <= NEAR) - p for p in places
                       if any(abs(y - shift - p) <= NEAR for y in xs)]
            ends = all(any(abs(y - shift - p) <= NEAR for y in xs) for p in (places[0], places[-1]))
            if ends and len(matched) > best[0]:  # the frame's two sides are read in place
                best = (len(matched), sum(matched) / len(matched))
    return best


def kind(page: Page) -> tuple[tuple | None, float]:
    xs = verticals(page)
    scores = {headings: fit(xs, PLACES[headings]) for headings in (LEFT, RIGHT)}
    sure = [h for h in (LEFT, RIGHT) if scores[h][0] >= SURE[h] and scores[h][0] > scores[LEFT if h is RIGHT else RIGHT][0]]
    if sure:
        return sure[0], scores[sure[0]][1]
    return None, max(scores.values())[1] if xs else 0.0


def sides(page: Page, x: float, top: float, bottom: float) -> list[tuple[float, float]]:
    """Where the frame's left side is drawn: the tables of the page, top to bottom (a second table stacks under
    titles of its own)."""
    pieces = sorted((r.y0, r.y1) for r in page.rules if r.vertical and abs(r.x0 - x) <= NEAR and r.y1 > top + HEADER)
    spans: list[list[float]] = []
    for y0, y1 in pieces:
        y0 = max(y0, top + HEADER)
        if spans and y0 - spans[-1][1] <= SIDE_GAP:
            spans[-1][1] = max(spans[-1][1], y1)
        else:
            spans.append([y0, min(y1, bottom)])
    return [(a, b) for a, b in spans if b - a > 0] or [(top + HEADER, bottom)]


def word(text: str, x0: float, x1: float, middle: float) -> Word:
    return Word(text, x0 + 2, middle - 5, x1 - 2, middle + 5)


def header(xs: list[float], headings: tuple, top: float, bottom: float) -> tuple[list[Word], list[Rule]]:
    """The header's words and rules: one cell a column, and a cell over the first columns where the headings span."""
    line, half = top + HEADER, top + HEADER / 2
    spanning = SPANNING.get(headings)
    count = spanning[1] if spanning else 0
    rules = [Rule(xs[0], top, xs[-1], top), Rule(xs[0], line, xs[-1], line)]
    rules += [Rule(x, half if 0 < index < count else top, x, line) for index, x in enumerate(xs)]
    words = []
    if spanning:
        rules.append(Rule(xs[0], half, xs[count], half))
        words.append(word(spanning[0], xs[0], xs[count], top + HEADER / 4))
    for index, (heading, (x0, x1)) in enumerate(zip(headings, zip(xs, xs[1:]))):
        words.append(word(heading, x0, x1, top + HEADER * 3 / 4 if index < count else half))
    return words, rules


def join_comma_groups(words: list[Word]) -> list[Word]:
    """A group of figures read with its comma first (`,426`) joined to the figures before it on its line, and one read
    after the figures that end with its comma (`1,` `321,480`); the 円 set apart from a reckoning's figures joined to
    them (`1,012,000円`, read as yen in the 説明: `yen_marked`)."""
    ordered = sorted(words, key=lambda w: (w.x0, w.y0))
    joined: list[Word] = []
    for word in ordered:
        middle = (word.y0 + word.y1) / 2
        last = next((j for j in reversed(joined) if abs((j.y0 + j.y1) / 2 - middle) <= 3), None) \
            if word.text[:1] == ',' or word.text[:3].isdigit() else None
        if word.text == '円':  # (a reckoning in yen sets its 円 apart: `1,012,000` `円`)
            last = next((j for j in reversed(joined) if abs((j.y0 + j.y1) / 2 - middle) <= 3), None)
        group = last is not None and ((word.text[:1] == ',' and last.text[-1:].isdigit())
                                      or (last.text[-1:] == ',' and last.text[-2:-1].isdigit())
                                      or (word.text == '円' and re.fullmatch(r'△?[0-9]{1,3}(,[0-9]{3})*', last.text)))
        if group and (-2 if word.text == '円' else 0) <= word.x0 - last.x1 <= (YEN_GAP if word.text == '円' else COMMA_GAP):
            joined[joined.index(last)] = Word(last.text + word.text, last.x0, min(last.y0, word.y0), word.x1, max(last.y1, word.y1))
        else:
            joined.append(word)
    return joined


def split_title_amounts(words: list[Word], titled) -> list[Word]:
    """A title line's name read together with its amount (`諸支出金12,234`, above a table) parted at the amount, its
    box shared by the characters. `titled(word)`: the word is on the titles' lines, outside the tables."""
    # (the scan's column rules run on through the titles of a table stacked under another, and cut their amounts:
    # `1` `2` `,234`; the pieces of a figure on a title line are joined back)
    pieces: list[Word] = []
    for word in sorted(words, key=lambda w: (w.x0, w.y0)):
        middle = (word.y0 + word.y1) / 2
        last = next((p for p in reversed(pieces) if abs((p.y0 + p.y1) / 2 - middle) <= 3), None) \
            if titled(word) and FIGURE.fullmatch(word.text) else None
        if last is not None and titled(last) and FIGURE.fullmatch(last.text) and 0 <= word.x0 - last.x1 <= PIECE_GAP:
            pieces[pieces.index(last)] = Word(last.text + word.text, last.x0, min(last.y0, word.y0), word.x1, max(last.y1, word.y1))
        else:
            pieces.append(word)
    result = []
    for word in pieces:
        found = TITLE_AMOUNT.fullmatch(word.text) if titled(word) else None
        if found is None:
            result.append(word)
            continue
        cut = word.x0 + (word.x1 - word.x0) * len(found[1]) / len(word.text)
        result += [Word(found[1], word.x0, word.y0, cut, word.y1), Word(found[2], cut, word.y0, word.x1, word.y1)]
    return result


def figures_in_text(words: list[Word], x0: float, x1: float) -> list[Word]:
    """In the 説明 (between `x0` and `x1`), a figure set close after the text of its line, short of the column's right
    edge, is part of the text (`補給利率 貸付利率の1／2`, OCR reads the rate without its slash: `12`); the 説明's
    amounts stand at the right edge."""
    ordered = sorted(words, key=lambda w: (w.x0, w.y0))
    joined: list[Word] = []
    for word in ordered:
        middle = (word.y0 + word.y1) / 2
        last = next((j for j in reversed(joined) if abs((j.y0 + j.y1) / 2 - middle) <= 3), None) \
            if x0 < word.x0 and word.x1 < x1 - EDGE and re.fullmatch(r'[0-9／/]+', word.text) else None
        if last is not None and x0 < last.x0 and 0 <= word.x0 - last.x1 <= TEXT_GAP \
                and (not last.text[-1:].isdigit() or word.text[:1] in '／/'):
            joined[joined.index(last)] = Word(last.text + word.text, last.x0, min(last.y0, word.y0), word.x1, max(last.y1, word.y1))
        else:
            joined.append(word)
    return joined


def redrawn(page: Page, headings: tuple | None, left: float) -> Page:
    found = frame(page)
    if found is None:
        return page
    top, bottom = found
    words = join_comma_groups(page.words)
    if headings is None:
        return Page(page.number, page.width, page.height, split_title_amounts(words, lambda w: w.y1 <= top), page.rules)
    # Each column rule where it is read (the ink of a rule drawn aside would be read as a column's unread figures), or
    # where its place puts it.
    read_xs = verticals(page)
    xs = [min(read_xs, key=lambda x: abs(x - left - place)) if any(abs(x - left - place) <= NEAR for x in read_xs)
          else left + place for place in PLACES[headings]]
    line = top + HEADER
    # (the unit row under the header, `千円`, is read a little into it)
    inside = lambda w: xs[0] < (w.x0 + w.x1) / 2 < xs[-1] and top < (w.y0 + w.y1) / 2 and w.y1 <= line + 3
    drawn_words, drawn_rules = header(xs, headings, top, bottom)
    # The body's column rules are drawn again where the tables are (between the frame's top and foot where its left side
    # is drawn: a second table stacks under titles of its own, outside the columns), cut at the header's bottom.
    spans = sides(page, xs[0], top, bottom)
    body = [Rule(x, a, x, b) for a, b in spans for x in xs]
    # (the titles stand above the first table's header and above the frame of a table stacked under it)
    opens = [(top if a <= line + 1 else a, b) for a, b in spans]
    words = split_title_amounts(words, lambda w: not any(a - 2 <= (w.y0 + w.y1) / 2 <= b for a, b in opens))
    # (the frame's top rule is drawn again too: on a page it is read in pieces that leave the first column open)
    rules = [r for r in page.rules if not r.vertical and not (top - 1 < r.y0 < line + 1)] + body + drawn_rules
    words = [w for w in words if not inside(w)] + drawn_words
    if headings is RIGHT:
        words = figures_in_text(words, xs[2], xs[3])
    return Page(page.number, page.width, page.height, words, rules)


def read(pages, **options):
    kinds = [kind(page) for page in pages]
    numbers = {page.number: index for index, page in enumerate(pages)}
    for index, page in enumerate(pages):
        headings, left = kinds[index]
        if headings is None:
            # A page whose rules do not tell it: the right half of a spread after a left page, the left half before a
            # right page.
            before = kinds[numbers[page.number - 1]] if page.number - 1 in numbers else (None, 0)
            after = kinds[numbers[page.number + 1]] if page.number + 1 in numbers else (None, 0)
            headings = RIGHT if before[0] is LEFT else LEFT if after[0] is RIGHT else None
            if headings is not None:
                count, left = fit(verticals(page), PLACES[headings])
                headings = headings if count >= 2 else None
        changed = redrawn(page, headings, left)
        # The observed page itself carries the redrawn header (digit coverage reads the same words).
        page.words, page.rules = changed.words, changed.rules
        pages[index] = page
    return running_titles.read(pages, **options)
