"""The 歳入 of a scan of single pages whose header OCR reads differently on every page (東京都の予算説明書の歳入).

The 歳入's frame has no 本年度の財源内訳: the narrow 款・項 columns and the 目 column under one cell `科目`, 本年度予算額・
前年度予算額・比較増減, the 節 (区分 and 金額 under one cell `節`) and the 計上説明, which prints its own columns (区分・
課税基本・税率・調定見込額・収入歩合・収入見込額 for a tax, the 補助率 and the amount for a 支出金) differently from page to
page. As in `drawn_header` (the 歳出 of the same book), every page prints the same headings over the same columns: the
body's column rules place the columns and the header is drawn again from them. The 計上説明 is one column from its left
rule to the frame's right side, its own rules taken out: it is the 歳入's explanation, never an item.

The 節's number is printed from the 比較増減's rule, and OCR can place it a little left of the rule (`03` read in the
比較増減): a two-digit number ending at most a few points right of the rule, with a name beginning right of the rule on
its line, is the 節's number, put back on the name.
"""
import re

from ingestion.generic import layout, mixed
from ingestion.generic.observe import Page, Rule, Word
from ingestion.generic.patterns.layout.drawn_header import HEADED, HEADER, LINE, LONG, NEAR, STRETCH, verticals, word

TALL = 25.0
SURE = 8
# The headings as the shared dictionary names them: the print's `節` is the 節 axis, its `計上説明` the 説明.
HEADINGS = ('款', '項', '目', '本年度予算額', '前年度予算額', '比較増減', '区分', '金額', '説明')
# The columns' rules, from the frame's left side (pt): 款・項・目・本年度・前年度・比較・節の区分・節の金額・計上説明・右端.
PLACES = (0, 9.6, 19.0, 87.0, 156.7, 226.4, 296.0, 357.0, 427.0, 778.7)
SPANNING = (('科目', 0, 3), ('節', 6, 8))
SETSU = 6
EXPLANATION = 8
CODE = re.compile(r'[0-9]{2}')
GLUED = re.compile(r'([△▲-]?)([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{2,})')


def fit(xs: list[float]) -> tuple[int, float, float]:
    best = (0, 0.0, 1.0)
    for x in xs:
        for right in xs:
            scale = (right - x) / PLACES[-1]
            if abs(scale - 1) > STRETCH:
                continue
            places = [p * scale for p in PLACES]
            hits = [next(y for y in xs if abs(y - x - p) <= NEAR) - p for p in places
                    if any(abs(y - x - p) <= NEAR for y in xs)]
            if (len(hits), -abs(scale - 1)) > (best[0], -abs(best[2] - 1)):
                best = (len(hits), sum(hits) / len(hits), scale)
    return best


def frame(page: Page) -> tuple[float, list[float]] | None:
    long = sorted(r.y0 for r in page.rules if not r.vertical and r.x1 - r.x0 >= LONG)
    read_xs = verticals(page)
    count, left, scale = fit(read_xs)
    if not long or count < SURE:
        return None
    xs = [min(read_xs, key=lambda x: abs(x - left - place))
          if any(abs(x - left - place) <= NEAR for x in read_xs) else left + place
          for place in (p * scale for p in PLACES)]
    top = long[0]
    # (a page that goes on from the one before it prints no header, its rows from the frame's top (`09 繰越金` under the
    # end of a 節's name, 国民健康保険事業会計 R7 p29): its header is drawn above the frame)
    band = sorted((w for w in page.words
                   if top < (w.y0 + w.y1) / 2 < top + HEADER and xs[3] < (w.x0 + w.x1) / 2 < xs[EXPLANATION]),
                  key=lambda w: (round(w.y0 / LINE), w.x0))
    if not HEADED.search(''.join(w.text for w in band).replace(' ', '')):
        top -= HEADER
    return top, xs


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
    for index, heading in enumerate(HEADINGS):
        words.append(word(heading, xs[index], xs[index + 1], (half + line) / 2 if index in spanned else (top + line) / 2))
    # (the printed headings of the lower half sit on the header's bottom rule, OCR's box running below it: `区分`
    # `金 額` `(%)`, read from 98 to 114pt over a rule at 102pt; a body word starts under the rule)
    inside = lambda w: xs[0] < (w.x0 + w.x1) / 2 < xs[-1] and top - 2 < w.y0 < line - 2
    kept = [r for r in page.rules
            if not (not r.vertical and top - 1 < r.y0 < line + 1)
            and not (r.vertical and r.y0 < line - 1 and xs[0] - 1 <= r.x0 <= xs[-1] + 1)
            and not (r.vertical and xs[EXPLANATION] + NEAR < r.x0 < xs[-1] - NEAR)]
    # (a column rule read from the frame's top is cut at the header's bottom: the drawn header has its own)
    kept += [Rule(r.x0, line, r.x1, r.y1) for r in page.rules
             if r.vertical and r.y0 < line - 1 < r.y1 and xs[0] - 1 <= r.x0 <= xs[-1] + 1
             and not xs[EXPLANATION] + NEAR < r.x0 < xs[-1] - NEAR]
    # (a column rule read in pieces a point apart is one rule, at the column's place)
    kept = [next((Rule(x, r.y0, x, r.y1) for x in xs if abs(r.x0 - x) <= NEAR / 2), r) if r.vertical else r
            for r in kept]
    # (the rule left of a 項 or 目 column, not read on a page whose rows are too short for it (a page that carries one
    # 目 over, 母子父子福祉貸付資金会計 R7 p45): drawn from the header to the frame's foot, under no name that runs over it)
    foot = max((r.y1 for r in kept if r.vertical and abs(r.x0 - xs[0]) <= NEAR / 2), default=line)
    for x in xs[1:3]:
        if not any(r.vertical and abs(r.x0 - x) <= NEAR / 2 and r.y1 > line + 1 for r in kept):
            over = [w.y1 for w in page.words if w.x0 < x - 1 and w.x1 > x + 1 and w.y0 > line - 1]
            start = max(over) + 1 if over else line
            if start < foot - LINE:
                kept.append(Rule(x, start, x, foot))
    # (the rule left of a 項 or 目 column is not drawn over a row of the level above, whose name runs over it; read
    # through such a name, `01都債` over the 目's rule, と場会計 R7 p93, it would cut the name's number: it is cut there)
    for x in xs[1:3]:
        over = sorted((w.y0, w.y1) for w in page.words if w.x0 < x - 1 and w.x1 > x + 1 and w.y0 > line - 1
                      and xs[0] < w.x0 < xs[3])
        if not over:
            continue
        cut = []
        for r in kept:
            if not (r.vertical and abs(r.x0 - x) <= NEAR / 2):
                cut.append(r)
                continue
            start = r.y0
            for y0, y1 in over:
                if y1 <= start or y0 >= r.y1:
                    continue
                if y0 - 1 > start:
                    cut.append(Rule(r.x0, start, r.x1, y0 - 1))
                start = max(start, y1 + 1)
            if start < r.y1:
                cut.append(Rule(r.x0, start, r.x1, r.y1))
        kept = cut
    # (a row rule read from the amounts' columns only, its piece under the 科目 lost, 特別区財政調整会計 R8 p5: it closes
    # the 目's cell too, and the whole 科目 cell over the total's row, unless a word runs over it there; a piece read
    # under the 項 alone, 母子父子福祉貸付資金会計 R8 p36, leaves the 目's part lost all the same)
    # (a row rule read a column at a time, 特別区財政調整会計 R6 p8: the pieces that touch on one line are one rule)
    joined: list[Rule] = []
    for r in sorted((r for r in kept if not r.vertical), key=lambda r: r.x0):
        at = next((i for i, j in enumerate(joined) if abs(j.y0 - r.y0) <= 2 and r.x0 <= j.x1 + NEAR), None)
        if at is None:
            joined.append(r)
        else:
            j = joined[at]
            joined[at] = Rule(j.x0, j.y0, max(j.x1, r.x1), j.y1)
    kept = [r for r in kept if r.vertical] + joined
    rows = [r for r in kept if not r.vertical]
    def reach(r: Rule) -> float:
        total = any(w.text.endswith('合計') and 0 < w.y0 - r.y0 <= 2 * LINE and xs[0] < w.x0 < xs[3] for w in page.words)
        return xs[0] if total else xs[2]
    kept = [Rule(reach(r), r.y0, r.x1, r.y1) if (
        not r.vertical and r.y0 > line + 1 and r.x1 - r.x0 >= LONG / 3 and xs[2] + 1 < r.x0 <= xs[5] + NEAR
        and not any(o is not r and abs(o.y0 - r.y0) <= 2 and o.x0 <= xs[2] + 1 and o.x1 >= r.x0 - NEAR for o in rows)
        and not any(w.x0 < r.x0 and w.x1 > reach(r) and w.y0 < r.y0 - 3 and w.y1 > r.y0 + 3 for w in page.words))
        else r for r in kept]
    body = [w for w in page.words if not inside(w)]
    body = setsu_numbers(subject_numbers(joined_names(stacked_digits(body, xs), xs), xs[2]), xs[SETSU])
    # (a 款 or 項 the year drops, its name in brackets in a cell with no 項's or 目's rule beside it, `(繰越金)` from the
    # 目's rule over the whole 科目, 工業用水道事業清算会計 R8 p151; `(物品売払代金)` over the 項's and 目's, R6 p183):
    # it is of the level whose cell it is in, as the total's line is the 款's
    ruled = lambda w, x: any(r.vertical and abs(r.x0 - x) <= NEAR and r.y0 < (w.y0 + w.y1) / 2 < r.y1 for r in kept)
    cell = lambda w: next((x for x in xs[0:2] if not ruled(w, xs[xs.index(x) + 1])), None)
    body = [Word(w.text, x + 1, w.y0, w.x1, w.y1)
            if w.text[:1] in '(（' and xs[0] < w.x0 < xs[3] and (x := cell(w)) is not None and w.x0 > x + 1 else w
            for w in body]
    # (a 項's or 目's line read from a few points left of its column's rule, the scan printed that much left: 01 と場債
    # from 49.7pt over the 目's rule at 51.6pt, と場会計 R7 p93): it starts in its column
    body = [Word(w.text, x + .5, w.y0, w.x1, w.y1)
            if (x := next((x for x in xs[1:3] if x - NEAR <= w.x0 < x and w.x1 > x + 2 * LINE), None)) is not None
            and w.text[:1].isdigit() else w for w in body]
    return Page(page.number, page.width, page.height, body + words, kept + rules)


def joined_names(body: list[Word], xs: list[float]) -> list[Word]:
    """A name OCR read in pieces in the 款・項・目 columns, the pieces touching on one line (`歳` `入合計` for `歳入合計`,
    特別区財政調整会計 R8 p5): one word, as printed, so that the total's row is read as the total."""
    pieces = sorted((w for w in body if xs[0] < w.x0 < xs[3]), key=lambda w: (round((w.y0 + w.y1) / 2), w.x0))
    out = [w for w in body if not xs[0] < w.x0 < xs[3]]
    for w in pieces:
        last = out[-1] if out and xs[0] < out[-1].x0 < xs[3] else None
        line = last is not None and abs((last.y0 + last.y1) / 2 - (w.y0 + w.y1) / 2) <= 2
        # (the pieces' middles a point apart can sort right to left, `入合計` `歳`, 中小企業設備導入等資金会計 R8 p58)
        first, second = (last, w) if line and w.x0 >= last.x0 else (w, last)
        if (line and -2 <= second.x0 - first.x1 <= 2.5
                and not second.text[:1].isdigit() and not first.text[-1:].isdigit()):
            out[-1] = Word(first.text + second.text, first.x0, min(w.y0, last.y0), second.x1, max(w.y1, last.y1))
        else:
            out.append(w)
    # (the total's row prints its label over the whole 科目 cell, from wherever the scan put it: it is the 款's column's)
    return [Word(w.text, xs[0] + 1, w.y0, w.x1, w.y1) if xs[0] < w.x0 < xs[3] and w.text.endswith('合計') else w
            for w in out]


def stacked_digits(body: list[Word], xs: list[float]) -> list[Word]:
    """Two one-digit amounts printed one over the other in the 節's 金額 (`1` over `1`, 臨海地域開発財源会計 R8 p137),
    which OCR reads as one word two lines tall (`11`): one digit to each line."""
    heights = sorted(w.y1 - w.y0 for w in body)
    line = heights[len(heights) // 2] if heights else 0
    out = []
    for w in body:
        if (line and len(w.text) == 2 and w.text.isdigit() and w.y1 - w.y0 >= 1.6 * line
                and xs[SETSU + 1] < w.x0 < xs[EXPLANATION]):
            middle = (w.y0 + w.y1) / 2
            out += [Word(w.text[0], w.x0, w.y0, w.x1, middle), Word(w.text[1], w.x0, middle, w.x1, w.y1)]
            continue
        out.append(w)
    return out


def subject_numbers(body: list[Word], rule: float) -> list[Word]:
    """A 項's number cut at the 目's rule (`0` `2雑入` for `02` `雑入`, 母子父子福祉貸付資金会計 R7 p44): the digit read right of
    the rule is the 項's, whose number is read in its own column."""
    same_line = lambda a, b: abs((a.y0 + a.y1) / 2 - (b.y0 + b.y1) / 2) <= 3
    # (a 項's number read with its name over the 目's rule, `01都債`, と場会計 R7 p93: the number set apart in its column)
    split = []
    for w in body:
        found = re.fullmatch(r'([0-9]{2})([^0-9].*)', w.text)
        if found and w.x0 < rule - NEAR and w.x1 > rule + 2 * LINE:
            split += [Word(found.group(1), w.x0, w.y0, rule - .5, w.y1), Word(found.group(2), rule + .5, w.y0, w.x1, w.y1)]
            continue
        split.append(w)
    body = split
    moved: dict[int, Word] = {}
    for w in body:
        if not (w.text.isdigit() and len(w.text) == 1 and w.x0 < rule and w.x1 >= rule - NEAR):
            continue
        name = next((o for o in body if o is not w and same_line(o, w) and abs(o.x0 - rule) <= NEAR
                     and re.match(r'[0-9][^0-9]', o.text)), None)
        if name is not None and id(name) not in moved:
            moved[id(w)] = Word(w.text + name.text[0], w.x0, w.y0, w.x1, w.y1)
            moved[id(name)] = Word(name.text[1:], max(name.x0, rule) + .5, name.y0, name.x1, name.y1)
            continue
        # (the digit read as a word of its own, under the name read whole beside it, `0` `2` `定期借地権保`,
        # 都営住宅等保証金会計 R8 p107)
        digit = next((o for o in body if o is not w and same_line(o, w) and o.text.isdigit() and len(o.text) == 1
                      and abs(o.x0 - rule) <= NEAR and id(o) not in moved
                      and any(n is not o and n is not w and same_line(n, o) and n.x0 < o.x1 < n.x1 for n in body)), None)
        if digit is not None:
            moved[id(w)] = Word(w.text + digit.text, w.x0, w.y0, w.x1, w.y1)
            moved[id(digit)] = None
    return [moved.get(id(w), w) for w in body if moved.get(id(w), w) is not None]


def setsu_numbers(body: list[Word], rule: float) -> list[Word]:
    """The 節's number, printed from the 比較増減's rule, as OCR cuts it there.

    The 比較増減's last digit can be read twice, once more with the number's first digit (`△303,994` `40` `1道路維持費`
    for `△303,994` `01道路維持費`; `2,143` `3` `01賄収入`): a figure starting inside an amount of its line with the
    amount's last digit gives that digit back. A figure ending on the rule is cut there when the name beside it
    holds a single digit of its number (`00` `1繰越金` for `0` `01繰越金`; `1,107,980` `1被災地派遣職員費` for
    `110,798` `01被災地派遣職員費`), and a whole number read left of the rule
    goes to a name with none (`03` `財産収入`). A name read starting a point left of the rule starts on it."""
    same_line = lambda a, b: abs((a.y0 + a.y1) / 2 - (b.y0 + b.y1) / 2) <= 3
    out = []
    for w in body:
        if w.text.isdigit() and len(w.text) <= 2 and w.x0 < rule:
            amount = next((a for a in body if a is not w and same_line(a, w) and a.x0 < w.x0 < a.x1 - 1
                           and len(a.text) >= 2 and a.text[-1:].isdigit() and a.text[-1] == w.text[0]), None)
            if amount is not None:
                if len(w.text) == 1:
                    continue
                w = Word(w.text[1:], amount.x1 + .5, w.y0, w.x1, w.y1)
        out.append(w)
    body = out
    beside = lambda w: next((o for o in body if o is not w and same_line(o, w)
                             and rule - NEAR <= o.x0 <= rule + NEAR + 6 and not re.match(r'[0-9,]+$', o.text)), None)
    joined: dict[int, Word] = {}
    dropped: set[int] = set()
    for w in body:
        if not (w.text.isdigit() and w.x0 < rule and w.x1 >= rule - 2 * NEAR):
            continue
        name = beside(w)
        if name is None or id(name) in joined:
            continue
        if re.match(r'[0-9][^0-9]', name.text):
            digit = w.text[-1]
            joined[id(name)] = Word(digit + name.text, rule + .5, name.y0, name.x1, name.y1)
            if len(w.text) == 1:
                dropped.add(id(w))
            else:
                joined[id(w)] = Word(w.text[:-1], w.x0, w.y0, rule - .5, w.y1)
        elif CODE.fullmatch(w.text) and not name.text[:1].isdigit():
            joined[id(name)] = Word(w.text + name.text, rule + .5, name.y0, name.x1, name.y1)
            dropped.add(id(w))
    for w in body:
        # (a figure read alone between the amount and the rule is the number's: taken above)
        if id(w) in joined or any(o is not w and id(o) in joined and same_line(o, w) and o.x0 >= w.x1 - 1 and o.x0 < rule
                                  for o in body):
            continue
        glued = GLUED.fullmatch(w.text) if w.x0 < rule and w.x1 >= rule - 2 * NEAR else None
        if glued and (name := beside(w)) is not None and id(name) not in joined and re.match(r'[0-9][^0-9]', name.text):
            # (the 比較増減 read with the number's first digit and grouped again, `1,107,980` `1被災地派遣職員費` for
            # `110,798` `01被災地派遣職員費`: the last digit is the name's)
            digits = glued.group(2).replace(',', '')
            joined[id(name)] = Word(digits[-1] + name.text, rule + .5, name.y0, name.x1, name.y1)
            joined[id(w)] = Word(f'{glued.group(1)}{int(digits[:-1]):,}', w.x0, w.y0, rule - .5, w.y1)
    body = [joined.get(id(w), w) for w in body if id(w) not in dropped]
    return [Word(w.text, rule + .5, w.y0, w.x1, w.y1)
            if rule - NEAR <= w.x0 < rule and (w.x0 + w.x1) / 2 > rule + NEAR and w.text[:1].isdigit() else w
            for w in body]


def read(pages, **options):
    lefts = {}
    for index, page in enumerate(pages):
        changed = drawn(page)
        # The observed page itself carries the drawn header (digit coverage reads the same words).
        page.words, page.rules = changed.words, changed.rules
        pages[index] = page
        count, left, _ = fit(verticals(page))
        if count >= SURE:
            lefts[page.number] = left
    # Each page is read moved to the place most pages print the frame, as `drawn_header` reads the 歳出.
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
