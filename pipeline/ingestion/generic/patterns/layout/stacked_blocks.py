"""Each 目 printed as a block of three stacked tables (練馬区の予算説明書).

A block opens with the 款・項・目 table (`款 項 目 | 本年度 | 前年度 | 比較`): a row for the 款 and the 項 where they
open, and one for the 目. Under it, one table holds the 財源内訳 of the 目 on its left half (区分・金額) and its 節
on its right half (区分・金額), in the columns of the table above. Under that the 説明 is one wide cell: a sentence,
then the 事業 (`1 職員人件費 … 77,358`) and their items (`給料 … 36,788 ②`), each ending in the number of its 節
in a circle. A page holds one block or several, and a 説明 too long for its page goes on over the next page, under
a header `説明` of its own.

The layout reads the stacked tables as one frame in the columns of the top table, so a 節 falls in the 前年度 column
and the 説明 in all of them. Here each line of a page is read by the part of the block it stands in (the header lines
`款 項 目 本年度…`, `財源 内 訳 … 節`, `区分 金額 …` and `説 明` mark them off), and the parts are set apart as their
own columns: the 款・項・目 and their amounts where they are, the 節 to the right of them, the 説明 further right (the
words moved with an offset, as a spread's right page is, so the coverage check still finds them where they are
printed).

- A 目 name too long for its cell wraps around the line with its code and amounts (`後期高齢者医療` / `1 12,248,824`
  / `保険料拠出金`). The lines of the name join the line with the amounts, in order.
- A 項・目 in its last year prints no code (`傷病手当金`, 0 this year): its row is read at the level of the codes its name
  starts right of.
- The 財源内訳 is not taken in: it is an excluded box (財源内訳) of the coverage check, the size of its part.
- The circled 節 number at the end of a 説明 line is no amount (OCR reads ⑫ as `12`, `①2` or a letter, or joins it to
  the amount: `16,940④`): the column of the circles is an excluded box (本文).
- OCR splits a bold amount of the 説明 at its comma (`12` `248,824`, `6,` `136,180`), and an amount of a column in
  two (`30` `00`): the parts are one amount.
- A line of the 説明 may end in a figure of the work and its unit (`年間受診件数見込 2,174,553 件`, `1件当たり費用額
  21,335 円`), or print one before its amount (`区議会だより印刷費等 1回 185,000 部 7,361`): no amount of the
  budget. Each such line, or figure, is an excluded box (本文).
- OCR reads the long vowel after a katakana as the kanji 一 (`ホ一ル`), which makes `ホ` the numbering of a line: it
  is read as ー.
"""
import re
from dataclasses import replace

from ingestion.generic import layout
from ingestion.generic.layout import Band, Glyph, is_amount, lines, normalize, text

FUNDING = '財源内訳'
FUNDING_REASON = ('目ごとの財源内訳の表（区分・金額）は取り込まない。財源の種類と額で、科目の金額ではない。'
                  '歳出の目の和は本年度予算額で確かめる。')
FIGURE_REASON = '説明の中の見込みの数（被保険者数・件数・1件当たりの額など）。予算の金額ではない。'
# A line of the 説明 that ends in a figure and its unit (`年間受診件数見込 2,174,553 件`, `1件当たり費用額 21,335 円`)
COUNTERS = r'(?:人|件|円|世帯|世带|世帶|校|園|か所|箇所|戸|台|回|部|本|日|食|枚|冊|名|団体|時間|㎡|%|％)'
FIGURE = re.compile(r'[0-9][0-9,.]*(?:' + COUNTERS + r'|現在)$')
COUNTED = re.compile(r'^[0-9][0-9,]*' + COUNTERS + '?$')
TITLE_REASON = '会計の歳出の初めの頁の題（3 歳出）の番号。金額ではない。'
TITLE = re.compile(r'^[0-9]+歳出$')
CIRCLE_REASON = '説明の行末の丸数字は節の番号（⑫など）。金額ではない。'
SETSU_OFFSET = 600  # the 節 columns are moved this far right, the 説明 twice as far
CIRCLE = 50  # the circled numbers start this far right of the 比較 column's left edge; the 説明's amounts end before it
UNCODED = 12  # how far right of its level's codes a name starts
SETSU_NAME = 20  # where a 節 name starts, right of the column's left edge
NUMBERED = re.compile(r'^([(（][0-9０-９]+[)）])\s*')
NUMBER_WIDTH = 5  # a half-width letter of `(1)`
NAME_GAP = 0  # the name follows `(1)` (where OCR boxes them apart: `(1)` 83–97, `議会運営費` 94–156)
JOIN = 8  # the gap OCR leaves where it splits an amount at its comma
CIRCLED = re.compile(r'[\u2460-\u2473\u3251-\u325f]+$')  # ① … ⑳ ㉑ …
UNIT = '千円'
LONG_VOWEL = re.compile(r'(?<=[ァ-ヶ])一')  # OCR reads the ー of `ホール` as 一: a numbered `ホ` to the builder
DIGITS = re.compile(r'^[△▲]?[0-9,]*[0-9][0-9,]*$')  # a part may start at the comma (`38` `,786`)
CODE = re.compile(r'^([0-9]+)(\D.*)$')


def marker(line: list[Glyph]) -> str | None:
    shown = normalize(text(line))
    if '本年度' in shown and '前年度' in shown:
        return 'subject'
    if shown.startswith('財源') and ('訳' in shown or shown.endswith('節')):  # OCR may read a stray letter in it
        return 'head'
    if shown.startswith('区分金額'):
        return 'table'
    if shown in ('説明', '說明'):
        return 'explanation'
    return None


def shifted(glyph: Glyph, offset: float) -> Glyph:
    return Glyph(glyph.text, glyph.x0 + offset, glyph.y0, glyph.x1 + offset, glyph.y1, glyph.page, offset)


def circled_apart(glyph: Glyph) -> list[Glyph]:
    """An amount and the circled 節 number after it read as one word (`16,940④`): the two words."""
    found = CIRCLED.search(glyph.text)
    if not found or not found.start():
        return [glyph]
    cut = glyph.x0 + (glyph.x1 - glyph.x0) * found.start() / len(glyph.text)
    return [Glyph(glyph.text[:found.start()], glyph.x0, glyph.y0, cut, glyph.y1, glyph.page, glyph.offset),
            Glyph(found.group(), cut, glyph.y0, glyph.x1, glyph.y1, glyph.page, glyph.offset)]


def opened(line: list[Glyph]) -> list[Glyph]:
    """An opening bracket OCR boxed alone (`(` `1) 事務費`) joined to the word after it."""
    result: list[Glyph] = []
    for glyph in sorted(line, key=lambda g: g.x0):
        if result and normalize(result[-1].text) in ('(', '（') and glyph.x0 - result[-1].x1 <= JOIN:
            # the line's height, not the bracket's: a bracket's box runs below the line
            result[-1] = Glyph(result[-1].text + glyph.text, result[-1].x0, glyph.y0, glyph.x1, glyph.y1, glyph.page,
                               glyph.offset)
            continue
        result.append(glyph)
    return [part for glyph in result for part in numbered_apart(glyph)]


def numbered_apart(glyph: Glyph) -> list[Glyph]:
    """A bracketed number and its name read as one word (`(1) 事務費`): the two words, the name where it is printed.
    Cut by the letters, the name would start under the items' names below it, and read as the first line of them."""
    found = NUMBERED.match(glyph.text)
    if not found or found.end() == len(glyph.text):
        return [glyph]
    end = glyph.x0 + NUMBER_WIDTH * len(found.group(1))
    return [Glyph(found.group(1), glyph.x0, glyph.y0, end, glyph.y1, glyph.page, glyph.offset),
            Glyph(glyph.text[found.end():], end + NAME_GAP, glyph.y0, max(glyph.x1, end + NAME_GAP + 1), glyph.y1,
                  glyph.page, glyph.offset)]


def counted(glyph: Glyph, after: Glyph) -> bool:
    """A figure in the middle of a 説明 line, before the line's amount: a count with its unit (`1回 185,000 部`,
    `年額 12,500 円`)."""
    shown = normalize(glyph.text)
    if not COUNTED.match(shown) or not any(c.isdigit() for c in shown):
        return False
    return not shown[-1].isdigit() or re.match(COUNTERS, normalize(after.text)) is not None


def merged(line: list[Glyph]) -> list[Glyph]:
    """The parts of an amount OCR split (see the module doc) as one glyph: their digits, grouped by three where OCR
    lost or misplaced a comma (`10` `24,481` is 1,024,481)."""
    result: list[Glyph] = []
    for glyph in sorted(line, key=lambda g: g.x0):
        previous = result[-1] if result else None
        if previous and glyph.x0 - previous.x1 <= JOIN and DIGITS.match(normalize(previous.text)) \
                and DIGITS.match(normalize(glyph.text)):
            joined = normalize(previous.text + glyph.text)
            if not is_amount(joined) or ',' not in joined:  # `10` `00`: 1,000, as the row above prints it
                sign, digits = joined[:1] if joined[0] in '△▲' else '', joined.lstrip('△▲').replace(',', '')
                joined = sign + f'{int(digits):,}' if digits.isdigit() and not digits.startswith('0') else joined
            if is_amount(joined):
                result[-1] = Glyph(joined, previous.x0, min(previous.y0, glyph.y0), glyph.x1, max(previous.y1, glyph.y1),
                                   glyph.page, glyph.offset)
                continue
        result.append(glyph)
    return result


def subject_lines(words: list[Glyph], edge: float) -> list[Glyph]:
    """The 款・項・目 rows with each wrapped name joined to the line of its code and amounts (see the module doc)."""
    found = lines(words)
    priced = [line for line in found if any(g.x0 >= edge for g in line)]
    if not priced:
        return words
    parts: dict[int, list[list[Glyph]]] = {id(line): [] for line in priced}
    for line in found:
        if line in priced:
            continue
        middle = (line[0].y0 + line[0].y1) / 2
        nearest = min(priced, key=lambda p: abs((p[0].y0 + p[0].y1) / 2 - middle))
        parts[id(nearest)].append(line)
    result = []
    for line in priced:
        labels = sorted((g for g in line if g.x0 < edge), key=lambda g: g.x0)
        result += [g for g in line if g.x0 >= edge]
        if not labels and not parts[id(line)]:
            continue
        middle = (line[0].y0 + line[0].y1) / 2
        code = []
        if labels and CODE.match(normalize(labels[0].text)):
            first = labels.pop(0)
            size = len(CODE.match(normalize(first.text)).group(1))  # `２広`: a wide digit is one letter
            width = (first.x1 - first.x0) / len(first.text)
            cut = first.x0 + size * width
            code = [Glyph(first.text[:size], first.x0, first.y0, cut, first.y1, first.page, first.offset)]
            labels.insert(0, Glyph(first.text[size:], cut, first.y0, first.x1, first.y1, first.page, first.offset))
        elif labels and normalize(labels[0].text).isdigit():
            code = [labels.pop(0)]
        above = [g for part in parts[id(line)] if (part[0].y0 + part[0].y1) / 2 < middle for g in sorted(part, key=lambda g: g.x0)]
        below = [g for part in parts[id(line)] if (part[0].y0 + part[0].y1) / 2 > middle for g in sorted(part, key=lambda g: g.x0)]
        name = above + labels + below
        if not code and not name:
            continue
        top, bottom = (code or name)[0].y0, (code or name)[0].y1
        result += code
        if name:
            # a row with no code (a 項・目 in its last year, `傷病手当金` 0) starts where the coded rows of its level do
            start = code[0].x1 + 5 if code else min(g.x0 for g in name) - UNCODED
            result.append(Glyph(''.join(g.text for g in name), start, top,
                                min(start + sum(g.x1 - g.x0 for g in name), edge - 1), bottom, name[0].page, name[0].offset))
    return result


def setsu_line(names: list[Glyph], left: float) -> list[Glyph]:
    """A 節 line as its code and its name, the name where every 節 name starts: OCR boxes the code alone (`9` `交` `際`
    `費`) or with the first letter (`10需` `用` `費`), and a name cut from it by its letters starts a few points off,
    while the 節 are all of one level."""
    first = names[0]
    found = CODE.match(normalize(first.text))
    if found and len(found.group(1)) < len(first.text):
        width = (first.x1 - first.x0) / len(first.text)
        code, rest = first.text[:len(found.group(1))], [Glyph(first.text[len(found.group(1)):], first.x0, first.y0,
                                                              first.x1, first.y1, first.page, first.offset)]
    elif normalize(first.text).isdigit():
        width, code, rest = (first.x1 - first.x0) / len(first.text), first.text, []
    else:
        width, code, rest = 0, '', [first]
    rest += names[1:]
    top, bottom = min(g.y0 for g in names), max(g.y1 for g in names)
    result = [Glyph(code, first.x0, top, first.x0 + width * len(code), bottom, first.page, first.offset)] if code else []
    if rest:
        start = left + SETSU_NAME
        result.append(Glyph(''.join(g.text for g in rest), start, top, start + sum(g.x1 - g.x0 for g in rest), bottom,
                            first.page, first.offset))
    return result


def edges(bands: list[Band]) -> tuple[float, float, float] | None:
    """The right edges of the 款・項・目, 本年度 and 前年度 columns: the 節 table's 区分 and 金額 stand in the last two."""
    def right(word: str) -> float | None:
        found = [b.x1 for b in bands if b.header and normalize(b.header[-1]) == word]
        return max(found) if found else None
    subject = [b.x1 for b in bands if b.header and set(normalize(b.header[-1])) <= set('款項目')]
    current, previous = right('本年度'), right('前年度')
    if subject and current is not None and previous is not None:
        return max(subject), current, previous
    # The header read as one cell (`款項目本年度前年度比較`), or the account's title over it (`3 歳出`) read as the
    # header: the three columns of amounts are the frame's last three.
    ordered = sorted(bands, key=lambda b: b.x0)
    if len(ordered) >= 4 and len({b.header for b in ordered}) == 1:
        return ordered[-3].x0, ordered[-2].x0, ordered[-1].x0
    return None


def rows_of(bands: list[Band], x0: float, x1: float) -> list[float]:
    """The row rules of the printed column under these x (the widest band that covers its middle)."""
    middle = (x0 + x1) / 2
    covering = [b for b in bands if b.x0 <= middle <= b.x1]
    return sorted(max(covering, key=lambda b: b.x1 - b.x0).rows) if covering else []


def apart(logicals: list[layout.Logical]) -> list[layout.Logical]:
    """Each page a logical page of its own: a page that goes on with a 説明 has no 款・項・目 column, and when its
    rules line up with the page before, `layout.logical_pages` joins the two as a spread."""
    result = []
    for logical in logicals:
        for number in logical.pages:
            bands = [b for b in logical.bands if b.page == number]
            for band in bands:
                offset = band.offset
                band.x0 -= offset; band.x1 -= offset; band.offset = 0.0
                band.spans = [(a - offset, b - offset, t) for a, b, t in band.spans]
                for word in band.words:
                    word.x0 -= offset; word.x1 -= offset; word.offset = 0.0
            result.append(replace(logical, pages=[number], bands=bands,
                                  outside=[g for g in logical.outside if g.page == number],
                                  foot={k: v for k, v in logical.foot.items() if k == number}))
    return result


def read(pages, **options):
    logicals = apart(layout.logical_pages(pages, **options))
    known: tuple[float, float, float] | None = None
    for logical in logicals:
        if not logical.bands:
            continue
        known = edges(logical.bands) or known
        if known is None:
            continue
        name_edge, current_edge, previous_edge = known
        bands = logical.bands
        top = min((b.top if b.top is not None else b.body_top) for b in bands)
        bottom = max(b.body_bottom for b in bands)
        left = min(b.x0 for b in bands)
        right = max(b.x1 for b in bands)
        inside = [g for g in logical.outside if top - 1 <= g.y0 and g.y1 <= bottom + 1 and left - 1 <= g.x0 <= right]
        taken = {id(g) for g in inside}
        logical.outside = [g for g in logical.outside if id(g) not in taken]
        words = [w for b in bands for w in b.words] + inside
        page = bands[0].page
        found = lines(words)
        marks = [marker(line) for line in found]
        first = next((m for m in marks if m), None)
        state = 'subject' if first == 'head' else 'explanation'
        parts: dict[str, list[Glyph]] = {'subject': [], 'table': [], 'explanation': []}
        funding: list[list[Glyph]] = []
        for line, mark in zip(found, marks):
            if mark:
                state = mark
                continue
            kept = [g for g in line if normalize(g.text) != UNIT]
            if not kept or state == 'head':
                continue
            if state == 'table':
                funding.append([g for g in kept if (g.x0 + g.x1) / 2 < current_edge])
                kept = [g for g in kept if (g.x0 + g.x1) / 2 >= current_edge]
            parts[state].append(kept)
        circle = previous_edge + CIRCLE
        subject_words = []
        for line in parts['subject']:
            labels = [g for g in line if (g.x0 + g.x1) / 2 < name_edge]
            amounts = [g for g in line if (g.x0 + g.x1) / 2 >= name_edge]
            for low, high in ((name_edge, current_edge), (current_edge, previous_edge), (previous_edge, right + 1)):
                labels += merged([g for g in amounts if low <= (g.x0 + g.x1) / 2 < high])
            subject_words += labels
        subject_words = subject_lines(subject_words, name_edge)
        setsu_names, setsu_amounts = [], []
        # a letter-spaced 節 name prints its middle character a little higher (`4共` `済` `費`)
        for line in lines([g for line in parts['table'] for g in line], tolerance=4):
            names = sorted((g for g in line if (g.x0 + g.x1) / 2 < previous_edge), key=lambda g: g.x0)
            if names:
                setsu_names += [shifted(g, SETSU_OFFSET) for g in setsu_line(names, current_edge)]
            setsu_amounts += [shifted(g, SETSU_OFFSET)
                              for g in merged([g for g in line if (g.x0 + g.x1) / 2 >= previous_edge])]
        explanation, circles, figures = [], [], []
        for line in parts['explanation']:
            line = [part for g in line for part in circled_apart(g)]
            line = opened([replace(g, text=LONG_VOWEL.sub('ー', g.text)) for g in line])
            body = [g for g in line if g.x0 < circle]
            if body and FIGURE.search(normalize(text(body))) and not is_amount(normalize(body[-1].text)):
                figures.append(body)
                circles += [g for g in line if g.x0 >= circle]
                continue
            figures += [[g] for g, after in zip(body, body[1:-1] + [None]) if after is not None and counted(g, after)]
            circles += [g for g in line if g.x0 >= circle]
            explanation += [shifted(g, 2 * SETSU_OFFSET) for g in merged([g for g in line if g.x0 < circle])]
        template = bands[0]

        def band(x0, x1, header, kind, words, offset, spans=None, axis=None):
            return replace(template, x0=x0 + offset, x1=x1 + offset, header=header, kind=kind, words=words,
                           offset=offset, rows=rows_of(bands, x0, x1), body_top=min(b.body_top for b in bands),
                           body_bottom=bottom, spans=spans or [(x0 + offset, x1 + offset, header[-1])],
                           left_rules=[], unit_mark=None, axis_header=axis, ignored=False, inline=False,
                           inline_free=False, excluded=None, stripped_codes=False, staircase=False)

        built = [band(left, name_edge, ('款項目',), 'label', subject_words, 0),
                 band(name_edge, current_edge, ('本年度予算額',), 'amount',
                      [g for g in subject_words if name_edge <= (g.x0 + g.x1) / 2 < current_edge], 0),
                 band(current_edge, previous_edge, ('前年度予算額',), 'amount',
                      [g for g in subject_words if current_edge <= (g.x0 + g.x1) / 2 < previous_edge], 0),
                 band(previous_edge, right, ('比較',), 'amount',
                      [g for g in subject_words if (g.x0 + g.x1) / 2 >= previous_edge], 0)]
        built[0].words = [g for g in subject_words if (g.x0 + g.x1) / 2 < name_edge]
        setsu = (current_edge + SETSU_OFFSET, right + SETSU_OFFSET, '節')
        built += [band(current_edge, previous_edge, ('節', '区分'), 'label', setsu_names, SETSU_OFFSET,
                       spans=[setsu, (current_edge + SETSU_OFFSET, previous_edge + SETSU_OFFSET, '区分')], axis='節'),
                  band(previous_edge, right, ('節', '金額'), 'amount', setsu_amounts, SETSU_OFFSET,
                       spans=[setsu, (previous_edge + SETSU_OFFSET, right + SETSU_OFFSET, '金額')]),
                  band(left, circle, ('説明',), 'label', explanation, 2 * SETSU_OFFSET)]
        for kind, reason, groups in ((FUNDING, FUNDING_REASON, [g for g in funding if g]),
                                     ('本文', FIGURE_REASON, figures),
                                     ('本文', CIRCLE_REASON, [[g] for g in circles if any(c.isdigit() for c in normalize(g.text))])):
            for group in groups:
                box = [min(g.x0 for g in group), min(g.y0 for g in group), max(g.x1 for g in group), max(g.y1 for g in group)]
                excluded = band(right, right + 10, ('節番号' if kind == '本文' else FUNDING,), None, [], 3 * SETSU_OFFSET)
                excluded.excluded = {'kind': kind, 'reason': reason, 'page': page,
                                     'bbox': [box[0] - 1, box[1] - 1, box[2] + 1, box[3] + 1]}
                built.append(excluded)
        # the account's title over the first page (`3 歳出`) read as the frame's header: its number is no amount
        if any(TITLE.match(normalize(cell)) for b in bands for cell in b.header):
            title = band(right, right + 10, ('題',), None, [], 3 * SETSU_OFFSET)
            title.excluded = {'kind': '本文', 'reason': TITLE_REASON, 'page': page,
                              'bbox': [left, top - 30, right, min(b.body_top for b in bands)]}
            built.append(title)
        logical.bands = built
        logical.unit = logical.unit or UNIT
    return logicals
