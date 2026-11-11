"""Stages 4–5: items, left–right ownership of amounts, and the tree.

* Label groups: neighbouring label bands whose header leaves are 款・項・目 form
  the subject axis (科目). Every other label band is its own axis, named by the
  lowest header cell that spans it together with its amount bands.
* Items: in a label group, a printed code or an amount starts an item; other
  lines continue it. A rule-bounded cell holding one code is one item, so a code
  printed beside a wrapped name joins it.
* Left–right: an amount in an amount band belongs to the item, in the nearest
  label group to its left, whose first line lies in the amount's rule-bounded
  row. An amount inside a label band belongs to the item on its own line.
* Up–down: subject depth is the 款・項・目 band where the code starts. Other axes
  rank the indentation of the name start, learned over the document. Parents are
  the nearest shallower open item; the roots of other axes hang under the open
  subject item. A subject code equal to the open one at that depth repeats it.
"""
from __future__ import annotations

from collections import Counter, defaultdict
from bisect import bisect_right
from math import floor
from dataclasses import dataclass, field, replace
import hashlib
import re
import unicodedata

from ingestion.generic.patterns import document_quirk, load as load_pattern, quirk
from ingestion.generic.notes import kind_of, reads_as_note
from ingestion.lib.node_tables import amount_phase, phase_dictionary
from shared.amount import number
from ingestion.generic.layout import (SIGNS, SUBJECT_LEVELS, UNIT_CELL, Band, Glyph, Logical, is_amount, kind_heading, lines,
                                      normalize, runs, text)

# A leading item number; the separator after it (`1.議会費`, `1．`) is not part of the name.
CODE = re.compile(r'^[(（]?([0-9０-９]{1,4})[)）]?(?:[.．](?=[^0-9０-９]|$))?(?=\D|$)')
UNIT_NOTATION = re.compile(r'[(（]単位[:：][^()（）]*[)）]')
BARE_CODE = re.compile(r'^[0-9０-９]{1,4}$')
# A reading in katakana printed in brackets right after a number (`73（ナナサン）`): the number is part of a name.
READING = re.compile(r'[(（][ァ-ヶー]+[)）]')
BRACKET_PAIRS = {')': '(', ']': '['}  # the closing and opening brackets of a bracketed amount
BRACKETS = {'(', ')', '（', '）'}  # a stacked amount's brackets printed as words of their own (`(` `1,110,941` `)`)
AGE = re.compile(r'(歳|歲|箇月|か月|ヶ月|ケ月|カ月)')
CODE_LED = re.compile(r'^[0-9０-９]{1,4}[^0-9０-９,，.．]')  # a code joined to its name (`1商`)
TRANSFER = re.compile(r'(流用|充用|充当|予備費支出|予備費充当|予備費[よか]り|第[0-9０-９]+節[へか]|^第[0-9０-９]+[款項目節]|^[○〇●]?同[款項目])')
# The words that end a transfer remark begun on the line above (`…費` / `から流用 13,281,000円`).
# A transfer remark ends with the word (`…へ流用`): a line after it is another remark, even when it reaches the column's limit.
ENDED_TRANSFER = re.compile(r'(?:流用|充用)$')
# A kind word printed above an amount inside an amount column's cell (a stacked carry-over column).
SUPPLEMENT_ROUND = re.compile(r'第[0-9０-９]+次補正')  # the round of a supplementary budget printed over its amount
# The history of the year's supplementary budgets printed under an item's amount in its column (131113): `補正経過`, then
# each round in brackets with its amount in brackets, then `計` and the amount after the rounds in brackets.
REVISION_HISTORY = '補正経過'
REVISION_LABEL = re.compile(r'[(（]?第[0-9０-９]+次補正[)）]?')
PAREN_AMOUNT = re.compile(r'[(（][△▲\-]?[0-9][0-9,]*[)）]')
line_middle = lambda line: sum((g.y0 + g.y1) / 2 for g in line) / len(line)
money_page = lambda line: line[0].page
STACKED_KIND = re.compile(r'(翌年度)?(繰越明許費?|事故繰越し?|継続費逓次繰越|不用額)|' + SUPPLEMENT_ROUND.pattern)
HEADING_INDENT = 6  # pt: the least a heading's lines are indented for the level learning to keep their level (3pt clusters, 6pt apart)
# A total row ends in 合計・総計 (`歳出合計`); a name that contains the letters (`長期総合計画に要する経費`) is not one.
WIDE_DIGITS = re.compile(r'[０-９]+')
TOTAL = re.compile(r'(合計|総計)$|^計$')
# A reserve's remark that names where it went: `…へ`, `…へ充当`.
RESERVE_DESTINATION = re.compile(r'へ(?:予備費)?(?:充当|充用|補充)?$')


@dataclass
class Group:
    bands: list[Band]
    axis: str
    subject: bool
    mode: str = 'bands'  # how the subject group marks its levels (see SUBJECT_PATTERNS)
    levels: int | None = None  # number of subject levels
    kana: object = field(default=None, compare=False, repr=False)  # the axis's quirk `kana_set_apart`, if selected
    numbers_right: object = field(default=None, compare=False, repr=False)  # the axis's quirk `numbers_set_right`

    @property
    def x0(self) -> float:
        return self.bands[0].x0

    @property
    def x1(self) -> float:
        return self.bands[-1].x1


@dataclass
class Item:
    group: Group
    page: int
    lines: list[list[Glyph]]
    code: str | None
    name: str
    indent: float
    level: int | None = None  # subject level index (0 = 款)
    level_name: str | None = None  # printed level name when it is not a band header
    amounts: list[tuple[str, list[Glyph]]] = field(default_factory=list)  # (header path, glyphs)
    role: str = 'node'  # node | note | total
    key: str | None = None
    parent: 'Item | None' = None
    depth: int | None = None
    fixed_anchor: float | None = None
    heading: bool = False  # a name-only line that heads the lines under it (`headings`)
    decided: bool = False  # role chosen by a judgment, not by the geometric rules
    hint: str | None = None  # the kind of the note whose parts this item prints (`note_breakdown`)
    title_depth: int = 1  # the depth of a title (level -1): 1 for a 款, 2 for a 項 (`Logical.level_titles`)
    unnumbered_shift: int = 0  # levels an unnumbered line sits below its indent (the quirk `unnumbered_shift`)
    kinds: list[tuple[list[Glyph], list[Glyph], str]] = field(default_factory=list)  # (label, amount run, heading) of kind lines
    shift: float = 0.0  # how far right of the axis's usual column edge the item's column stands (`column_edge`)
    sums: bool = False  # a heading over the items after it at its own level, up to their sum (`group_heads`)

    @property
    def glyphs(self) -> list[Glyph]:
        return [g for line in self.lines for g in line]

    @property
    def y0(self) -> float:
        return min(g.y0 for g in self.glyphs)

    @property
    def y1(self) -> float:
        return max(g.y1 for g in self.glyphs)

    @property
    def anchor(self) -> float:
        """Vertical centre of the line that carries the code (or the first line)."""
        if self.fixed_anchor is not None:
            return self.fixed_anchor
        for line in self.lines:
            if self.code is not None and CODE.match(normalize(text(line))):
                return sum((g.y0 + g.y1) / 2 for g in line) / len(line)
        line = self.lines[0]
        return sum((g.y0 + g.y1) / 2 for g in line) / len(line)


# How a document marks subject (款・項・目) levels. Each is tried on every
# document and the tree that closes best wins (build.choose_pattern).
SUBJECT_PATTERNS = ('bands', 'names', 'indent')
# A header cell that names the subject column: 科目, or the levels themselves (`款`, `項・目`, `(款)(項)(目)`).
# A cell that only contains 項目 inside a longer name (`予備費充当項目`) names something else.
SUBJECT_CELL = re.compile(r'(?:[(（]?[款項目][)）]?[・･、,，]?)+')


def subject_header(header: tuple[str, ...]) -> bool:
    cells = [re.sub(r'\s+', '', cell) for cell in header]
    return any('科目' in cell or SUBJECT_CELL.fullmatch(cell) for cell in cells)


def _breakdown_axis(band: Band, bands: list[Band]) -> str:
    """The lowest header cell spanning this band and a neighbouring amount band.

    A cell that the page edge cuts (a heading printed across a spread, 131148's
    節 over 区分 | 金額) counts as spanning the amount band on the other page.
    """
    if band.axis_header:
        return band.axis_header
    axis = band.header[-1] if band.header else '備考'
    page_end = max(b.x1 for b in bands if b.page == band.page)
    column = _column(band, bands)
    for x0, x1, label in reversed(band.spans[:-1]):
        covered = [b for b in bands if x0 - 1 <= b.center <= x1 + 1]
        if not all(any(b is c for c in column) or b.kind != 'label' for b in covered):
            continue
        if any(b.kind == 'amount' for b in covered) or (x1 >= page_end - 1 and band.x1 >= page_end - 1):
            return label
    return axis


def _column(band: Band, bands: list[Band]) -> list[Band]:
    """The label bands that are one column with this one: a column that a rule splits in two (the numbers
    of the 節 left of their names) has the same heading over both parts, and they touch."""
    ordered = sorted((b for b in bands if b.kind == 'label' and b.page == band.page and b.header == band.header),
                     key=lambda b: b.x0)
    if band not in ordered:
        return [band]
    start = end = ordered.index(band)
    while start > 0 and abs(ordered[start - 1].x1 - ordered[start].x0) < 1.5:
        start -= 1
    while end + 1 < len(ordered) and abs(ordered[end].x1 - ordered[end + 1].x0) < 1.5:
        end += 1
    return ordered[start:end + 1]


def groups(logical: Logical, pattern: str = 'bands') -> list[Group]:
    """Label bands into groups; `pattern` decides which bands carry the subject and how.

    bands  – 款・項・目 each have a band; the band where a code starts is the level.
    names  – as bands, plus the neighbouring name band that the codes share.
    indent – one subject column; levels by indentation (codes optional).
    """
    bands = sorted(logical.bands, key=lambda b: b.x0)
    return _groups(bands, load_pattern("subject", pattern).select(bands))


def code_columns(bands):
    subject_bands = []
    for index, band in enumerate(bands):
        if band.kind == 'label' and band.header and band.header[-1] in SUBJECT_LEVELS:
            if subject_bands and subject_bands[-1] is not bands[index - 1]:
                break
            subject_bands.append(band)
    return subject_bands, "bands", len(subject_bands)


def column_groups(logical):
    bands = sorted(logical.bands, key=lambda b: b.x0)
    return _groups(bands, code_columns(bands))


def _groups(bands, selection):
    subject_bands, mode, count = selection
    result: list[Group] = []
    for band in bands:
        if band in subject_bands:
            if band is subject_bands[0]:
                result.append(Group(list(subject_bands), '科目', True, mode, count))
            continue
        if band.kind != 'label':
            continue
        last = result[-1] if result else None
        if (last is not None and not last.subject and any(last.bands[-1] is b for b in _column(band, bands))
                and last.bands[-1] is not band):
            # A column that a rule splits in two (the numbers of the 節 left of its names): one column.
            last.bands.append(band)
            continue
        result.append(Group([band], _breakdown_axis(band, bands), False))
    return result


BULLET = re.compile(r'^[〇○●◎□■◇◆]')
# The words that qualify a printed amount as carried over (`一部繰越明許`, `逓次繰越`), printed after it.
CARRY_OVER_TAG = re.compile(r'[(（]?(?:一部)?(?:繰越明許費?|逓次繰越|事故繰越し?)[)）]?')
# Every parenthesised remark at the end of a name (`委託料（…へ流用△280,000）（…から流用1,815,000）`).
PAREN_TAIL = re.compile(r'(?:[(（][^()（）]*[)）])+$')
# A number printed against a counter word (`110番`, `3歳児`, `3階`, `2025年`) is a count in a name.
# An item number glued to a year it is followed by (`42025年…`: 4 and 2025年).
YEAR_LED = re.compile(r'^([0-9]{1,2})(?:19|20)[0-9]{2}年')
COUNTED = re.compile(r'^[0-9０-９]+(?:番(?!号)|歳|階|年|か月|ヶ月|箇所|世帯|ミリ|キロ|メートル|インチ|時間(?!外))')
GROUPED = re.compile(r'[△▲]?[0-9]{1,3}(?:,[0-9]{3})+')
YEN_AMOUNT = re.compile(r'[△▲]?[0-9]{1,3}(?:,[0-9]{3})+円')
# An amount printed against text spilling in from the next band (`44,406,439,217明許`).
LEADING_AMOUNT = re.compile(r'([△▲]?[0-9]{1,3}(?:,[0-9]{3})+)(?=[^0-9,])')


def has_text(name: str) -> bool:
    """Whether a name has a letter (kana, kanji, latin)."""
    return any(c.isalpha() for c in normalize(name))


def is_account_code(name: str) -> bool:
    """A printed account code (`・020601【010261】`): digits and punctuation only, four digits or more. A
    lone `)` that closes a wrapped name and an amount with grouping or a negative mark are no codes."""
    value = normalize(name)
    return (not has_text(value) and not value.startswith('-') and not any(c in value for c in ',△▲')
            and sum(c.isdigit() for c in value) >= 4)


def note_breakdown(items: list['Item'], subject_starts: tuple[float, ...] = (), min_parts: int = 2) -> None:
    """Lines printed under a note that add up to its amount are its parts, not items of the breakdown.

    `繰越事業費不用額 308,157,706 円` over `役務費 3,897,706 円` and `負担金、補助及び交付金 304,260,000 円`:
    the two lines are the note's own breakdown. They take the note's kind (a wrapped line of a note's cell
    inherits it, ADR 0024). Two or more lines whose sum is exactly the note's amount: a single line of the
    same amount could as well be an item that costs what the note says. A document that prints one
    part per note says so in its layout settings (`single_part_notes`: `min_parts` is 1).
    """
    for index, note in enumerate(items):
        if note.role != 'annotation' or note.code is not None or len(note.amounts) != 1:
            continue
        header, run = note.amounts[0]
        total = number(normalize(text(run)))
        kind = kind_of(PAREN_TAIL.sub('', note.name), words=True)
        if not total or total < 0 or kind is None:
            continue
        taken, running = [], 0
        subject = bisect_right(subject_starts, note.anchor)
        previous = note
        for follower in items[index + 1:]:
            if follower.role != 'node' or follower.code is not None or len(follower.amounts) != 1 \
                    or follower.amounts[0][0] != header or follower.kinds or not has_text(follower.name):
                break
            if (bisect_right(subject_starts, follower.anchor) != subject or follower.page != previous.page
                    or follower.y0 - previous.y1 > 1.8 * max(g.y1 - g.y0 for g in follower.glyphs)):
                break
            value = number(normalize(text(follower.amounts[0][1])))
            if value is None or value < 0 or running + value > total:
                break
            taken.append(follower)
            previous = follower
            running += value
            if running == total:
                break
        if running == total and len(taken) >= min_parts:
            for follower in taken:
                follower.role = 'annotation'
                follower.hint = kind


def _stacked_word(glyph: Glyph) -> Glyph:
    """A word of a column of stacked lines (`columns.<見出し>.lines`): the closing bracket of `(1,532)` read on the
    figure (`90)`) is no digit, and `A` read for the `△` before a figure is its sign (国分寺市)."""
    if glyph.text == 'A':
        return replace(glyph, text='△')
    bare = glyph.text.rstrip(')）')
    return replace(glyph, text=bare) if bare != glyph.text and bare and is_amount(bare) else glyph


def _split_code(line_text: str) -> tuple[str | None, str]:
    """A leading item number and the name. Numbers start from 1, so a leading 0 is a
    bullet drawn as a digit; bullet marks (〇) mark a level and are not part of the name."""
    found = CODE.match(line_text)
    if found and line_text[found.end():found.end() + 1] in ('～', '〜', '~'):  # `3～4か月児…` is a range in a name
        return None, line_text
    if found and AGE.match(line_text, found.end()):  # `1歳6箇月児健康診査…`: an age in a name
        return None, line_text
    if found and READING.match(line_text, found.end()):  # `73（ナナサン）歯科健診事業`: the number's reading, a name
        return None, line_text
    if not found or int(unicodedata.normalize('NFKC', found.group(1))) == 0:
        if found:
            line_text = line_text[found.end():].strip()
        return None, BULLET.sub('', line_text)
    return found.group(1), line_text[found.end():].strip()


def _cell(band: Band, y: float) -> tuple[float, float]:
    above = [r for r in band.rows if r <= y + .5]
    below = [r for r in band.rows if r > y + .5]
    return (above[-1] if above else band.body_top, below[0] if below else band.body_bottom)


def _split_line(line: list[Glyph], amount_brackets: bool = False, bare_amounts: bool = False) -> tuple[list[Glyph], list[list[Glyph]]]:
    parts = runs(line)
    closing = normalize(text(line))[-1:]
    if amount_brackets and closing in BRACKET_PAIRS:  # `(187,037,067)`, and the 事業 total over it `[187,037,067]`
        for start in range(len(parts) - 1, -1, -1):
            tail = [g for part in parts[start:] for g in part]
            shown = normalize(text(tail))
            if shown.startswith(BRACKET_PAIRS[closing]) and number(shown) is not None:
                return [g for part in parts[:start] for g in part], [tail]
        if len(parts) > 1 and normalize(text(line)).startswith(BRACKET_PAIRS[closing]):
            # `（委員長 780,000）`: a whole line in brackets, a name and its amount. The closing bracket is no digit.
            run = _cut(parts[-1], len(text(parts[-1])) - 1)[0]
            if run and is_amount(text(run)) and number(text(run)) is not None:
                return [g for part in parts[:-1] for g in part], [run]
        # OCR left the opening bracket unread (`負担金補助及び交付金` `48,005,970)`), or read it as a letter
        # (`C21,368,656)`): a grouped amount closed by the bracket is the bracketed amount all the same.
        unread = document_quirk('unopened_brackets')
        letters = unread.module.LETTERS if unread is not None else 'CcＣ'
        take = 2 if len(parts) > 2 and normalize(text(parts[-1])) == closing else 1  # `48,005,970` `)`
        last = [g for part in parts[-take:] for g in part] if len(parts) > take else []
        unopened = re.fullmatch(rf'([{letters}]?)([△▲]?[0-9]{{1,3}}(?:,[0-9]{{3}})+)[)\]）］]', normalize(text(last)))
        if unopened and BRACKET_PAIRS[closing] not in normalize(text(line)):
            tail = _cut(last, len(unopened.group(1)))[1]  # the letter OCR read for the bracket is no name
            tail = _cut(tail, len(unopened.group(2)))[0]  # the closing bracket is no digit
            if number(normalize(text(tail))) is not None:
                head = [g for part in parts[:-take] for g in part]
                return (unread.module.head(head, unopened.group(1)) if unread is not None else head), [tail]
        glyphs = [g for part in parts for g in part]
        if unread is not None and (split := unread.module.glued(glyphs)) is not None:
            return split
        # The bracket printed flush against a long name, inside one of Poppler's words (`…課）(1,04` `7,226)`).
        flush = re.match(r'^(.*[^(\[（［])([(\[（［][△▲]?[0-9]{1,3}(?:,[0-9]{3})*[)\]）］])$', text(glyphs))
        if flush:
            head, tail = _cut(glyphs, len(flush.group(1)))
            if number(normalize(text(tail))) is not None:
                return head, [tail]
    # The unit mark printed after an amount (`12,409,365 円`, or touching it: `393,230円`) is not part of the
    # name and not a digit: the amount stays the line's last run.
    if parts and len(parts[-1]) == 1 and YEN_AMOUNT.fullmatch(normalize(parts[-1][0].text)):
        glyph = parts[-1][0]
        width = (glyph.x1 - glyph.x0) / len(glyph.text)
        keep = len(glyph.text) - 1
        parts[-1] = [Glyph(glyph.text[:keep], glyph.x0, glyph.y0, glyph.x0 + keep * width, glyph.y1, glyph.page, glyph.offset)]
    # The carry-over a printed amount partly is (`通信運搬費 597,301 一部繰越明許`): a word after the amount that
    # is no part of the item's name or of the amount. The amount stays the line's last run.
    if len(parts) >= 3 and CARRY_OVER_TAG.fullmatch(normalize(text(parts[-1]))) and is_amount(text(parts[-2])):
        parts.pop()
    while parts and len(parts[-1]) > 1 and normalize(parts[-1][-1].text) == '円' and is_amount(text(parts[-1][:-1])):
        parts[-1] = parts[-1][:-1]
    while len(parts) > 1 and normalize(text(parts[-1])) == '円' and is_amount(text(parts[-2])):
        parts.pop()
    money = []
    while parts and is_amount(text(parts[-1])) and len(parts) > 1:
        if not money and (listed := document_quirk('list_cut')) is not None and listed.module.cut(parts):
            break
        money.insert(0, parts.pop())
    # Full-width digits without a comma before a half-width grouped amount are part of the name (`…東京２０２４ 1,619,271`).
    while len(money) > 1 and WIDE_DIGITS.fullmatch(text(money[0])) and GROUPED.fullmatch(normalize(text(money[-1]))) \
            and not WIDE_DIGITS.search(text(money[-1])):
        parts.append(money.pop(0))
    if len(parts) == 1 and normalize(text(parts[0])) == '0':
        return [], [parts[0]]  # a line that is only `0` is a printed zero amount: no item is numbered 0
    if bare_amounts and len(parts) == 1 and re.fullmatch(r'[0-9]{1,3}', normalize(text(parts[0]))):
        return [], [parts[0]]  # an axis whose items carry no number: a line that is only digits is the amount of the name above
    if len(parts) == 1 and GROUPED.fullmatch(normalize(text(parts[0]))):
        # A line that is only a grouped amount (`10,000` under a long name) is the
        # amount of the item above, not an item numbered 10. A bare `10` stays a label.
        return [], [parts[0]]
    if not money and parts:
        # A grouped amount printed flush against the name (`…】112,408,043`),
        # possibly starting inside a Poppler word: split that word proportionally.
        # A unit 円 set apart after it (`…から流用1,128,000 円`, the amount touching the name) is no part of the
        # amount, and no part of the name: it goes.
        unit = len(parts) > 1 and normalize(text(parts[-1])) == '円'
        last = parts[-2] if unit else parts[-1]
        joined = text(last)
        found = re.match(r'^(.*[^0-9,△▲])([△▲]?[0-9]{1,3}(?:,[0-9]{3})+)$', joined)
        if found:
            head, tail = _cut(last, len(found.group(1)))
            if unit:
                parts.pop()
            parts[-1], money = head, [tail]
    return [g for part in parts for g in part], money


def _cut(glyphs: list[Glyph], cut: int) -> tuple[list[Glyph], list[Glyph]]:
    """The glyphs before and after a character position of their joined text; a word cut inside is split proportionally."""
    consumed = 0
    for index, glyph in enumerate(glyphs):
        if consumed + len(glyph.text) > cut:
            inner = cut - consumed
            if not inner:
                return glyphs[:index], glyphs[index:]
            width = (glyph.x1 - glyph.x0) / len(glyph.text)
            x = glyph.x0 + inner * width
            head = Glyph(glyph.text[:inner], glyph.x0, glyph.y0, x, glyph.y1, glyph.page, glyph.offset)
            tail = Glyph(glyph.text[inner:], x, glyph.y0, glyph.x1, glyph.y1, glyph.page, glyph.offset)
            return glyphs[:index] + [head], [tail] + glyphs[index + 1:]
        consumed += len(glyph.text)
    return glyphs, []


def _leading_amount(glyph: Glyph) -> Glyph:
    """The amount part of a word in an amount band that runs on into text; other words unchanged."""
    found = LEADING_AMOUNT.match(glyph.text)
    if not found:
        return glyph
    width = (glyph.x1 - glyph.x0) / len(glyph.text)
    return Glyph(found.group(1), glyph.x0, glyph.y0, glyph.x0 + len(found.group(1)) * width, glyph.y1, glyph.page, glyph.offset)


# Headings of an amount column that sort by source of funds: names of items as well (`保険料` under `通信運搬費`).
FUNDING_HEADINGS = {'その他', '一般会計繰入金', '一般財源', '国庫支出金', '国都支出金', '都支出金', '地方債', '市債', '保険料'}


def is_amount_kind(label: str) -> bool:
    """A printed amount kind (支出済額・繰越明許費・不用額…) rather than an item name."""
    known = {header for _, header in phase_dictionary()} - FUNDING_HEADINGS
    return label in known or re.fullmatch(r'(翌年度)?(繰越明許費?|事故繰越し?|継続費逓次繰越|不用額|本年度支出額|支出済額)', label) is not None


def code_margins(logicals: list[Logical]) -> dict[str, set[int]]:
    """Left margins (rounded x) where printed codes start, per non-subject axis.

    A leading number counts as a code only at a margin where most lines start
    with one, so a name that begins with a digit (`3歳児…`) stays a name.
    """
    votes: dict[tuple[str, int], list[int]] = defaultdict(lambda: [0, 0])
    for logical in logicals:
        for group in column_groups(logical):
            if group.subject:
                continue
            labels = [label for label in (_split_line(line)[0] for line in lines([w for band in group.bands for w in band.words])) if label]
            coded = [_split_code(normalize(text(label)))[0] is not None for label in labels]
            # A name wrapped around its code, printed further left in the same rule-bounded cell (`18` /
            # `負担金補助` `及交付金`, 130001), is part of a numbered line: it does not vote that its start holds no code.
            centre = lambda label: sum((g.y0 + g.y1) / 2 for g in label) / len(label)
            # A cell listing several numbered lines (`1…` `2…` `3…` in a 備考 column) is a list, not one wrapped name.
            cells: dict[tuple, list[float]] = defaultdict(list)
            for label, numbered in zip(labels, coded):
                if numbered and group.bands[0].rows:
                    cells[label[0].page, _cell(group.bands[0], centre(label))].append(label[0].x0)
            for label, numbered in zip(labels, coded):
                starts = cells.get((label[0].page, _cell(group.bands[0], centre(label))), [])
                if not numbered and len(starts) == 1 and starts[0] < label[0].x0 - 3:
                    continue
                for margin in _margins(label):
                    votes[group.axis, margin][0 if numbered else 1] += 1
    margins: dict[str, set[int]] = defaultdict(set)
    for (axis, x), (coded, plain) in votes.items():
        if coded > plain:
            margins[axis].update({x - 1, x, x + 1})
    return margins


def _margins(label: list[Glyph]) -> tuple[int, int]:
    """Where a line starts, and where a leading number would end (codes align either way)."""
    first = label[0]
    raw = normalize(first.text)
    digits = len(raw) - len(raw.lstrip('0123456789'))
    # The number's own width: a half-width digit is half the line height. (The word's average character
    # width is a kanji's: it put the end of `1` in `1歳児…` where `02` of `02管理用備品` ends, 132276.)
    height = first.y1 - first.y0
    full = sum(1 for c in first.text[:max(digits, 1)] if not c.isascii())
    width = (max(digits, 1) - full) * height / 2 + full * height
    return round(first.x0), 10000 + round(first.x0 + width)


def strip_ancestor_codes(group: Group) -> list[Glyph]:
    """The ancestors' codes a page prints before an item's own (`10 10 徴税費`: 款 10, then 項 10; `10 5 10 (文書広報課)`:
    款, 項, then the 目 that the page goes on with; `10 1 2` alone, the name left out). Each is a bare number word of its own on the line's left;
    all but the last are removed from the band words and returned, so the line reads as its own code and name.

    A word of its own is set apart by a gap, or starts in another ruled column: 款・項・目 each in their column print their
    codes closer than the gap (`2` `1` `10`, 1.8pt), and a code joined to its name in the next column (`61` `1商` `工` `費`)
    is the item's own."""
    column = {id(w): index for index, band in enumerate(sorted(group.bands, key=lambda b: b.x0)) for w in band.words}
    removed: list[Glyph] = []
    for line in lines([w for band in group.bands for w in band.words]):
        label = sorted(line, key=lambda w: w.x0)

        def ruled(i: int) -> bool:
            return column[id(label[i])] != column[id(label[i + 1])]

        leading = 0
        while leading < len(label) and BARE_CODE.match(normalize(label[leading].text)):
            leading += 1
        codes = leading
        if 0 < leading < len(label) and CODE_LED.match(normalize(label[leading].text)) and ruled(leading - 1):
            codes += 1
        if codes >= 2 and all(label[i + 1].x0 > label[i].x0 and (label[i + 1].x0 - label[i].x1 >= 2 or ruled(i))
                              for i in range(codes - 1)):
            removed.extend(label[:codes - 1])
    gone = {id(g) for g in removed}
    for band in group.bands:
        band.stripped_codes = band.stripped_codes or any(id(w) in gone for w in band.words)
        band.words = [w for w in band.words if id(w) not in gone]
    return removed


def entries_of(group: Group, margins: set[int] | None = None, amount_brackets: bool = False,
               bare_amounts: bool = False, numbers=None, long_numbers=None, stops=None, name_line=None,
               projects=None) -> list[tuple]:
    """Printed lines of a label group as (label glyphs, amount runs, code, name). `numbers`: the quirk `full_width_numbers`;
    `long_numbers`: the quirk `long_numbers`; `stops`: the quirk `glued_number_stops`; `name_line`: the quirk
    `name_line` (a line that is a number alone starts with an item number wherever it starts); `projects`: the quirk
    `glued_project_codes`."""
    entries = []
    for line in lines([w for band in group.bands for w in band.words]):
        label, money = _split_line(line, amount_brackets, bare_amounts)
        line_text = normalize(text(label))
        if label and not money and UNIT_NOTATION.fullmatch(line_text):
            continue  # `(単位:円・税抜)` printed over a column names the unit; it is no item of the column
        code, name = _split_code(line_text)
        raw_text = text(label).strip()
        if code is None and numbers is not None and (held := numbers.module.split(raw_text, numbers.value)) is not None:
            code, name = normalize(held[0]), normalize(held[1])
        project = code is None and projects is not None and (held := projects.module.split(raw_text)) is not None
        if project:
            code, name = held[0], normalize(held[1])
        if code is not None and len(name) > 1 and re.match(r'[０-９]{3,}', raw_text):
            code, name = None, line_text  # `２０３０ビジョン…`: three or more full-width digits begin a name, not an item number (a one-character name stays `161`/`人`)
        script = re.match(r'([0-9]+)(?=[０-９])', raw_text)
        if stops is not None and (stopped := stops.module.split(raw_text)) is not None:
            code, name = stopped[0], normalize(stopped[1])  # `6．５歳児…`: item 6, not 6.5
            script = None
        if script and long_numbers is not None and long_numbers.module.too_long(script.group(1)):
            script = None
        if script and label and re.fullmatch(r'[0-9]+[０-９]+', label[0].text) and (
                len(label) == 1 or label[1].x0 - label[0].x1 >= 2):
            script = None  # `1０` `需用費`: a number printed in two widths, a word of its own (281000)
        if script and margins is not None and margins & set(_margins(label)):
            # `11３歳児健康診査事業`: half-width digits are the number and the full-width ones start the name.
            code, name = script.group(1), normalize(raw_text[len(script.group(1)):])
        if (not script and len(label) > 1 and margins is not None and margins & set(_margins(label))
                and re.fullmatch(r'[0-9]{1,4}', normalize(label[0].text)) and re.match(r'[0-9０-９]', label[1].text)
                and label[1].x0 - label[0].x1 >= 2):
            # `8` `2歳児歯科健診事業`, `0200` `16ミリ映写機検定委託料`: the number is a word of its own, and the name begins with a count.
            code, name, script = normalize(label[0].text), normalize(text(label[1:])), True
        if (code is not None and not project and margins is not None and not margins & set(_margins(label))
                and not (numbers is not None and numbers.module.numbered(raw_text, numbers.value))
                and not (name_line is not None and name_line.module.numbered(raw_text))):
            code, name = None, line_text  # a name that begins with a digit
        if code is None and label and margins is not None and margins & set(_margins(label)):
            year = YEAR_LED.match(line_text)
            if year:  # `42025年農林業センサス費` is item `4` and `2025年…`
                code, name = year.group(1), line_text[len(year.group(1)):]
        spaced = (len(label) > 1 and re.fullmatch(r'[0-9]{1,4}', normalize(label[0].text)) is not None
                  and label[1].x0 - label[0].x1 >= 2)  # the number is a word of its own, set apart from the name
        if code is not None and COUNTED.match(line_text) and not YEAR_LED.match(line_text) and not script and not spaced:
            code, name = None, line_text  # `110番非常通報装置`, `3歳児健康診査`: a count, not an item number
        if code is not None and not name and money:
            code = None  # a lone number left of an amount is not a code
        if code is not None and re.match(r'[0-9]{1,3}(?:,[0-9]{3})+', line_text):
            code, name = None, line_text  # `66,000)`: the end of a bracketed amount (`(翌年度へ繰越明許費`), not an item `66`
        if (code is not None and entries and not entries[-1][1] and entries[-1][0]
                and (counts := document_quirk('bracketed_counts')) is not None
                and counts.module.ends_name(line_text, entries[-1][0])):
            code, name = None, line_text
        entries.append((label, money, code, name))
    return entries


def same_amount_cell(logical: Logical, previous: Item, item: Item) -> bool:
    """Whether no rule of an amount column separates a name's line from the wrapped line below it."""
    return all(_cell(band, (previous.y0 + previous.y1) / 2) == _cell(band, (item.y0 + item.y1) / 2)
               for band in logical.bands if band.kind == 'amount')


def stacked_under(logical: Logical, previous: Item, item: Item) -> bool:
    """Whether the amounts printed on a name's wrapped line are the next rows of the amount cell the line above opens.

    A cell stacks its amounts (`計` / `当初予算額` / `補正予算額`), one row each, so the second line of a long name
    shares its row with the next amount of the first line's cell (132063 後期高齢者医療広域連合納付金: `付金`).
    Every amount band that holds money at the wrapped line's row names it with a kind of an amount the dictionary
    knows (`当初予算額`; a unit such as `千円` is no kind), a kind the line above does not name, and also holds money, in
    the same ruled cell, at another row of the line above; money alone at that row is the line's own.
    """
    height = max(g.y1 - g.y0 for g in item.glyphs)
    middle = (item.y0 + item.y1) / 2
    own, above = (middle - height / 2, middle + height / 2), (previous.y0 - height, previous.y0 + height)

    def centre(line: list[Glyph]) -> float:
        return (line[0].y0 + line[0].y1) / 2

    def kinds(band: Band, line: list[Glyph]) -> set[str]:
        # The kinds of an amount the shared dictionary knows (`計`, `当初予算額`); a unit (`千円`) or other text is none.
        found = (kind_heading(normalize(g.text), band.header[-1]) for g in line if not is_amount(g.text))
        return {kind for kind in found if kind is not None}

    def rows(band: Band, lo: float, hi: float) -> list[list[Glyph]]:
        return [line for line in lines(band.words) if lo <= centre(line) <= hi and any(is_amount(g.text) for g in line)]

    def stacked(band: Band) -> bool:
        # A band without rules draws no cells: two rows of it are not known to be one stack. The rows of one cell
        # are one stack, each naming its own kind; a row in another ruled cell, or one that names the kind the line
        # above already names, is another item's amount.
        return bool(band.rows) and any(
            kinds(band, low) and abs(centre(low) - centre(high)) > height / 2
            and _cell(band, centre(low)) == _cell(band, centre(high)) and not kinds(band, low) & kinds(band, high)
            for low in rows(band, *own) for high in rows(band, *above))

    bands = [band for band in logical.bands if band.kind == 'amount' and rows(band, *own)]
    return bool(bands) and all(stacked(band) for band in bands)


def round_heading(line: list[Glyph]) -> list[Glyph]:
    """The words a line starts with that print the round of a supplementary budget (`第２次補正`, or `第` `２` `次補正`
    set apart), or none."""
    for end in range(1, len(line) + 1):
        if SUPPLEMENT_ROUND.fullmatch(normalize(text(line[:end]))):
            return line[:end]
    return []


def _signed_amounts(words: list[Glyph]) -> list[Glyph]:
    """The words of an amount column with each minus sign set against its number (`△` `2,006,000`) read as one word.

    The sign is a word of its own, drawn smaller and a little off the line of the digits, so its line is another
    one and it would belong to the amount below. A sign above its number (a line of its own, a row higher) is not
    set against it."""
    numbers = [w for w in words if is_amount(w.text) and not w.text.startswith(('△', '▲'))]
    joined: dict[int, Glyph] = {}
    taken: set[int] = set()
    for sign in (w for w in words if w.text in ('△', '▲')):
        # A sign's box can be as tall as two lines (its top is where the sign is drawn): the number it stands
        # against has its middle within a line of the box's top.
        near = [n for n in numbers if 0 <= n.x0 - sign.x1 <= .8 * (n.y1 - n.y0) and id(n) not in taken
                and sign.y0 - .5 * (n.y1 - n.y0) <= (n.y0 + n.y1) / 2 <= sign.y0 + 1.5 * (n.y1 - n.y0)]
        if len(near) == 1:
            n = near[0]
            taken.add(id(n))
            joined[id(sign)] = Glyph(sign.text + n.text, sign.x0, n.y0, n.x1, n.y1, n.page, n.offset)  # the digits' line: a sign's box is taller
    gone = {id(n) for n in numbers if id(n) in taken}
    return [joined.get(id(w), w) for w in words if id(w) not in gone]


def line_limits(logicals: list[Logical]) -> dict[str, float]:
    """Per breakdown axis, the right end of the longest label line printed anywhere in the document.

    A name wraps because it reached the right limit of its column, so a first line that went on to a
    second runs up to that limit (within a character or two). A short line followed by an indented line
    with an amount is two items, not a wrapped name (`02 管理用備品` / `ICカードリーダーライター 5,280`).
    """
    ends: dict[str, list[float]] = defaultdict(list)
    for logical in logicals:
        for group in column_groups(logical):
            if group.subject:
                continue
            for line in lines([w for band in group.bands for w in band.words]):
                label, money = _split_line(line)
                # A unit printed alone at the top of a cell (`円`, 132101) is no name: it would set the limit
                # at the cell's right edge, and no wrapped line would ever reach it.
                if label and not UNIT_CELL.match(normalize(text(label))):
                    ends[group.axis].append(max(g.x1 for g in label))
    # Printed text: the longest line. OCR: `scan.dense_limit`, past a few misread lines (132101).
    if any(logical.ocr for logical in logicals):
        from ingestion.generic.scan import dense_limit
        return {axis: dense_limit(values) for axis, values in ends.items()}
    return {axis: max(values) for axis, values in ends.items()}


def items(group: Group, header: str, margins: set[int] | None = None,
          roles: dict[int, str] | None = None, limit: float | None = None, ocr: bool = False,
          amount_brackets: bool = False, settings: dict | None = None, joined_codes: bool = False,
          column_amounts: list[Glyph] | None = None) -> list[Item]:
    """Lines of a label group into items; amounts printed inside the group stay on their item.

    `roles` (variant B) replaces the geometric decisions for codeless lines. `joined_codes`: a word of the text layer
    that joins a code and the first character of its name (`03戸`) is measured as an OCR word is (`_measure`).
    `column_amounts`: the amounts printed in the axis's own amount column, beside the names.
    """
    numbers = quirk(settings, 'full_width_numbers')
    entries = entries_of(group, margins, amount_brackets, bool((settings or {}).get('bare_amounts')),
                         numbers, quirk(settings, 'long_numbers'), quirk(settings, 'glued_number_stops'),
                         quirk(settings, 'name_line'), quirk(settings, 'glued_project_codes'))
    settings = settings or {}
    if (shares := quirk(settings, 'department_amounts')) is not None:
        for index, (label, money, code, name) in enumerate(entries):
            if label and not money and code is None and (found := shares.module.split(label, _cut)) is not None:
                entries[index] = (found[0], [found[1]], None, normalize(text(found[0])))

    def measure(item, label, code) -> None:
        _measure(item, label, code, ocr or joined_codes, stops)
        if numbers is not None and code is not None and (start := numbers.module.name_start(label, numbers.value)) is not None:
            item.indent = start
    kind_names = quirk(settings, 'names_end_with_kind_words')
    remainder = quirk(settings, 'bracketed_remainder')
    department = quirk(settings, 'department_line')
    headings = quirk(settings, 'headings')
    glued = quirk(settings, 'glued_numbers')
    stops = quirk(settings, 'glued_number_stops')
    name_column = quirk(settings, 'name_column')
    transfers = document_quirk('account_code_transfers')
    # A name that begins with a count, glued to its number (`82歳児歯科健診事業` = `8` + `2歳児…`,
    # `42025年農林業センサス費` = `4` + `2025年…`): the number is the one that follows the number before it
    # in this list. Only a line at a number's margin with a counter after its digits is read so.
    last_at: dict[int, int] = {}  # the last number printed at each start (one slot of 6pt)
    for index, (label, money, code, name) in enumerate(entries):
        raw = normalize(text(label)) if label else ''
        run = re.match(r'[0-9]+', raw)
        slot = round(label[0].x0 / 6) if label else None
        previous_code = max((last_at[s] for s in (slot - 1, slot, slot + 1) if s in last_at), default=None) if label else None
        if (run and len(run.group()) >= 2 and COUNTED.match(raw) and previous_code is not None
                and (margins is None or margins & set(_margins(label)) or code is not None)):
            digits = run.group()
            for cut in range(1, len(digits)):
                if int(digits[:cut]) == previous_code + 1 and digits[cut] != '0':
                    entries[index] = (label, money, digits[:cut], raw[cut:])
                    code = digits[:cut]
                    break
        if (code is not None and label and (previous_code is None or int(code) != previous_code + 1)
                and (cities := document_quirk('counted_cities')) is not None
                and cities.module.counted(normalize(label[0].text), raw)):
            entries[index] = (label, money, None, raw)
            code = None
        # Where the number before it is on another page or in another cell, the quirk says where the number ends.
        if glued is not None and (held := glued.module.number(raw, glued.value)) is not None:
            entries[index] = (label, money, held, raw[len(held):])
            code = held
        if label and code is not None and code.isdigit():
            last_at[slot] = int(code)
    # The amounts beside a line in the axis's own amount column, where they part the items (the quirk).
    parting = quirk(settings, 'amounts_beside_names')
    beside = (lambda line: parting.module.beside(column_amounts, line)) if parting is not None else (lambda line: frozenset())
    result: list[Item] = []
    # A rule-bounded cell with exactly one code is one item.
    band_of = lambda g: next(b for b in group.bands if b.x0 <= (g.x0 + g.x1) / 2 <= b.x1 or b is group.bands[-1])
    cells: dict[tuple, list[int]] = defaultdict(list)
    for index, (label, money, code, name) in enumerate(entries):
        anchor = label[0] if label else money[0][0]
        y = (anchor.y0 + anchor.y1) / 2
        cells[_cell(band_of(anchor), y)].append(index)
    def wraps(index: int, ix: list[int]) -> bool:
        """Whether every codeless line of the cell starts where its one code's name can wrap: from the
        code's own start to the start of its name. A line indented past the name (a 内訳 of the item above,
        `有料道路通行料` over `18 負担金…`) or left of the code (the next 事業 name over `03 複写機使用料`)
        is another item, even in a cell with no rule between them (132276)."""
        code = next(i for i in ix if entries[i][2] is not None)
        label = entries[code][0]
        if not label:
            return True
        raw = normalize(''.join(g.text for g in label))
        found = CODE.match(raw)
        start, consumed, name_start = label[0].x0, 0, label[-1].x1
        for glyph in label:
            if found and consumed + len(glyph.text) > found.end():
                # The number's own width: a half-width digit is half the line height. (The word's
                # average character width is a kanji's, and puts the name a digit too far right.)
                inside = glyph.text[:found.end() - consumed]
                height = glyph.y1 - glyph.y0
                name_start = glyph.x0 + sum(height / 2 if c.isascii() else height for c in inside)
                break
            consumed += len(glyph.text)
        ordered = sorted(ix)
        slack = 3 + (name_column.module.slack(label) if name_column is not None else 0)
        for position, i in enumerate(ordered):
            if entries[i][2] is not None or not entries[i][0]:
                continue
            if not start - 3 <= entries[i][0][0].x0 <= name_start + slack:
                return False
            # A name goes on a second line because it did not fit with the amount: the line before runs up
            # to where the amount is printed. A short line over an indented line with an amount is two items.
            if entries[i][1] and position and limit is not None:
                before = entries[ordered[position - 1]][0]
                if before and max(g.x1 for g in before) < limit - 4 * (before[0].y1 - before[0].y0):
                    return False
        return True

    single = {i: tuple(ix) for ix in cells.values()
              if sum(entries[i][2] is not None for i in ix) == 1 and len(ix) > 1
              and sum(bool(entries[i][1]) for i in ix) <= 1 and len({beside(entries[i][0]) for i in ix} - {frozenset()}) <= 1
              and wraps(0, ix) for i in ix}
    repeated_headings: set[int] = set()
    if (repeated := quirk(settings, 'heading_repeated_over_code')
            or quirk(settings, 'repeated_subject_headings')) is not None:
        repeated_headings = repeated.module.split(entries, single)
    if name_column is not None:
        name_column.module.attach(entries, single, repeated_headings, name_column.value)
    done: set[int] = set()
    for index, (label, money, code, name) in enumerate(entries):
        if index in done:
            continue
        if index in single:
            members = single[index]
            done.update(members)
            code_index = next(i for i in members if entries[i][2] is not None)
            # A bracketed department (`(市民生活課)`) printed on a line of its own above the number ends the
            # name of the item before it, not the name of this one.
            while (result and members[0] != code_index and not entries[members[0]][1] and entries[members[0]][0]
                   and re.fullmatch(r'[(（][^()（）]+[)）]', normalize(text(entries[members[0]][0])))):
                result[-1].lines.append(entries[members[0]][0])
                result[-1].name += normalize(text(entries[members[0]][0]))
                members = members[1:]
            all_lines = [entries[i][0] for i in members if entries[i][0]]
            name = ''.join(entries[i][3] if i == code_index else normalize(text(entries[i][0])) for i in members)
            item = Item(group, all_lines[0][0].page, all_lines, entries[code_index][2], name, 0)
            for i in members:
                for run in entries[i][1]:
                    item.amounts.append((header, run))
            measure(item, entries[code_index][0], entries[code_index][2])
            result.append(item)
            continue
        previous = result[-1] if result else None
        if roles is not None and code is None and index in roles and label:
            role = roles[index]
            label_text = normalize(text(label))
            if role in ('continuation', 'amount_kind') and previous is not None:
                previous.lines.append(label)
                if role == 'continuation':
                    previous.name += label_text
                for run in money:
                    previous.amounts.append((header if role == 'continuation' else f'{header}／{label_text}', run))
                    if role == 'amount_kind':
                        previous.kinds.append((label, run, f'{header}／{label_text}'))
                continue
            item = Item(group, label[0].page, [label], None, name, 0, decided=True)
            item.role = 'annotation' if role == 'note' else 'node'
            for run in money:
                item.amounts.append((header, run))
            _measure(item, label, None)
            result.append(item)
            continue
        whole = normalize(text(line_of(label, money)))
        if (previous is not None and code is None and whole[:1] in '(（' and whole[-1:] in ')）'
                and not (amount_brackets and money) and not whole.startswith(note_prefixes(settings))):
            previous.lines.append(label + [g for run in money for g in run])
            previous.name += whole  # a parenthesised remark on the previous item, not an amount of it
            continue
        label_text = normalize(text(label))
        if (previous is not None and label and not money and previous.code is None and previous.amounts
                and transfers is not None and transfers.module.below(previous, label_text)):
            previous.lines.append(label)
            previous.name += label_text
            continue
        # OCR: `scan.total_row` (a lone `計` closing a 備考 is a total, 132055); printed text keeps it a kind.
        if ocr:
            from ingestion.generic.scan import total_row
        total_row_here = ocr and total_row(label_text)
        if (previous is not None and code is None and money and is_amount_kind(label_text) and not total_row_here
                and not (kind_names is not None and kind_names.module.ends_name(previous))):
            for run in money:  # `繰越明許費 302,000`: an amount kind of the item above
                previous.amounts.append((f'{header}／{label_text}', run))
                previous.kinds.append((label, run, f'{header}／{label_text}'))
            previous.lines.append(label)
            continue
        # The name goes on in a bracket (`（地域振興課、建築課）`) on the next line, with the amount: the item's own.
        shown = normalize(text(label)) if label else ''
        bracketed = shown[:1] in ('（', '(', '【', '[') and shown[-1:] in ('）', ')', '】', ']')
        # A wrapped line never starts left of the item it continues (the next 事業's name under an item
        # of the level below, `03 複写機使用料` over `0102420公共施設等…`).
        # A name goes on a second line because it did not fit: its first line runs up to where the amount
        # is printed, or to the right edge of the name column when the amount has a column of its own. A short line followed by an indented line with an amount is two items
        # (`02 管理用備品` / `ICカードリーダーライター 5,280`, 132276).
        # `(翌年度へ繰越明許費 7,326,000)` closes the name above it: the line under it is the next item (132021).
        closing = quirk(settings, 'bracket_line_closes_name')
        closed = closing is not None and previous is not None and closing.module.closes(previous)
        reaches = (previous is not None and bool(money) and bool(previous.lines) and not closed
                   and (limit is None or max(g.x1 for g in previous.lines[-1]) >= limit - 4 * (previous.lines[-1][0].y1 - previous.lines[-1][0].y0)))
        # A line led by a mark (`○あそべえ事業 222,656,920` under its heading, 132039) is an item of its own.
        marked = bool(label) and re.match(r'[〇○●◎□■◇◆]', label[0].text) is not None
        left_slack = remainder.module.slack(label) if label and remainder is not None else 3
        wrapped = (previous is not None and code is None and label and not previous.amounts and not marked
                   and not (beside(label) and any(beside(line) and not beside(line) & beside(label) for line in previous.lines))
                   and label[0].x0 >= previous.lines[0][0].x0 - left_slack
                   and not (headings is not None and headings.module.indented_under(label, previous))
                   and (not money or bracketed
                        or (reaches and not ENDED_TRANSFER.search(previous.name) and (abs(label[0].x0 - previous.indent) <= 3
                                         or abs(label[0].x0 - _name_start(previous)) <= 3 + float(settings.get('name_start_slack', 0)))))
                   and _cell(band_of(label[0]), label[0].y0) == _cell(band_of(previous.lines[-1][0]), previous.lines[-1][0].y0))
        # (Not only the rule-bounded cell: the name and the amount of a 備考 can have grids of their own.)
        wrapped = wrapped or (previous is not None and code is None and bool(label) and bool(money) and previous.code is not None
                              and not previous.amounts and label[0].x0 >= previous.lines[0][0].x0 - left_slack
                              and closes_parts(entries, index, previous, remainder))
        wrapped = wrapped or (remainder is not None and remainder.module.overflows(
            previous, label, money, code, bracketed, limit, left_slack))
        wrapped = wrapped or (department is not None and department.module.continues(
            previous, label, money, code, left_slack))
        if wrapped:  # a wrapped name; its amount may be printed on the last line
            previous.lines.append(label)
            previous.name += normalize(text(label))
            for run in money:
                previous.amounts.append((header, run))
            continue
        if not label:  # an amount alone on its line: a wrapped item's amount
            following = entries[index + 1] if index + 1 < len(entries) else None
            # The amount belongs to the line above when that one is a name still waiting for its amount
            # (`第３款総務費へ充用` / `△152,462,000` / `第７款…へ充用`, 131148).
            waiting = bool(result) and result[-1].code is None and not result[-1].amounts
            if (following is not None and not waiting and index + 1 not in done and following[0] and not following[1]
                    and following[2] is None and reads_as_note(following[3])
                    and 0 < following[0][0].y0 - money[0][0].y0 <= 1.8 * (money[0][0].y1 - money[0][0].y0)):
                # An amount printed above the word that names it (`12,409,365 円` / `流用`): the note's
                # amount, not the amount of the item above.
                done.add(index + 1)
                item = Item(group, following[0][0].page, [following[0]], None, following[3], 0)
                for run in money:
                    item.amounts.append((header, run))
                _measure(item, following[0], None)
                result.append(item)
                continue
            if result:
                for run in money:
                    result[-1].amounts.append((header, run))
            elif (settings.get('wrap') == 'amount_on_last_line' or quirk(settings, 'amount_on_next_page') is not None
                  or quirk(settings, 'amount_over_page') is not None):
                # The first line of a page carries the amount of a label that ended the page before:
                # `apply_layout` joins the two. It stays a nameless item if there is no such label.
                item = Item(group, money[0][0].page, [[g for run in money for g in run]], None, '', money[0][0].x0)
                for run in money:
                    item.amounts.append((header, run))
                result.append(item)
            continue
        item = Item(group, label[0].page, [label], code, name, 0)
        for run in money:
            item.amounts.append((header, run))
        measure(item, label, code)
        result.append(item)
    if (starts := quirk(settings, 'line_starts')) is not None:
        starts.module.shift(result, starts.value)
    if (heads := quirk(settings, 'group_heads')) is not None:
        heads.module.mark(result, heads.value)
    if (ink := quirk(settings, 'opening_bracket_ink')) is not None:
        ink.module.shift(result)
    return result


def closes_parts(entries: list[tuple], index: int, previous: Item, right_aligned=None) -> bool:
    """Whether the amount printed on this codeless line is the amount of the numbered item above, whose
    name goes on (`9 …運営` / `・補助事業費 38,343,659` / `（地域福祉課）`): the item above prints no amount,
    and the numbered items under it, at their own margin, add up to this amount. A sub-heading of its own
    would also have parts that add up to it; the item above that prints nothing is then no item."""
    amount = number(normalize(text(entries[index][1][0]))) if entries[index][1] else None
    if amount is None or not entries[index][0]:
        return False
    start = previous.lines[0][0].x0
    parts: list[tuple[float, int]] = []
    for label, money, code, _ in entries[index + 1:]:
        if not label:
            continue
        if label[0].x0 <= start + 3 and (code is not None or not money):
            break
        if code is not None and money:
            # A part may print its amount in brackets (`3 職員手当等 (3,549)`, the 節 over its own breakdown; `bracketed_remainder`).
            shown = normalize(text(money[0]))
            value = number(shown.removeprefix('(').removesuffix(')') if right_aligned is not None else shown)
            if value is not None:
                parts.append((label[0].x0, value))
    if not parts:
        return False
    margin = min(x for x, _ in parts)
    # Right-aligned numbers (the quirk `bracketed_remainder`): a one-digit number starts half a character right of a two-digit one.
    slack = right_aligned.module.parts_slack(previous.lines[0]) if right_aligned is not None else 3
    return sum(v for x, v in parts if x <= margin + slack) == amount


def line_of(label: list[Glyph], money: list[list[Glyph]]) -> list[Glyph]:
    return sorted(label + [g for run in money for g in run], key=lambda g: g.x0)


def _name_start(item: Item) -> float:
    """Where the name of an item with a long number (a 7-digit 事業番号, which is no `code`) begins; its
    wrapped lines start there. Without such a number, where the item starts."""
    first = item.lines[0]
    head = normalize(first[0].text)
    if re.match(r'[〇○●◎□■◇◆・]', first[0].text):
        # The wrapped lines of a bulleted name hang under the text, one character past the mark.
        if len(first[0].text) == 1 and len(first) > 1:
            return first[1].x0
        return first[0].x0 + (first[0].y1 - first[0].y0)
    if len(head) >= 5 and head.isdigit():
        if len(first) > 1 and first[1].x0 - first[0].x1 < 12:
            return first[1].x0
    glued = re.match(r'[0-9０-９]{5,}', first[0].text)
    if glued and len(first[0].text) > glued.end():
        height = first[0].y1 - first[0].y0
        digits = sum(1 for c in glued.group() if c.isascii())
        # A half-width digit is half the line height; the word's average character width is a kanji's.
        return first[0].x0 + digits * height / 2 + (len(glued.group()) - digits) * height
    return item.indent


def _measure(item: Item, label: list[Glyph], code: str | None, joined: bool = False, stops=None) -> None:
    """Indentation is where the name starts; subject level is the band of the first glyph. `joined`: a word
    that joins the code and the name is measured by the digits' own width. `stops`: the axis quirk
    `glued_number_stops` (`2．職員`)."""
    first = label[0]
    if code is not None:
        consumed, offset = 0, None
        raw = ''.join(g.text for g in label)
        found = CODE.match(normalize(raw))
        length = found.end() if found else 0
        head = normalize(first.text)
        if (len(label) > 1 and re.fullmatch(r'[0-9]{1,4}', head) and length > len(head)
                and label[1].x0 - first.x1 >= 2):
            length = len(head)  # a number set apart from a name that begins with digits (`11 ２０歳のつどい事業`)
        for glyph in label:
            if consumed + len(glyph.text) > length:
                if stops is not None and (start := stops.module.name_start(glyph, length - consumed)) is not None:
                    offset = start
                    break
                width = (glyph.x1 - glyph.x0) / max(len(glyph.text), 1)
                if joined and any(not c.isascii() for c in glyph.text) and all(c.isascii() and c.isdigit() for c in glyph.text[:length - consumed]):
                    # A word that joins the code and the name (OCR `10需用費`, text `03戸`): half-width digits are half a
                    # kanji wide, so the name starts after the digits' own width, not after an even share.
                    wide = sum(1 for c in glyph.text if not c.isascii())
                    width = (glyph.x1 - glyph.x0) / (len(glyph.text) - wide + 2 * wide) if wide else width
                offset = glyph.x0 + (length - consumed) * width
                break
            consumed += len(glyph.text)
        item.indent = offset if offset is not None else label[-1].x1
    else:
        item.indent = first.x0
    if item.group.subject:
        cx = first.x0 + 1
        for index, band in enumerate(item.group.bands):
            if band.x0 - 1 <= cx <= band.x1:
                item.level = index
        item.level = item.level if item.level is not None else len(item.group.bands) - 1


def join_transfer_tails(items_: list[Item], layout: dict | None) -> list[Item]:
    """A transfer remark that prints its amount on its first line and ends on the next (`共済費から職員手当等・
    時間外勤務手` `10,000` / `当へ流用`): the tail is the rest of that name, not a note of its own."""
    result: list[Item] = []
    for item in items_:
        previous = result[-1] if result else None
        if (previous is not None and item.code is None and not item.amounts and previous.code is None
                and previous.amounts and not previous.kinds and item.lines and previous.lines
                and abs(item.lines[0][0].x0 - previous.lines[0][0].x0) <= 2
                and 0 < item.lines[0][0].y0 - previous.lines[-1][0].y0 <= 2.5 * (previous.lines[-1][0].y1 - previous.lines[-1][0].y0)
                and not TRANSFER.search(PAREN_TAIL.sub('', previous.name))
                and TRANSFER.search(PAREN_TAIL.sub('', previous.name + item.name))
                and not is_plain_name(layout, previous)):
            previous.name += item.name
            previous.lines += item.lines
            continue
        if (previous is not None and previous.code is not None and not previous.amounts and item.code is None
                and item.amounts and item.lines and previous.lines and not is_plain_name(layout, previous)
                and (above := document_quirk('transfer_account_above')) is not None and above.module.joins(previous, item)):
            previous.name = previous.code + previous.name + item.name
            previous.code = None
            previous.lines += item.lines
            previous.amounts += item.amounts
            previous.kinds += item.kinds
            continue
        result.append(item)
    return result


def note_prefixes(settings: dict) -> tuple[str, ...]:
    """The words a configured note line starts with: `notes` and the words of `note_kinds`."""
    return tuple(normalize(prefix) for prefix in [*settings.get('notes', []), *settings.get('note_kinds', {})])


def is_plain_name(layout: dict | None, item: Item) -> bool:
    """A name the document's settings declare to be an item although it contains a note word
    (`補充用備品` holds `充用`)."""
    names = (layout or {}).get(item.group.axis, {}).get('plain_names')
    return bool(names) and any(normalize(name) in normalize(item.name) for name in names)


def heads_items(layout: dict | None, items_: list[Item], position: int) -> bool:
    """A line without an amount is a heading of its own where the axis selects the quirk `headings`."""
    headings = quirk((layout or {}).get(items_[position].group.axis), 'headings')
    return headings is not None and headings.module.heads(layout, items_, position)


def number_edges(logicals: list[Logical], pattern: str = 'bands') -> set[int]:
    """Where printed numbers end (original x, rounded), over the subject columns of the whole document."""
    edges: set[int] = set()
    for logical in logicals:
        for group in groups(logical, pattern):
            if not group.subject or group.mode == 'indent':
                continue
            for band in group.bands:
                for word in band.words:
                    found = re.match(r'[0-9]+(?=[^0-9\s]|$)', word.text)
                    if found:
                        edges.add(round(word.original[0] + len(found.group()) * (word.y1 - word.y0) / 2))
    return edges


def split_glued_numbers(words: list[Glyph], edges: set[int]) -> list[Glyph]:
    """Numbers of two columns printed as one run (`110車両管理費`: 項 `1` and 目 `10`, each right-aligned in
    its own column). A run of digits is cut where a column's number ends, as other rows show."""
    result = []
    for word in words:
        found = re.match(r'[0-9]{2,}(?=[^0-9\s])', word.text)
        if found is None:
            result.append(word)
            continue
        half = (word.y1 - word.y0) / 2
        for cut in range(1, len(found.group())):
            at = round(word.original[0] + cut * half)
            if {at - 1, at, at + 1} & edges:
                break
        else:
            result.append(word)
            continue
        middle = word.x0 + cut * half
        result += [Glyph(word.text[:cut], word.x0, word.y0, middle, word.y1, word.page, word.offset),
                   Glyph(word.text[cut:], middle, word.y0, word.x1, word.y1, word.page, word.offset)]
    return result


def subject_items(group: Group, marked=None, dropped=None) -> list[Item]:
    """Subject (款・項・目) items: a code printed in a level band starts an item.

    A line splits where a glyph run that starts with a code begins in a new
    band (`3 2 1`, `7 1商工費`), or where the next band's text starts a line
    height away across a rule drawn at that height; text without a code continues
    the current run across a band edge (`1 議 会 費`). Name-only lines in the same rule-bounded
    cell belong to the deepest code of that cell (a name wrapped above and
    below its code); a cell without a code continues the previous item.
    """
    deepest = group.bands[-1]

    def band_index(g: Glyph) -> int:
        index = next((i for i, b in enumerate(group.bands)
                      if b.x0 <= g.x0 + min(2, (g.x1 - g.x0) / 2) <= b.x1), len(group.bands) - 1)
        # In a staircase a level's cell runs right over the deeper columns until their rule starts below it
        # (281000: the 項 code printed right of the 目 rule, on a row above where that rule begins).
        y = (g.y0 + g.y1) / 2
        while index > 0 and group.bands[index].staircase and not any(
                top - 1 <= y <= bottom + 1 for top, bottom in group.bands[index].left_rules):
            index -= 1
        return index
    centre = lambda piece: sum((g.y0 + g.y1) / 2 for g in piece) / len(piece)
    cells: dict[tuple, list[list[Glyph]]] = defaultdict(list)
    order: list[tuple] = []
    for line in lines([w for band in group.bands for w in band.words]):
        cell = _cell(deepest, centre(line))
        if cell not in cells:
            order.append(cell)
        cells[cell].append(line)
    parsed: dict[tuple, tuple[list[tuple[int, list[Glyph]]], list[list[Glyph]]]] = {}
    for cell in order:
        tokens: list[tuple[int, list[Glyph]]] = []
        names: list[list[Glyph]] = []
        for line in cells[cell]:
            pieces: list[tuple[int, list[Glyph]]] = []
            for glyph in line:
                band = band_index(glyph)
                starts_code = CODE.match(normalize(glyph.text)) is not None
                # A name that crosses a band edge stays one piece; the names of two neighbouring columns on
                # one line do not (a full line height apart, with the rule between them).
                apart = bool(pieces) and glyph.x0 - pieces[-1][1][-1].x1 > glyph.y1 - glyph.y0 and any(
                    top <= (glyph.y0 + glyph.y1) / 2 <= bottom for edge in group.bands[pieces[-1][0] + 1:band + 1]
                    for top, bottom in edge.left_rules)
                apart = apart or (dropped is not None and bool(pieces) and dropped.module.apart(pieces[-1], glyph, band))
                if pieces and not (band != pieces[-1][0] and (starts_code or apart)):
                    pieces[-1][1].append(glyph)
                else:
                    pieces.append((band, [glyph]))
            for band, piece in pieces:
                if marked is not None and marked.module.stray(piece):
                    continue
                if (CODE.match(normalize(text(piece))) or (marked is not None and marked.module.marked(piece))
                        or (dropped is not None and dropped.module.codeless(band, piece, pieces))):
                    tokens.append((band, piece))
                else:
                    names.append(piece)
        parsed[cell] = (tokens, names)
    extra: dict[tuple, list[list[Glyph]]] = defaultdict(list)
    if marked is not None:  # the rest of a marked item's name, on the lines under it (`marked_subjects`)
        heads = [(cell, i, piece) for cell, (tokens, _) in parsed.items()
                 for i, (_, piece) in enumerate(tokens) if marked.module.marked(piece)]
        for cell, (_, names) in parsed.items():
            kept = []
            for piece in names:
                head = next(((c, i) for c, i, token in heads if marked.module.continues(token, piece)), None)
                (extra[head] if head is not None else kept).append(piece)
            names[:] = kept
    # A name-only line belongs to the one code printed in its own column and cell (across a rule of a deeper
    # column: `names_in_own_column`). Otherwise, to the deepest code of its cell (a name wrapped above and below
    # its code); a cell without a code continues the previous item.
    in_column: dict[int, list[tuple[tuple, int]]] = defaultdict(list)
    for cell, (tokens, _) in parsed.items():
        for index, (band, piece) in enumerate(tokens):
            in_column[band].append((cell, index))
    claimed: dict[tuple, tuple[tuple, int]] = {}
    own_column = document_quirk('names_in_own_column')
    for cell, (tokens, names) in parsed.items():
        for position, piece in enumerate(names):
            column = band_index(piece[0])
            span = _cell(group.bands[column], centre(piece))
            found = [(c, i) for c, i in in_column[column]
                     if _cell(group.bands[column], centre(parsed[c][0][i][1])) == span]
            if len(found) == 1 and (found[0][0] == cell or own_column is not None):
                claimed[cell, position] = found[0]
    for (cell, position), owner_token in claimed.items():
        extra[owner_token].append(parsed[cell][1][position])
    result: list[Item] = []
    for cell in order:
        tokens, names = parsed[cell]
        free = [piece for position, piece in enumerate(names) if (cell, position) not in claimed]
        if not tokens:
            if result and free and result[-1].role == 'node' and _cell(deepest, result[-1].anchor) == cell:
                for piece in free:
                    result[-1].lines.append(piece)
                    result[-1].name += normalize(text(piece))
                continue
            for piece in free:  # a printed line without a code (a total row)
                item = Item(group, piece[0].page, [piece], None, normalize(text(piece)), 0)
                _measure(item, piece, None)
                result.append(item)
            continue
        deepest_token = max(range(len(tokens)), key=lambda i: tokens[i][0])
        owner_of: dict[int, int] = {}
        for position, piece in enumerate(names):
            if (cell, position) in claimed:
                continue
            same = [i for i, (band, _) in enumerate(tokens) if band == band_index(piece[0])]
            owner_of[position] = same[0] if len(same) == 1 else deepest_token
        for index, (band, piece) in enumerate(tokens):
            code, name = _split_code(normalize(text(piece)))
            own = [piece]
            mine = [names[p] for p, i in owner_of.items() if i == index] + extra.get((cell, index), [])
            if mine:
                y = centre(piece)
                parts = sorted([(y, name, piece)] + [(centre(n), normalize(text(n)), n) for n in mine],
                               key=lambda p: p[0])
                name = ''.join(part[1] for part in parts)
                own = [part[2] for part in parts]
            item = Item(group, piece[0].page, own, code, name, 0, level=band, fixed_anchor=centre(piece))
            item.indent = piece[0].x0
            result.append(item)
    return result


# `（決算額 △1,000 円）`: the kind, then everything up to an optional unit and the closing bracket
# (or the end), so a broken amount (`1,000O0円）`) is read whole and fails, not cut to `1,000`.
TITLE_AMOUNT = re.compile(r'[(（]([^0-9△▲\-()（）]+?)([△▲\-]?[0-9][^()（）]*?)(?:百万円|千円|円)?(?:[)）]|$)')


def title_amount(line: list[Glyph]) -> tuple[str | None, list[Glyph]]:
    """The amount kind and the glyphs of the signed amount in a 款 title (`（決算額 △1,000 円）`).

    The amount is cut out of the words that print it, by character position, so a sign printed
    as its own word or a word that runs on into `円）` still gives just the number.
    """
    found = TITLE_AMOUNT.search(normalize(text(line)))
    if not found:
        return None, []
    kind, amount = found.group(1).strip(), found.group(2)
    if not is_amount(amount):
        return kind, []  # printed but unreadable: reported as such by the caller
    # Positions of the amount in the concatenated glyph texts (NFKC keeps one character per character here).
    texts = [unicodedata.normalize('NFKC', g.text) for g in line]
    joined = ''.join(t.replace(' ', '').replace('\u3000', '') for t in texts)
    start = joined.find(amount, joined.find(kind) + len(kind))
    if start < 0:
        return kind, []
    run, position = [], 0
    for glyph, raw in zip(line, texts):
        compact = raw.replace(' ', '').replace('\u3000', '')
        lo, hi = max(start, position), min(start + len(amount), position + len(compact))
        if lo < hi:
            width = (glyph.x1 - glyph.x0) / max(len(compact), 1)
            a, b = lo - position, hi - position
            run.append(Glyph(compact[a:b], glyph.x0 + a * width, glyph.y0, glyph.x0 + b * width, glyph.y1, glyph.page, glyph.offset))
        position += len(compact)
    return kind, run


def untitled(group: Group) -> bool:
    """A subject group whose 款 is printed as a title: its first column is not 款, or one header spans the
    columns (`款項目`) and the 款 column prints nothing (a 款 code taken out as an ancestor's is not nothing)."""
    if not group.bands or not group.bands[0].header:
        return False
    first = group.bands[0]
    if group.mode in ('bands', 'names') and first.header[-1] in SUBJECT_LEVELS[1:]:
        return True
    return first.header[-1] == '款項目' and not first.words and not first.stripped_codes


def title_shift(group: Group) -> bool:
    """Whether the group's columns sit one level below a title's 款 (an `indent` group's columns include the 款's)."""
    return untitled(group) and group.mode != 'indent'


def heading_names(logical: Logical) -> dict[tuple[str, str], str]:
    """Running headings above a table (`款（7）商工費`, `(項) 1 総務管理費`): level and code to name."""
    found = {}
    for line in lines(logical.outside):
        value = normalize(text(line))
        match = re.match(r'^[(（]?(款|項|目)[)）]?[(（]?([0-9]+)[)）]?(.+)$', value)
        if match:
            found[match.group(1), match.group(2)] = match.group(3)
    return found


def join_last_lines(items_: list[Item], depth_of, amount_depth) -> list[Item]:
    """A codeless line whose amount sits in the column of the amountless item above, one level deeper, is that
    item's wrapped last line (`共通経費` / `【所管課】 299,161,329`). A heading (`headings`) is no such item."""
    kept: list[Item] = []
    for item in items_:
        previous = kept[-1] if kept else None
        if (previous is not None and previous.role in ('node', 'note') and not previous.amounts
                and not previous.heading
                and item.role == 'node' and item.code is None and item.amounts and not item.decided
                and amount_depth(item) == depth_of(previous) and depth_of(item) > depth_of(previous)):
            previous.role = 'node'
            previous.lines += item.lines
            previous.name += item.name
            previous.amounts += item.amounts
            continue
        kept.append(item)
    return kept


def owner(amount: list[Glyph], band: Band, ordered: list[Group], found: dict[int, list[Item]],
          roles: tuple[str, ...] = ('node', 'repeat', 'total'), *, ocr: bool = False, next_row: bool = False,
          name_line: dict | None = None) -> Item | None:
    """`_owner`, but a heading the page prints again (`営業費用`) does not take the amounts of the line it is on when
    the row it opens is the next item of its ruled cell (`5 減価償却費`, whose `計` is printed beside the heading)."""
    item = _owner(amount, band, ordered, found, roles, ocr=ocr, next_row=next_row, name_line=name_line)
    if item is None or item.role != 'repeat' or not band.rows:
        return item  # a column without rules draws no cell: the heading stays the owner
    digits = [g for g in amount if g.text not in ('△', '▲')] or amount  # the line `_owner` reads the amount at
    top, bottom = _cell(band, sum((g.y0 + g.y1) / 2 for g in digits) / len(digits))
    for group in ordered:
        if item in found[id(group)]:
            following = [i for i in found[id(group)] if i.role == 'node' and i.anchor > item.anchor and top - .5 <= i.anchor <= bottom + .5]
            return min(following, key=lambda i: i.anchor) if following else item
    return item


def _owner(amount: list[Glyph], band: Band, ordered: list[Group], found: dict[int, list[Item]],
           roles: tuple[str, ...] = ('node', 'repeat', 'total'), *, ocr: bool = False, next_row: bool = False,
           name_line: dict | None = None) -> Item | None:
    """The item printed on the amount's own line in the nearest label group to its left;
    failing that, the item in its rule-bounded row (a label centred in a tall cell).

    The line comes first: when sub-rows carry no rules (131172 prints the 節 of a 目
    inside the 目's ruled cell), the cell alone would hand the 目's amount to a 節.

    `name_line`: the axes that select the quirk `name_line`, by axis.
    """
    digits = [g for g in amount if g.text not in ('△', '▲')] or amount
    y = sum((g.y0 + g.y1) / 2 for g in digits) / len(digits)
    reach = .6 * max(g.y1 - g.y0 for g in digits)
    if ocr:
        from ingestion.generic.scan import line_reach
    line_limit = lambda line: line_reach(digits, line) if ocr else reach
    left = sorted((g for g in ordered if g.x1 <= band.x0 + 1), key=lambda g: -g.x0)
    if left and (printed_on := (name_line or {}).get(left[0].axis)) is not None \
            and (item := printed_on.module.owner(found[id(left[0])], y, line_limit, roles)) is not None:
        return item
    for group in left:
        same_line = [i for i in found[id(group)] if i.role in roles
                     and abs(i.anchor - y) <= line_limit(i.lines[0])]
        if same_line:
            return max(same_line, key=lambda i: (i.level or 0, -abs(i.anchor - y)))
    # The name may be printed on a line below its code (`1` / `議会費 82,694,000`): any line of the item.
    centre = lambda line: sum((g.y0 + g.y1) / 2 for g in line) / len(line)
    for group in left:
        same_line = [i for i in found[id(group)] if i.role in roles
                     and any(line and abs(centre(line) - y) <= line_limit(line) for line in i.lines)]
        if same_line:
            return max(same_line, key=lambda i: (i.level or 0, -abs(i.anchor - y)))
    top, bottom = _cell(band, y)
    if bottom - top > 80:  # unruled: fall back to the printed line
        top, bottom = y - 4, y + 4
    for group in left:
        candidates = [i for i in found[id(group)] if top - .5 <= i.anchor <= bottom + .5 and i.role in roles]
        # A heading a page prints again over its first row (`営業費用` over `5 減価償却費`) is no owner of that row's amounts.
        candidates = [i for i in candidates if i.role != 'repeat'] or candidates
        if candidates:
            return max(candidates, key=lambda i: (i.level or 0, -abs(i.anchor - y)))
    # A name printed on two lines with its amount at the height between them (`1衛生施設災` / `害復旧費`)
    # in a cell too tall to count as ruled: the item whose lines span the amount, with no rule across them.
    span = lambda i: (min(g.y0 for g in i.lines[0]), max(g.y1 for g in i.lines[-1]))
    for group in left:
        spanning = [i for i in found[id(group)] if i.role in roles and len(i.lines) > 1 and i.lines[0] and i.lines[-1]
                    and span(i)[0] <= y <= span(i)[1]
                    and not any(span(i)[0] < rule < span(i)[1] for rule in band.rows)]
        if spanning:
            return max(spanning, key=lambda i: (i.level or 0, -abs(i.anchor - y)))
    # Amounts printed on the line below their item (`1. 議会費` / `142,678,000 …`, 133051):
    # the nearest item whose last line ends within one line above the amount, in the same
    # ruled cell (no rule of the amount's column between them). Across a rule it stays unowned.
    height = max(g.y1 - g.y0 for g in digits)
    for group in left:
        above = [i for i in found[id(group)] if i.role in roles and i.lines and i.lines[-1]
                 and 0 < y - centre(i.lines[-1]) <= 1.8 * height
                 and not any(centre(i.lines[-1]) < rule < y for rule in band.rows)]
        if above:
            return min(above, key=lambda i: y - centre(i.lines[-1]))
    if next_row and band.rows:
        # The workflow's `hierarchy.subject.amounts: next_row`: a subject item prints its name in one ruled row and
        # its amounts alone in the row below (133086's 事業: `(01)一般管理費` / `11,872,000 …`). Nothing is printed
        # on the amount's line or in its row (the rules above found no owner), so it is the item whose last line
        # is in the row just above: one rule of the amount's column between them.
        top = _cell(band, y)[0]
        for group in left:
            if not group.subject:
                continue
            above = [i for i in found[id(group)] if i.role == 'node' and i.lines and i.lines[-1]
                     and _cell(band, centre(i.lines[-1]))[1] == top]
            if above:
                return max(above, key=lambda i: centre(i.lines[-1]))
    if band.inline:
        # Kind lines stacked in the cell of the item that opens them (`計` / `当初` / `補正` …, one line each): the
        # nearest item above in the nearest label group, within the height of the stack.
        for group in left:
            stacked = [i for i in found[id(group)] if i.role in roles and 0 <= y - i.anchor <= 6 * height]
            if stacked:
                return max(stacked, key=lambda i: i.anchor)
    return None


@dataclass
class Built:
    nodes: list[dict]
    amounts: list[dict]
    unowned: list[dict]
    notes: list[dict]
    # Amounts printed as notes. A remark on an account's own line (`annotation`: node_key = the account the
    # note belongs to) and an amount kind inside an item (`kind line`: node_key = the item that holds it, `heading`
    # is the header it carries in `amounts`). `label` is the printed words and `run` the amount's own glyphs;
    # `convert` decides which of them are 注記 (shared annotation dictionary) and lays them on the 注記 axis.
    annotations: list[dict] = field(default_factory=list)
    # Logical pages that are not expenditure detail (no 款・項・目 column and no amount column the shared
    # dictionary knows): not read; `convert` declares their frames as excluded regions.
    skipped: list = field(default_factory=list)
    # The printed code of a subject heading that a continuation page prints again (the same code and name as
    # the one above it): no node of its own, its digits are the adopted heading's.
    repeated_codes: list = field(default_factory=list)
    # Glyphs of a row with no name whose every printed amount equals the amount of the account row above it in
    # the same column (the 節 row of a 予備費, which prints no 節 name): the parent's amounts again, not new ones.
    repeated_amounts: list = field(default_factory=list)
    unpaid_rounds: list = field(default_factory=list)  # the printed round of a supplementary budget (`第２次補正`) no amount follows


def node_key(item: Item) -> str:
    x0, y0, _, _ = item.glyphs[0].original
    return 'n-' + hashlib.sha256(f'{item.page}:{x0:.2f}:{y0:.2f}:{item.group.axis}'.encode()).hexdigest()[:24]


DETAIL_PATTERNS = ('indent', 'shape', 'position')
# Numbering shapes of breakdown items (事業・説明), in the order they are tried.
SHAPES = (('bullet', re.compile(r'^[○〇●◎□■◇◆]')), ('paren', re.compile(r'^[(（][0-9]+[)）]')),
          ('circled', re.compile(r'^[⓪①-⑳㉑-㉟㊱-㊿❶-❿⓫-⓴]')), ('kana-paren', re.compile(r'^[(（][ア-ン][)）]')),
          ('kana', re.compile(r'^[ア-ン](?=[\s　]|[^ぁ-ゟァ-ヶー])')), ('number', re.compile(r'^[0-9]+')))


def shape_of(item: Item) -> str | None:
    raw = unicodedata.normalize('NFKC', text(item.lines[0])) if item.lines else ''
    raw = raw.strip()
    if item.group.kana is not None and item.lines and item.group.kana.module.apart(item.lines[0]):
        return 'kana'
    for name, pattern in SHAPES:
        if pattern.match(raw if name not in ('circled',) else text(item.lines[0]).strip()):
            # A name that begins with a digit (`３階ホール…`, `30歳・35歳健康診査委託料`) is no number:
            # the item reading had already left its code empty.
            if name == 'number' and item.code is None:
                return None
            if name == 'number' and len(item.code) > 4:
                return f'number{len(item.code)}'  # a long code (the quirk `glued_project_codes`) is a shape of its length
            return name
    # A number printed between the two lines of a wrapped name (`負担金補助` / `18` / `及び交付金`, 132021).
    return 'number' if item.code is not None and item.code.isdigit() else None


INDENT_SPAN = 6.0  # one indentation step is a character (about 10pt); a level is narrower than this


def split_wide(cluster: list[float]) -> list[list[float]]:
    """Split a chain of starts wider than one indentation step at its emptiest point between two peaks.

    Starts within 3pt chain into one level. Printed text gives each level one x; OCR spreads a level over a
    few points and a handful of lines in between (a bracket, a letter-spaced name) can bridge two levels
    10pt apart (`補助金` at 856 and its parts at 866, 132055), so a chain that spans more than a step is cut
    at the least-used whole point between its most used start and the most used one a step away from it."""
    if cluster[-1] - cluster[0] <= INDENT_SPAN:
        return [cluster]
    counts = Counter(round(v) for v in cluster)
    peak = max(counts, key=lambda b: (counts[b], -b))
    far = [b for b in counts if abs(b - peak) >= INDENT_SPAN]
    if not far:
        return [cluster]
    other = max(far, key=lambda b: (counts[b], -abs(b - peak)))
    low, high = sorted((peak, other))
    middle = (low + high) / 2
    valley = min(range(low + 1, high), key=lambda b: (counts.get(b, 0), abs(b - middle)))
    left = [v for v in cluster if v < valley + .5]
    right = [v for v in cluster if v >= valley + .5]
    if not left or not right:
        return [cluster]
    return split_wide(left) + split_wide(right)


def same_heading(first: str, second: str) -> bool:
    """Two printings of one subject name: equal, or (names of three characters or more) one character apart.

    A continuation page repeats the subject heading; OCR may misread a character of it (`秘書広银費` for
    秘書広報費, 132055). The codes already agree, so one character is the misread, not another subject."""
    a, b = (normalize(name or '') for name in (first, second))
    # A page that goes on with the 目 prints its name in brackets (`10 (文書広報費)` under `10 文書広報費`).
    a, b = (re.sub(r'^[(（]|[)）]$', '', name) for name in (a, b))
    if a == b:
        return True
    if min(len(a), len(b)) < 3 or abs(len(a) - len(b)) > 1:
        return False
    previous = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        row = [i]
        for j, cb in enumerate(b, 1):
            row.append(min(row[-1] + 1, previous[j] + 1, previous[j - 1] + (ca != cb)))
        previous = row
    return previous[-1] <= 1


def repeats(previous: Item, item: Item, ocr: bool = False) -> bool:
    """Whether a subject line repeats the open heading of its level on a continuation page.

    Printed text repeats the code (and the name). For OCR (`scan.near_code`), a line of codes only (`10 2 3`
    at the top of a page) repeats the open heading when its code is near, and a line with a name of three
    characters or more repeats it when its code is near and its name agrees to one character."""
    if previous.code is None and item.code is None:
        # Without codes nothing backs the one character `same_heading` allows: 営業外費用 is no misread of the
        # open 営業費用 (132012 下水道事業会計), so a line repeats the heading only by the same name.
        return not item.name or normalize(previous.name or '') == normalize(item.name)
    if previous.code == item.code and (not item.name or same_heading(previous.name, item.name)):
        return True
    if not ocr:
        return False
    from ingestion.generic.scan import misread_repeat
    return misread_repeat(previous.code, previous.name, item.code, item.name)


def stacked_columns(logicals: list[Logical]) -> set[str]:
    """Amount columns (by heading) that print two or more amounts in one cell somewhere in the document.

    Such a column tells its amounts apart by a kind word above each (`継続費逓次繰越` / `73,871,000` /
    `繰越明許費` / `102,288,855`, 132241); there every kind word is part of the amount's heading. A column
    that never stacks keeps its own heading under a kind word (立川's `繰越明許` over one amount).
    """
    found: set[str] = set()
    for logical in logicals:
        for band in logical.bands:
            if band.kind != 'amount':
                continue
            counts = Counter(_cell(band, sum((g.y0 + g.y1) / 2 for g in line) / len(line))
                             for line in lines(band.words)
                             if line and any(is_amount(_leading_amount(g).text) for g in line))
            if any(count >= 2 for count in counts.values()):
                found.add('／'.join(band.header))
    return found


def department_heading(item: Item, layout: dict | None = None) -> bool:
    """A line that is only a department in brackets with an amount of its own (`(財政課) 138,154,166`): the
    items printed under it at its indentation are its parts (`22 償還金利子及び割引料 138,154,166`). The quirk
    `office_departments` reads more lines so."""
    if item.code is not None or not item.amounts:
        return False
    name = normalize(item.name)
    if re.fullmatch(r'[（(][^()（）]+[)）]', name):
        return True
    offices = quirk((layout or {}).get(item.group.axis), 'office_departments')
    shares = quirk((layout or {}).get(item.group.axis), 'department_amounts')
    return (offices is not None and offices.module.heading(name)) or (shares is not None and shares.module.heading(name))


def closing_department_headings(ordered: list[Item], layout: dict | None = None) -> set[int]:
    """The department headings whose parts sum to them: `(財政課) 138,154,166` over `22 …… 138,154,166`.

    A bracketed department line with an amount is read as the parent of the items printed under it at its
    own indentation only when those items add up to its amount; otherwise the line is an item like the
    others. (A volume that begins in the middle of a 事業 cannot close its first heading, and must not
    be made to look as if a sum were missing.)"""
    closing: set[int] = set()
    for index, item in enumerate(ordered):
        if item.group.subject or not department_heading(item, layout):
            continue
        shares = quirk((layout or {}).get(item.group.axis), 'department_amounts')
        parts = []
        for position in range(index + 1, len(ordered)):
            other = ordered[position]
            if other.group.subject and not other.amounts and other.page != item.page:
                # The subject printed again at the top of the next page (`(1 保健衛生費)`): the parts run on. A new
                # subject there (its amounts may sit in a column not yet joined to it) ends them.
                depths = document_quirk('title_depths')
                open_one = next((s for s in reversed(ordered[:position]) if s.group.subject and s.level == other.level
                                 and (depths is None or s.title_depth == other.title_depth)), None)
                if open_one is not None and repeats(open_one, other, ocr=True):
                    continue
                if shares is not None:
                    continue  # (the quirk: the 目 printed again by its number alone, `１.`)
                break
            if other.group.subject:
                break
            if other.group.axis != item.group.axis:
                if document_quirk('spread_columns') is not None:
                    continue
                break
            start = lambda it: it.lines[0][0].x0  # where the line starts, its number included
            slack = heading_slack(item.lines[0][0])
            if start(other) < start(item) - slack:
                break
            if department_heading(other, layout) or (shares is not None and other.code is not None):
                break  # (the quirk: the next numbered 事業 ends the department's parts)
            if abs(start(other) - start(item)) <= slack and other.role in ('node', 'note') and other.amounts:
                parts.append(other)
        first = lambda it: number(normalize(text(it.amounts[0][1]))) or 0
        if parts and sum(first(p) for p in parts) == first(item):
            closing.add(id(item))
    return closing


def prints_phase(logical: Logical) -> bool:
    """Whether a logical page has an amount column whose heading the shared dictionary knows (支出済額,
    予算現額, 当初予算額…): the sign of an expenditure detail even when its 款・項・目 column is on another page."""
    known = {label for _, label in phase_dictionary()}
    return any(band.kind == 'amount' and (('／'.join(band.header) in known) or (band.header and band.header[-1] in known)
                                           or any(part in known for part in band.header))
               for band in logical.bands)


def heading_slack(first: Glyph) -> float:
    """How far left of a department heading's start its parts may start."""
    slack = document_quirk('department_heading_slack')
    return slack.module.slack(first) if slack is not None else 3


def layout_name_start(item: Item, hang_chars: int | None = None) -> float:
    """A configured hanging name starts after its printed code, including its punctuation. `hang_chars` is
    the document's own hang: its wrapped lines start that many characters right of the numbered line's start,
    whatever the number's width (a two-digit code is not one character wider)."""
    if item.code is None:
        return _name_start(item)
    if hang_chars:
        first = item.lines[0][0]
        return first.x0 + (first.y1 - first.y0) * hang_chars
    found = CODE.match(normalize(text(item.lines[0])))
    if found is None:
        return _name_start(item)
    remaining = len(found.group())
    for glyph in item.lines[0]:
        if remaining < len(glyph.text):
            prefix = glyph.text[:remaining]
            return glyph.x0 + (glyph.y1 - glyph.y0) * sum(.5 if c.isascii() else 1 for c in prefix)
        remaining -= len(glyph.text)
    return item.indent


def _value(item: Item) -> int | None:
    """The item's first amount as a number, its brackets taken off."""
    return number(normalize(text(item.amounts[0][1])).strip('()（）')) if item.amounts else None


def apply_layout(items: list[Item], settings: dict, column_amount_items: set[int],
                 subject_starts: tuple[float, ...] = ()) -> list[Item]:
    """Apply declared hints after money ownership is known, before learning breakdown levels."""
    result = []
    marks = settings.get('marks', {})
    ordered_marks = sorted(marks, key=lambda mark: (-len(normalize(mark)), mark))
    shapes = {'1': 'number', '(1)': 'paren', 'ア': 'kana', '①': 'circled'}
    note_kinds = {normalize(prefix): kind for prefix, kind in settings.get('note_kinds', {}).items()}
    prefixes = note_prefixes(settings)
    rows = quirk(settings, 'rows')
    spaced = document_quirk('letter_spaced_lines')
    unnumbered = quirk(settings, 'unnumbered_shift')
    highlights = quirk(settings, 'listed_highlights')
    whole = quirk(settings, 'whole_name_notes')
    whole_names = {normalize(name): kind for name, kind in whole.value.items()} if whole is not None else {}
    for item in items:
        if rows is not None:
            rows.module.unnumber(item)
        if settings.get('wrap'):
            item.indent = layout_name_start(item, settings.get('hang_chars'))
        raw = normalize(text(item.lines[0]))
        note = raw.startswith(prefixes) or raw in whole_names
        if not note and highlights is not None and highlights.module.listed(item) and id(item) not in column_amount_items:
            note, item.hint = True, highlights.module.KIND
        waiting = result[-1] if result else None
        if (note and raw.startswith(('(', '（')) and settings.get('wrap') == 'amount_on_last_line' and waiting is not None and waiting.role in ('node', 'note')
                and not waiting.amounts and id(waiting) not in column_amount_items
                and waiting.page == item.page
                and abs(item.lines[0][0].x0 - waiting.indent) <= max(g.y1 - g.y0 for g in item.glyphs)  # a character
                and 0 <= item.y0 - waiting.y1 <= max(g.y1 - g.y0 for g in item.glyphs)):
            # The second line of a name still waiting for its amount (`…委員報酬` / `(9人) 840,000`); the count in
            # its bracket is no item number. Only a bracket: a note of another prefix under a name (`1報酬` /
            # `1項1目18節から 169,664`, 132055) is the note it says it is.
            note = False
            item.code, item.name, item.indent = None, raw, waiting.indent
        mark = next((m for m in ordered_marks
                     if (shape_of(item) == shapes[m] if m in shapes else raw.startswith(normalize(m)))), None)
        if note:
            item.hint = whole_names.get(raw) or next((kind for prefix, kind in note_kinds.items() if raw.startswith(prefix)), item.hint)
            if id(item) in column_amount_items:
                raise ValueError(f'Configured note carries separate-column money: p{item.page} {item.name!r}')
            item.role = 'annotation'
        elif mark is not None and item.role in ('node', 'note'):
            if marks[mark] == '説明':
                if item.amounts or id(item) in column_amount_items:
                    raise ValueError(f'Configured explanation carries money: p{item.page} {item.name!r}')
                item.role = 'note'
            else:
                item.level = marks[mark] - 1
        elif unnumbered is not None and unnumbered.module.shift(item, note, unnumbered.value, id(item) in column_amount_items):
            item.unnumbered_shift = unnumbered.value
        previous = result[-1] if result else None
        if (previous and previous.role == 'annotation' and not previous.amounts and item.page == previous.page
                and normalize(previous.name).startswith(('(', '（')) and not re.search(r'[)）]', normalize(previous.name))
                and (item.amounts or re.search(r'[)）]$', normalize(text(item.lines[-1]))))
                and 0 <= item.y0 - previous.y1 <= max(g.y1 - g.y0 for g in item.glyphs)):
            # A bracketed note wrapped before its count (`(投票用紙読取分類機` / `3台 2,805,000)`): the number
            # starting the second line is the count, not an item's number.
            if id(item) in column_amount_items:
                raise ValueError(f'Configured note carries separate-column money: p{item.page} {item.name!r}')
            previous.name += ''.join(normalize(text(line)) for line in item.lines)
            previous.lines += item.lines
            previous.amounts += item.amounts
            continue
        if (rows is not None and previous and item.code is None and mark is None and not note
                and rows.module.same_row(previous, item)):
            previous.name += item.name
            previous.lines += item.lines
            continue
        if (previous and spaced is not None and item.code is None and previous.code is None and mark is None and not note
                and item.role == 'note' and not item.amounts and previous.role == 'node' and item.page == previous.page
                and spaced.module.same_line_after(item, previous)):
            # The last character of a letter-spaced name boxed a little higher than the others (`費` 689.6 over
            # `委` `員` `旅` 692.3) was read first: the others begin its line.
            previous.lines[0] = item.lines[0] + previous.lines[0]
            previous.name = item.name + previous.name
            previous.indent = item.indent
            continue
        if (previous and not previous.amounts and id(previous) not in column_amount_items and item.code is None and mark is None and not note
                and item.role in ('node', 'note') and previous.role in ('node', 'note', 'annotation')
                and (settings.get('wrap') == 'amount_on_last_line' or normalize(text(previous.lines[0])).startswith(prefixes))
                and item.page == previous.page
                and bisect_right(subject_starts, previous.anchor) == bisect_right(subject_starts, item.anchor)
                and ((abs(item.indent - previous.indent) <= 3 + float(settings.get('name_start_slack', 0))
                      and -(spaced.module.overlap(max(g.y1 - g.y0 for g in item.glyphs)) if spaced is not None else 0)
                      <= item.y0 - previous.y1 <= max(g.y1 - g.y0 for g in item.glyphs))
                     or (spaced is not None and spaced.module.same_line_after(previous, item)))):
            if previous.role == 'annotation' and id(item) in column_amount_items:
                raise ValueError(f'Configured note carries separate-column money: p{item.page} {item.name!r}')
            if item.role == 'node' and previous.role == 'note':
                previous.role = 'node'
            previous.name += item.name
            previous.lines += item.lines
            previous.amounts += item.amounts
            previous.kinds += item.kinds
            continue
        result.append(item)
    if rows is not None:
        rows.module.flatten(result)
    columns = quirk(settings, 'name_columns')
    columned = columns.module.columned(result) if columns is not None else []
    if (fitted := quirk(settings, 'fitted_names')) is not None:
        fitted.module.shift(result, fitted.value)
    for item, base in columned:
        item.indent = base.indent
    return result


def mixed_document(logicals: list[Logical]) -> bool:
    """Whether a text document has pages OCR read (`mixed.py`): only then are the OCR pages read by what the printed ones teach."""
    return any(l.ocr for l in logicals) and any(not l.ocr for l in logicals)


def snap_ocr_levels(own: list[Item], centres: list[float]) -> None:
    """An OCR page's lines start a point or three off the printed levels (a misread mark moves a line's start by half a
    character), and a start between two levels is no level of its own: the OCR's starts are grouped around as many
    centres as the printed pages have levels, and each group is the printed level of its rank."""
    if len(centres) < 2 or len(own) < 3 * len(centres):
        return
    shift = sorted(i.indent - min(centres, key=lambda c: abs(c - i.indent)) for i in own)[len(own) // 2]
    middles = [c + shift for c in centres]
    for _ in range(20):
        groups_: list[list[float]] = [[] for _ in middles]
        for item in own:
            groups_[min(range(len(middles)), key=lambda k: abs(middles[k] - item.indent))].append(item.indent)
        middles = [sum(g) / len(g) if g else m for g, m in zip(groups_, middles)]
    if all(b - a >= 2 * INDENT_SPAN / 3 for a, b in zip(middles, middles[1:])):
        for item in own:
            item.indent = centres[min(range(len(middles)), key=lambda k: abs(middles[k] - item.indent))]


def level_indents(all_items: list, mixed: bool) -> tuple[dict[str, list[float]], set[str]]:
    """The line starts each non-subject axis learns its indentation levels from, and the axes the printed pages teach.
    In a mixed document the levels are the printed pages' (an OCR page's words lie a point or two off); an axis no
    printed page has a node of (only the OCR pages print it, or the printed pages print notes only) is learned from
    the OCR pages."""
    nodes = lambda group, found: [i.indent for i in found[id(group)] if i.role == 'node']
    printed = {g.axis for l, ordered, found in all_items if not l.ocr for g in ordered
               if not g.subject and nodes(g, found)} if mixed else set()
    indents: dict[str, list[float]] = defaultdict(list)
    for logical, ordered, found in all_items:
        for group in ordered:
            if not group.subject and not (logical.ocr and group.axis in printed):
                indents[group.axis] += nodes(group, found)
    return indents, printed


def build(logicals: list[Logical], judge=None, pattern: str = 'bands', detail: str | dict = 'indent',
          layout: dict | None = None, codes_right: bool = False, *, strict: bool = False,
          amounts_next_row: bool = False, document: dict | None = None) -> Built:
    """`detail` is one breakdown pattern for every axis, or a mapping axis → pattern.

    `document`: the settings that hold the document's quirks (the workflow's `quirks`)."""
    """`judge(lines) -> {line id: (role, confidence)}` replaces the codeless-line rules (variant B)."""
    name_lines = {axis: quirk(settings, 'name_line') for axis, settings in (layout or {}).items()
                  if isinstance(settings, dict) and quirk(settings, 'name_line') is not None}
    shapes: dict[str, list[str]] = {}  # numbering shapes per breakdown axis, in order of first use
    anchors: dict[str, dict[str, tuple[float, float, int]]] = {}  # where each shape's numbers start and end, per axis
    stack: list[Item] = []  # open subject items by depth
    branch: dict[str, list[Item]] = {}  # open items per other axis
    levels: dict[str, list[float]] = {}
    nodes, amounts, unowned, notes = [], [], [], []
    placed: list[Item] = []  # the items of `nodes`, in order
    repeated_codes: list = []
    # `repeated_heading_owns_nothing`: a heading the page prints again takes no amount of the line it is on.
    owners = ('node', 'total') if quirk(document, 'repeated_heading_owns_nothing') is not None else ('node', 'repeat', 'total')
    for logical in logicals:
        for group in groups(logical, pattern):
            if (group.subject and group.mode == 'indent') or (not group.subject and group.axis == '款項目'):
                repeated_codes.extend(strip_ancestor_codes(group))
    unowned_runs: list[tuple[dict, list[Glyph]]] = []  # an amount no row owns, with its glyphs
    annotations: list[tuple[Item, str, list[Glyph], str | None]] = []
    remarks: list[dict] = []  # `Built.annotations` before the items have keys
    unpaid_rounds: list[Glyph] = []
    all_items: list[tuple[Logical, list[Group], dict[int, list[Item]]]] = []
    column_amount_items: set[int] = set()
    # What the document teaches is read from its printed pages: the few pages of a text document that OCR read
    # (`mixed.py`) are read by what the others teach and teach nothing (a scan, all OCR, learns from itself).
    taught = [logical for logical in logicals if not logical.ocr] or logicals
    margins = code_margins(taught)
    edges = number_edges(taught, pattern)
    limits = line_limits(taught)
    stacking = stacked_columns(taught)
    # The OCR pages of a mixed document share the text pages' coordinates, but Paddle's word left edges sit 1-2pt
    # off the text layer's glyphs (132080: `14` at 423.4, where the text layer teaches 426±1): what the text pages
    # teach does not land on the OCR columns, so they teach each other (a scan teaches itself).
    scanned = [logical for logical in logicals if logical.ocr] if taught is not logicals else []
    if scanned:
        scan_margins, scan_edges, scan_limits = code_margins(scanned), number_edges(scanned, pattern), line_limits(scanned)
        text_taught = (margins, edges, limits)
    skipped: list[Logical] = []
    gaps = document_quirk('code_gap_wraps')
    open_headings: dict[str, tuple[int, float]] = {}  # per axis: the depth and line start of the open department heading
    summing: dict[str, list] = {}  # per axis: the depth, amount and items' sum so far of the open declared heading
    for logical in logicals:
        if scanned:
            margins, edges, limits = (scan_margins, scan_edges, scan_limits) if logical.ocr else text_taught
        ordered = groups(logical, pattern)
        if not any(g.subject for g in ordered) and not prints_phase(logical):
            # A frame with no 款・項・目 column and no column of a budget or settlement amount is no
            # expenditure detail but a list of its own (a table of 流用, a summary of carry-overs): it is
            # left out and declared as such (`Built.skipped`), never read as items without a parent.
            skipped.append(logical)
            continue
        found = {}
        for group in ordered:
            header = '／'.join(group.bands[0].header) if not group.subject else group.axis
            if not group.subject:
                header = group.axis if group.axis in group.bands[0].header else header
                header = '／'.join(group.bands[0].header[:group.bands[0].header.index(group.axis) + 1]) \
                    if group.axis in group.bands[0].header else header
            roles = None
            if judge is not None and not group.subject:
                roles = judged_roles(judge, group, margins.get(group.axis))
            if not group.subject:
                column = [w for band in logical.bands if band.kind == 'amount' and band.header[:1] == (group.axis,)
                          and group.x1 - 1 <= band.x0 for w in band.words if is_amount(w.text)]
                group_items = items(group, header, margins.get(group.axis), roles, limits.get(group.axis), logical.ocr,
                                    bool(layout and layout.get(group.axis, {}).get('amount_brackets')),
                                    (layout or {}).get(group.axis), column_amounts=column)
            elif group.mode == 'indent':
                # The subject of a text layer (133086 `03戸` / `籍住民基本`, wrapped to `台帳費` at the name's start).
                # (The open headings a continuation page prints again over its first code: the quirk
                # `repeated_subject_headings`.)
                group_items = items(group, group.axis, joined_codes=not logical.ocr,
                                    settings={'quirks': {'repeated_subject_headings': True}}
                                    if quirk(document, 'repeated_subject_headings') is not None else None)
            else:
                for band in group.bands:
                    band.words = split_glued_numbers(band.words, edges)
                group_items = subject_items(group, quirk(document, 'marked_subjects'),
                                            quirk(document, 'codeless_beside_repeated_code'))
            if not group.subject:
                group_items = join_transfer_tails(group_items, layout)
                if (digit_set := quirk(document, 'digit_set_codes')) is not None:
                    digit_set.module.measure(group_items, digit_set.value)
            for position, item in enumerate(group_items):
                # 01.01.01.01から流用 starts with digits. A parenthesised remark joined to an item's
                # name (`需用費（同事業、委託料へ流用 △1,815,000）`) does not make the item a note.
                if (TRANSFER.search(PAREN_TAIL.sub('', item.name)) and not group.subject
                        and not is_plain_name(layout, item)):
                    item.role = 'annotation'  # a transfer note annotates the subject row
                elif item.code is None and TOTAL.search(item.name):
                    item.role = 'total'
                elif item.code is None and not item.amounts and not group.subject:
                    item.heading = heads_items(layout, group_items, position)
                    item.role = 'node' if item.heading else 'note'
                elif (item.code is None and item.amounts and not group.subject and not item.kinds
                      and not is_plain_name(layout, item)
                      and (kind_of(PAREN_TAIL.sub('', item.name)) is not None or is_account_code(item.name))):
                    item.role = 'annotation'  # An amount note or a transfer's account code, no item of the breakdown.
            found[id(group)] = group_items
        subject = next((g for g in ordered if g.subject), None)
        if subject is not None and (untitled(subject) or getattr(logical, 'opening', False)) and logical.level_titles is not None:
            # Tables stacked on the page, each under its 款・項 titles: the titles are the 款・項 items, in order.
            before, one_line = None, document_quirk('titles_on_one_line')
            for level_name, code, name, line, amount in logical.level_titles:
                title = Item(subject, line[0].page, [line], code, name, line[0].x0, level=-1, level_name=level_name,
                             title_depth=SUBJECT_LEVELS.index(level_name) + 1)
                if amount is not None:
                    title.amounts.append(amount)
                if one_line is not None and before is not None:
                    one_line.module.follow(before, title, line)
                before = title
                found[id(subject)].append(title)
            found[id(subject)].sort(key=lambda i: i.anchor)
        elif subject is not None and untitled(subject):
            # A table without a 款 column under a title naming its 款: the title is the 款 item.
            for code, name, line in logical.titles:
                # An indent group reads levels from where a code starts: the title stands where a 款 code would
                # (one character inside the 款 column), not where its own text starts.
                indent = subject.bands[0].x0 + (line[0].y1 - line[0].y0) if subject.mode == 'indent' else line[0].x0
                title = Item(subject, line[0].page, [line], code, name, indent, level=-1, level_name='款')
                kind, run = title_amount(line)
                if kind and run and is_amount(normalize(text(run))):  # `（決算額 4,764,369,474 円）`
                    title.amounts.append((kind, run))
                elif kind:
                    unowned.append({'kind': 'unreadable amount', 'page': line[0].page, 'text': normalize(text(line))})
                found[id(subject)].insert(0, title)
        # A codeless line whose row holds amounts in an amount band is an item
        # (a 節 column printed without numbers), not a note.
        for band in logical.bands:
            if band.kind != 'amount':
                continue
            for line in lines(band.words):
                money = [g for g in line if is_amount(g.text)]
                if not money:
                    continue
                target = owner(money, band, ordered, found, roles=(*owners, 'note'), name_line=name_lines)
                if target is not None:
                    column_amount_items.add(id(target))
                if target is not None and target.role == 'note':
                    target.role = 'node'
                if layout:
                    note_target = owner(money, band, ordered, found, roles=('node', 'repeat', 'total', 'note', 'annotation'),
                                        name_line=name_lines)
                    prefixes = note_prefixes(layout.get(note_target.group.axis, {})) if note_target is not None else ()
                    if note_target is not None and normalize(text(note_target.lines[0])).startswith(prefixes):
                        column_amount_items.add(id(note_target))
        all_items.append((logical, ordered, found))
    # A subject's name can cross a rule of its narrow name column while its amount cell stays whole.
    # The next line without a code or amount is still the name, not a deeper subject (`センタ－費`).
    subject_pattern = load_pattern("subject", pattern)
    alignment = (subject_pattern.alignment(all_items, codes_right, quirk(document, 'glued_subject_codes'))
                 if pattern == "indent" else None)
    for logical, ordered, found in all_items:
        for group in ordered:
            if not group.subject:
                continue
            kept = []
            for item in found[id(group)]:
                previous = kept[-1] if kept else None
                # (Under stacked titles a 目 abolished this year prints no number: `退職被保険` / `者等療養費` `0 1 △1`.)
                if (previous is not None and previous.name
                        and (previous.code is not None or (logical.level_titles is not None and id(previous) in column_amount_items))
                        and previous.role == item.role == 'node' and item.code is None and item.name
                        and not item.amounts
                        # (a name wrapped so that its amount is printed on the last line, none on the code's line: `1 居宅サービス` / `事業費 3,596,885`)
                        # (no rule between them in the amount columns: a subject of its own has its amount in a cell of its own)
                        and (id(item) not in column_amount_items
                             or (id(previous) not in column_amount_items and same_amount_cell(logical, previous, item))
                             or stacked_under(logical, previous, item))
                        and not TOTAL.search(item.name) and item.page == previous.page
                        # (A line starting between the code's end and the name's start wraps that name: a name split from
                        # its code by the width of its characters starts too far right, `3その他公共施` / `設・公用施設`, 133078.)
                        and (abs(item.indent - previous.indent) <= 3
                             or (gaps is not None and gaps.module.wraps(previous, item))
                             if group.mode == 'indent' else
                             group.bands[item.level].header[-1] == group.bands[previous.level].header[-1])
                        and (0 <= item.y0 - previous.y1 <= max(g.y1 - g.y0 for g in item.glyphs)
                             # (under stacked titles a 目's name wraps over the lines of its ruled row, set further
                             # apart than a line: `地域密着型` / `サービス事` / `業者指定等` / `事務費`)
                             or (logical.level_titles is not None and within_row(logical, previous, item)))):
                    previous.name += item.name
                    previous.lines += item.lines
                    if id(item) in column_amount_items:
                        column_amount_items.add(id(previous))
                    continue
                kept.append(item)
            if group.mode == "indent":
                subject_pattern.align(logical, group, kept, alignment)
                if group.subject and (digit_set := quirk(document, 'digit_set_codes')) is not None:
                    digit_set.module.align(kept, digit_set.value)
            found[id(group)] = kept
    # A subject name cut at the foot of a page continues without a number or amount at the next page's
    # start (`8 市立社会福祉` / `センター費`). Keep its first-page position; a box cannot span two pages.
    for position, ((_, ordered, found), (_, next_ordered, next_found)) in enumerate(zip(all_items, all_items[1:])):
        for group in ordered:
            tail = found[id(group)][-1] if group.subject and found[id(group)] else None
            if tail is None or tail.role != 'node' or tail.code is None or not tail.name:
                continue
            tail_band = group.bands[tail.level or 0]
            if abs(_cell(tail_band, tail.anchor)[1] - tail_band.body_bottom) > .5:
                continue
            # The headings open at the foot of the page: a name-only line of the next page that repeats one of them
            # (`総務管理費` / `一般管理費` printed again, without their codes) is a repeated heading, not the tail's name.
            opened, shallowest = [tail.name], tail.indent
            earlier = [i for _, o, f in all_items[:position + 1] for g in o if g.subject and g.axis == group.axis
                       for i in f[id(g)][:-1 if f is found else None]]
            for item in reversed(earlier):
                if item.role == 'node' and item.code is not None and item.indent < shallowest - 3:
                    opened.append(item.name)
                    shallowest = item.indent
            for other in next_ordered:
                if not other.subject or not next_found[id(other)]:
                    continue
                previous_head = None
                for head in list(next_found[id(other)]):
                    # The open headings printed again, outermost first, as one name or several lines.
                    if any(same_heading(''.join(reversed(opened[:count])), head.name) for count in range(1, len(opened) + 1)):
                        break
                    if (head.code is not None or head.amounts or id(head) in column_amount_items
                            or head.role != 'node' or not head.name or TOTAL.search(head.name)
                            or not 0 < head.page - tail.page <= 2
                            or [b.header for b in other.bands] != [b.header for b in group.bands]):
                        break
                    head_band = other.bands[head.level or 0]
                    if previous_head is None and abs(_cell(head_band, head.anchor)[0] - head_band.body_top) > .5:
                        break
                    if previous_head is not None and (head.page != previous_head.page
                            or head.level != previous_head.level
                            or not 0 <= head.y0 - previous_head.y1 <= max(g.y1 - g.y0 for g in head.glyphs)):
                        break
                    tail.name += head.name
                    next_found[id(other)].remove(head)
                    previous_head = head
                break
    # An account code printed with the amount of a transfer at the foot of a page (`account_code_transfers`).
    for (_, ordered, found), (_, next_ordered, next_found) in zip(all_items, all_items[1:] if document_quirk('account_code_transfers') else ()):
        for group in ordered:
            tail = found[id(group)][-1] if not group.subject and found[id(group)] else None
            if tail is None or tail.role != 'annotation' or tail.code is not None or tail.hint is not None \
                    or not is_account_code(tail.name):
                continue
            for other in next_ordered:
                head = next_found[id(other)][0] if not other.subject and other.axis == group.axis \
                    and next_found[id(other)] else None
                if head is not None and head.code is None and not head.amounts and 0 <= head.page - tail.page <= 2:
                    tail.hint = kind_of(head.name, words=True)
                    break
    # Use the subject events after name continuations have been joined: a fragment is not a new
    # subject boundary. A note's parts still cannot cross into another subject with a matching sum.
    for logical, ordered, found in all_items:
        subject_starts = tuple(sorted({subject_row(i, logical)[0] for g in ordered if g.subject
                                       for i in found[id(g)] if i.role == 'node'}))
        for group in ordered:
            if not group.subject:
                group.kana = quirk((layout or {}).get(group.axis), 'kana_set_apart')
                group.numbers_right = quirk((layout or {}).get(group.axis), 'numbers_set_right')
                if (rows_from := quirk((layout or {}).get(group.axis), 'rows_from')) is not None:
                    found[id(group)] = rows_from.module.with_empty_rows(found[id(group)], group, logical, rows_from.value)
                if layout and group.axis in layout:
                    found[id(group)] = apply_layout(found[id(group)], layout[group.axis], column_amount_items,
                                                   subject_starts)
                note_breakdown(found[id(group)], subject_starts,
                               1 if (layout or {}).get(group.axis, {}).get('single_part_notes') else 2)
    # The amount of a label that ends a page is the first line of the next page, under the subject's row
    # repeated at its top (`wrap: amount_on_last_line`, `items` keeps that line as a nameless item).
    tails: dict[str, Item] = {}
    for _, ordered, found in all_items:
        for group in ordered:
            if group.subject:
                continue
            mine = found[id(group)]
            previous = tails.get(group.axis)
            if (((layout or {}).get(group.axis, {}).get('wrap') == 'amount_on_last_line'
                 or quirk((layout or {}).get(group.axis), 'amount_on_next_page') is not None
                 or quirk((layout or {}).get(group.axis), 'amount_over_page') is not None) and previous is not None
                    and mine and not mine[0].name and mine[0].amounts and mine[0].code is None
                    and not previous.amounts and previous.name
                    and previous.role in ('node', 'note', 'annotation') and mine[0].page == previous.page + 1):
                first = mine.pop(0)
                previous.lines += first.lines
                previous.amounts += first.amounts
            elif (previous is not None and mine
                  and (over := quirk((layout or {}).get(group.axis), 'names_over_pages')) is not None
                  and over.module.runs_on(previous, mine[0])):
                first = mine.pop(0)
                previous.role = 'node'
                previous.name += first.name
                previous.lines += first.lines
                previous.amounts += first.amounts
            if mine:
                tails[group.axis] = mine[-1]
    for axis, hints in (layout or {}).items():
        if not (chars := hints.get('indent_chars')):
            continue
        axis_items = [i for _, ordered, found in all_items for g in ordered if not g.subject and g.axis == axis
                      for i in found[id(g)] if i.role == 'node']
        # Codes are set a whole step apart at every level, however wide the number (a name's start is not).
        # The number's line places the item: a name wrapped above it (`使用料及` / `13` / `賃借料`) starts
        # in the name column.
        first = lambda i: next((line[0] for line in i.lines if line and line[0].text[:1].isdigit()), i.lines[0][0])
        start = lambda i: first(i).x0
        origin = min((start(i) - i.group.x0 for i in axis_items), default=0)
        # A character is the axis's usual line height: OCR that read only the top half of a line
        # (`4土` 2.4pt high among 6pt lines, 281000) must not make its step that small.
        heights = sorted(first(i).y1 - first(i).y0 for i in axis_items)
        usual = heights[len(heights) // 2] if heights else 0
        for item in axis_items:
            if item.level is None:
                # A level is a whole step: an item set half a character right of its siblings (`98 …（再配当用）`
                # among `14 …`) is one of them, so only a shift of more than 60% of a step is a deeper level.
                height = max(first(item).y1 - first(item).y0, usual)
                steps = (start(item) - item.group.x0 - origin) / (chars * height)
                item.level = floor(steps + .4)
    if pattern == "indent":
        subject_pattern.learn_levels(all_items, quirk(document, 'codeless_name_levels'))
    for axis, hints in (layout or {}).items():
        if (edge := quirk(hints, 'column_edge')) is not None:
            edge.module.shift(all_items, axis)
    # Indentation levels per non-subject axis, learned over the document.
    indents, printed = level_indents(all_items, mixed_document(logicals))
    for axis, values in indents.items():
        clusters: list[list[float]] = []
        for value in sorted(values):
            if clusters and value - clusters[-1][-1] <= 3:
                clusters[-1].append(value)
            else:
                clusters.append([value])
        clusters = [part for cluster in clusters for part in split_wide(cluster)]
        minimum = max(2, len(values) // 200)
        kept = [c for c in clusters if len(c) >= minimum]
        centres = [sum(c) / len(c) for c in kept]
        # A level met once in a small document is still a level when it is clearly apart (half a
        # character or more) from every frequent one: `上・下水道代` under `光熱水費` (132292).
        for c in clusters:
            if len(c) < minimum and all(abs(sum(c) / len(c) - centre) >= 6 for centre in centres):
                kept.append(c)
                centres.append(sum(c) / len(c))
        levels[axis] = sorted(sum(c) / len(c) for c in kept)
    if mixed_document(logicals):
        for axis, centres in ((a, c) for a, c in levels.items() if a in printed):
            snap_ocr_levels([i for l, ordered, found in all_items if l.ocr for g in ordered if not g.subject and g.axis == axis
                             for i in found[id(g)] if i.role == 'node'], centres)
    depth_of = lambda item: 1 + min(range(len(levels[item.group.axis])),
                                    key=lambda i: abs(levels[item.group.axis][i] - item.indent))
    # Right-aligned amount columns also mark the level: learn which column each
    # indentation level prints its amount in, then read a codeless line whose
    # amount sits in the column of the amountless item above as that item's
    # wrapped last line (`【所管課】 299,161,329`).
    columns: dict[str, dict[int, Counter]] = defaultdict(lambda: defaultdict(Counter))
    for _, ordered, found in all_items:
        for group in ordered:
            if group.subject or not levels.get(group.axis):
                continue
            for item in found[id(group)]:
                if item.role == 'node' and item.amounts:
                    columns[group.axis][round(item.amounts[0][1][-1].x1 - item.amounts[0][1][-1].offset)][depth_of(item)] += 1
    amount_depth = lambda item: next((c.most_common(1)[0][0] for x, c in columns[item.group.axis].items()
                                      if abs(x - round(item.amounts[0][1][-1].x1 - item.amounts[0][1][-1].offset)) <= 2), None)
    for _, ordered, found in all_items:
        for group in ordered:
            if group.subject or not levels.get(group.axis):
                continue
            found[id(group)] = join_last_lines(found[id(group)], depth_of, amount_depth)
    for axis, hints in (layout or {}).items():
        if (levels_by_sum := quirk(hints, 'sum_levels')) is not None:
            levels_by_sum.module.apply([item for _, ordered, found in all_items for group in ordered
                                       if not group.subject and group.axis == axis for item in found[id(group)]])
    # Pattern position: a level is a numbering shape at one aligned position, or the
    # indentation of codeless lines; levels rank by where their lines start.
    modes = {detail} if isinstance(detail, str) else set(detail.values())
    if not strict:
        modes.add("indent")
    readings = {mode: load_pattern("breakdown", mode) for mode in modes}
    prepared = {mode: reading.prepare(all_items, levels, depth_of) for mode, reading in readings.items()}
    # 款 come from titles in this document: the 項・目 columns of untitled tables sit one level down.
    # (The 項 titles of stacked tables put them two levels down.)
    titled = max((i.title_depth for _, ordered, found in all_items for g in ordered if g.subject for i in found[id(g)]
                  if i.level == -1), default=0)
    # Per amount column: (item, kind word) of a stacked kind word left at the foot of a page with its amount still to come.
    carried: dict[str, tuple[Item, str | None, list[Glyph]]] = {}
    revision = quirk(document, 'revision_history')
    histories: dict[str, list] = {}  # per column: a `補正経過` the page ended in, its rounds going on over the page
    # `amounts_next_row`: the last subject item of the page before, still without an amount (its amounts row is the
    # first row of this page), and the items that took an amount.
    waiting_subject: Item | None = None
    owned: set[str] = set()

    def drop_carried_round(entry) -> None:
        # A round printed at the foot of a page that no amount follows: its number is no amount.
        if entry is not None and entry[1] is not None and SUPPLEMENT_ROUND.fullmatch(entry[1]):
            unpaid_rounds.extend(entry[2])

    def page_events(logical, ordered, found):
        events = sorted(((subject_row(item, logical)[0] if group.subject else item.anchor,
                          ordered.index(group), item.level or 0, item.anchor, item)
                         for group in ordered for item in found[id(group)]), key=lambda e: e[:4])
        return [e[4] for e in events]

    # A department heading's parts can run on to the next page (132055 p52-54): its sum is checked over the pages.
    # The quirk `name_line`: an item that prints its number alone above its name opens on its name's line.
    numbered_names: set[int] = set()
    for _, ordered, found in all_items:
        for group in ordered:
            if group.axis in name_lines:
                for item in found[id(group)]:
                    if item.fixed_anchor is None and (y := name_lines[group.axis].module.anchor(
                            item, lambda line: CODE.fullmatch(normalize(text(line))))) is not None:
                        item.fixed_anchor = y
                        item.indent = item.lines[1][0].x0  # the name starts its own line: `9` and `10` indent alike
                        numbered_names.add(id(item))
    closing_headings = closing_department_headings([item for entry in all_items for item in page_events(*entry)], layout)
    for logical, ordered, found in all_items:
        # A subject item opens at the top of its rule-bounded row: its label may be
        # centred lower than the first remark of its block.
        events = sorted(((subject_row(item, logical)[0] if group.subject else item.anchor,
                          ordered.index(group), item.level or 0, item.anchor, item)
                         for group in ordered for item in found[id(group)]), key=lambda e: e[:4])
        events = [(e[0], e[1], e[4]) for e in events]
        headings = heading_names(logical)
        subject_depth = max((g.levels or len(g.bands) for g in ordered if g.subject), default=3) \
            + (titled if any(title_shift(g) for g in ordered if g.subject) else 0)
        row = None  # (subject item, top, bottom) of the latest subject row
        opening = logical.reprints  # no subject with a code has begun on this page yet
        page_axes: set[str] = set()  # the breakdown axes with an item on this page so far (`repeated_at_top`)
        digit_set = quirk(document, 'digit_set_codes')
        for _, _, item in events:
            if not item.group.subject and item.role in ('node', 'note') and row is not None \
                    and (row[0].depth < subject_depth or item.code is None) and id(item) not in numbered_names \
                    and row[1] - .5 <= item.anchor <= row[2] + .5 \
                    and (not item.amounts or (kind_of(item.name, words=True) is not None
                                              and not is_plain_name(layout, item))):
                # A line in a subject's row annotates it when it prints no amount (a list of 議決 numbers) or
                # reads as a note (流用・充用・不用額…). A line with an amount that does not is an item, even
                # when the row is as tall as the subject's whole breakdown and the subject's name is centred
                # next to it: `(企画調整課) 4,021,547` is a department of the 事業 above it (132225).
                item.role = 'annotation'
            if (item.role in ('node', 'note') and not item.group.subject and stack
                    and normalize(stack[-1].name) == '予備費' and RESERVE_DESTINATION.search(normalize(item.name))):
                item.role = 'annotation'  # `02-01-04-03-14-01へ 1,630,000`: where the reserve was used (ADR 0024)
            if item.role == 'annotation':
                target = row[0] if row is not None else (stack[-1] if stack else None)
                notes.append({'kind': 'annotation', 'page': item.page, 'text': item.name,
                              'amounts': [text(r) for _, r in item.amounts]})
                if target is not None:
                    label = normalize(text([g for g in item.glyphs if not any(g in r for _, r in item.amounts)]))
                    over = quirk((layout or {}).get(item.group.axis), 'amount_over_page')
                    yen = bool((layout or {}).get(item.group.axis, {}).get('yen_marked')) and bool(item.amounts) \
                        and all(yen_marked(logical if over is None else over.module.page_of(all_items, run, logical), run)
                                for _, run in item.amounts)
                    for header, run in item.amounts:
                        annotations.append((target, f'{header}／注記／{label}', run, '円' if yen else logical.unit_of(header)))
                    remarks.append({'kind': 'annotation', 'target': target, 'heading': None,
                                    # A name that is only an account code (`・040102【151502】 400`) is the
                                    # counterpart of a transfer: its words (`1200へ予算流用増`) may sit on the
                                    # next page, so the amount is a 流用 note whichever way they read.
                                    'hint': item.hint or ('充用' if normalize(target.name) == '予備費'
                                                          else '流用' if is_account_code(item.name) else None),
                                    'label': [g for g in item.glyphs if not any(g in r for _, r in item.amounts)],
                                    'runs': [run for _, run in item.amounts], 'unit': '円' if yen else logical.unit})
                continue
            if item.role == 'total':
                notes.append({'kind': 'total', 'page': item.page, 'text': item.name}); continue
            if item.role == 'note':
                notes.append({'kind': 'note', 'page': item.page, 'text': item.name,
                              'amounts': [text(r) for _, r in item.amounts]})
                continue
            if item.group.subject:
                if item.code is not None and item.role == 'node':
                    opening = False
                elif opening and item.code is None and item.name and not item.amounts and item.role == 'node':
                    # A continuation page opens by printing the open headings again, names only (`総務管理費` /
                    # `一般管理費`, without their codes): the open heading of that name, not a new subject.
                    # (one line each, or all in one item when the page sets them close).
                    again = next((stack[-1] for count in range(1, len(stack) + 1)
                                  if same_heading(''.join(s.name for s in stack[-count:]), item.name)), None)
                    if again is None:
                        # The open headings printed again one to a line, outermost first: this line is one of them.
                        again = next((s for s in reversed(stack) if s.name and same_heading(s.name, item.name)), None)
                    if again is not None and digit_set is not None and again.level != item.level:
                        # (The quirk `digit_set_codes`: a 款, 項 and 目 the year drops print one name, `×` `保健福祉事業`
                        # at each level's place; the 項 that opens the next page is no reprint of the 款.)
                        again = None
                    if again is not None:
                        item.key, item.role = again.key, 'repeat'
                        # Digits in the repeated name (`市制７０周年記念事業費`) are the open heading's own, not an amount.
                        repeated_codes.extend(g for g in item.glyphs if re.search(r'[0-9０-９]', g.text))
                        continue
                if item.role == 'node':
                    # A subject not printed again has begun on the page: the headings printed again are over. In a
                    # table without codes (132012 下水道事業会計) a later 営業外費用 is no reprint of the open 営業費用.
                    opening = False
                depth = item.title_depth if item.level == -1 else item.level + 1 + (titled if title_shift(item.group) else 0)
                previous = stack[depth - 1] if len(stack) >= depth else None
                if previous is None and logical.level_titles is None:
                    # Bands that skip a level (a name band between the codes): find the open one by band. (Under
                    # stacked titles the open ones are titles or the 款 of the summary: a 目 of the same code and name
                    # as its 款 is no repeat of it.)
                    previous = next((s for s in stack if s.level == item.level), None)
                if previous is not None and repeats(previous, item, logical.ocr):
                    item.key = previous.key  # a repeated subject heading on a continuation page
                    item.role = 'repeat'
                    shown = next((g for g in item.glyphs[:3] if CODE.match(normalize(g.text))), None)
                    if shown is not None:  # `(1議会費)`: the bracket is a word of its own, the code follows it
                        repeated_codes.append(shown)
                    if item.level == -1 and logical.level_titles is not None:
                        # A stacked table's title printed again on a continuation page reprints its amount (`_dedupe`
                        # keeps one and flags a difference): the amount of the open heading, not a new one.
                        # The printed word, with the unit the amount leaves out (`24,930,655千円`).
                        repeated_codes.extend(g for g in logical.outside if any(
                            g.page == r.page and abs(g.y0 - r.y0) < 1 and g.x0 <= r.x0 + .5 and g.x1 >= r.x1 - .5
                            for _, run in item.amounts for r in run))
                    continue
                if not item.name:
                    level = item.level_name or (item.group.bands[item.level].header[-1]
                                                if item.group.mode in ('bands', 'names') else '')
                    item.name = headings.get((level, normalize(item.code or '')), '')
                if depth > len(stack) + 1:
                    unowned.append({'kind': 'subject depth gap', 'page': item.page, 'text': item.name})
                del stack[depth - 1:]
                item.parent = stack[-1] if stack else None
                item.depth = depth
                stack.append(item)
                branch.clear()
                open_headings.clear()
                summing.clear()
                row = (item, *subject_row(item, logical))
            else:
                first_on_page = item.group.axis not in page_axes
                page_axes.add(item.group.axis)
                if (first_on_page and item.role == 'node' and item.code is not None
                        and quirk((layout or {}).get(item.group.axis), 'repeated_at_top') is not None
                        and not any(i.group.subject and i.page == item.page for i in placed)
                        and (again := next((p for p in branch.get(item.group.axis, [])[:1] if p is not None), None)) is not None
                        and again.code == item.code and normalize(again.name) == normalize(item.name)
                        and [normalize(text(r)) for _, r in again.amounts] == [normalize(text(r)) for _, r in item.amounts]):
                    # The quirk `repeated_at_top`: the open item printed again at the top of a continuation page.
                    # Its number and amount are the open item's (a coverage exclusion), not new ones.
                    item.key, item.role = again.key, 'repeat'
                    repeated_codes.extend(g for g in item.glyphs if re.search(r'[0-9０-９]', g.text))
                    continue
                ranks = levels[item.group.axis]
                depth = 1 + min(range(len(ranks)), key=lambda i: abs(ranks[i] - item.indent)) if ranks else 1
                mode = detail if isinstance(detail, str) else detail.get(item.group.axis)
                if mode is None:
                    if strict:
                        raise ValueError(f"PDF workflow has no breakdown pattern for axis: {item.group.axis}")
                    mode = "indent"
                depth = readings[mode].depth(item, depth, shapes.setdefault(item.group.axis, []),
                                             branch.get(item.group.axis, []), anchors.setdefault(item.group.axis, {}),
                                             prepared[mode])
                if item.level is not None:
                    depth = item.level + 1  # the configured mark names a breakdown level
                elif item.unnumbered_shift:
                    depth = 1 + (min(range(len(ranks)), key=lambda i: abs(ranks[i] - item.indent)) if ranks else 0) + item.unnumbered_shift
                axis = item.group.axis
                if item.sums and item.amounts:
                    # A declared heading (`group_heads`): the items after it at its level are its, one level down,
                    # until they add up to its amount; their own items go one level down with them.
                    summing[axis] = [depth, _value(item), 0]
                elif axis in summing:
                    head_depth, total, running = summing[axis]
                    if depth > head_depth:
                        depth += 1
                    elif depth == head_depth and running != total and _value(item) is not None:
                        summing[axis][2] += _value(item)
                        depth += 1
                    else:
                        del summing[axis]
                if id(item) in closing_headings:
                    first = item.lines[0][0]  # its parts follow one level down, starting about where it does
                    open_headings[axis] = (depth, first.x0 - heading_slack(first))
                elif axis in open_headings:
                    heading_depth, heading_start = open_headings[axis]
                    if (depth < heading_depth or department_heading(item, layout)
                            or item.lines[0][0].x0 < heading_start):
                        # shallower than the heading, another department, or printed left of the heading
                        # (`3 個人番号カード交付事務経費` after `(前年度繰越明許費)`): its parts have ended
                        del open_headings[axis]
                    else:
                        depth += 1  # under the department's heading line, one level down
                open_items = branch.setdefault(item.group.axis, [])
                del open_items[depth - 1:]
                while len(open_items) < depth - 1:
                    open_items.append(open_items[-1] if open_items else None)
                parent = next((p for p in reversed(open_items) if p is not None), None)
                item.parent = parent or (stack[-1] if stack else None)
                item.depth = (parent.depth + 1) if parent is not None else 1
                open_items.append(item)
                if item.parent is None:
                    unowned.append({'kind': 'no subject parent', 'page': item.page, 'text': item.name})
            item.key = node_key(item)
            placed.append(item)
            x0, y0, x1, y1 = _bbox(item.glyphs)
            nodes.append({'node_key': item.key, 'parent_node_key': item.parent.key if item.parent else None,
                          'axis_header': item.group.axis, 'depth': item.depth,
                          'level_header': (item.level_name or (item.group.bands[item.level].header[-1]
                                                               if item.group.mode in ('bands', 'names') else None)
                                           if item.group.subject else None),
                          'code_text': item.code, 'name_text': item.name or None, 'physical_page': item.page,
                          'x0': x0, 'y0': y0, 'x1': x1, 'y1': y1})
        for logical_, ordered_, found_ in [(logical, ordered, found)]:
            for item in (i for g in ordered for i in found[id(g)]):
                if item.role not in ('node', 'repeat') or item.key is None:
                    continue
                for header, run in item.amounts:
                    marked = (layout or {}).get(item.group.axis, {}).get('yen_marked') and yen_marked(logical, run)
                    amounts.append(_amount(item.key, header, run, '円' if marked else logical.unit_of(header)))
                for label, run, heading in item.kinds:
                    remarks.append({'kind': 'kind line', 'target': item, 'heading': heading, 'label': label,
                                    'runs': [run], 'unit': logical.unit})
            present = {'／'.join(band.header) for band in logical.bands if band.kind == 'amount'}
            revisions: list[list] = []  # [item, top, bottom, page, label line] of each `補正経過` block on the page
            for header_ in [h for h in carried if h not in present]:
                drop_carried_round(carried.pop(header_))  # the column does not go on on this page
            for band in logical.bands:
                if band.kind != 'amount':
                    continue
                sign = None
                carry = carried.pop('／'.join(band.header), None)
                stacked = None  # (kind word, rule-bounded cell) of the last kind word printed in this column
                stacked_label = []  # the printed line of that kind word
                unpaid = False  # no amount has followed that kind word yet
                waiting = None  # (heading, y) of a kind word alone on its line in an inline-kind band
                previous = None  # (item, rule-bounded cell) of the last amount this column gave to an item
                stacked_lines = Counter()  # amounts a column of stacked lines (`band.lines`) gave to each item
                words_ = [_stacked_word(g) for g in band.words if g.text not in BRACKETS] if band.lines else band.words
                history = histories.pop('／'.join(band.header), None)  # [item, label lines, a round waiting] of a `補正経過`
                if history is not None:
                    revisions.append([history[0], band.body_top, band.body_top, band.words[0].page if band.words else logical.pages[0], history[1][-1] if history[1] else []])
                # A `補正経過` is printed in the subject's own columns: the amounts a breakdown axis prints in its column
                # beside the rounds (`2 給料 86,968` beside `補正経過`, 131113) are that axis's items, not rounds.
                breakdown_column = band.header[:1] and band.header[0] in {g.axis for g in ordered if not g.subject}
                for line in lines(_signed_amounts(words_)):
                    whole = normalize(text(line))
                    block = None if breakdown_column else next(
                        (b for b in revisions if b[3] == money_page(line) and b[1] - 1 <= line_middle(line) <= b[2] + 1), None)
                    if revision is not None and revision.module.opens(whole) and previous is not None:
                        # The history of the year's supplementary budgets (the quirk `revision_history`).
                        history = [previous[0], [], False]  # the item, its label lines, a round waiting for its amount
                        revisions.append([previous[0], line_middle(line), line_middle(line), money_page(line), []])
                        continue
                    if history is not None and (REVISION_LABEL.fullmatch(whole) or whole.strip('()') == '計'):
                        history[1].append(line)
                        history[2] = True
                        revisions[-1][2] = line_middle(line)
                        revisions[-1][4] = line
                        continue
                    waiting_round = history is not None and history[2]
                    bare = whole.strip('()')
                    if (PAREN_AMOUNT.fullmatch(whole) or is_amount(whole)) and (waiting_round or (
                            history is None and block is not None)):
                        # The amount of a round, or the total after the rounds (also set against `計` in the comparison
                        # column, `(△373,227)`): a note labelled with the round's words, of the history's kind otherwise.
                        target, label = (history[0], history[1][-1]) if history is not None else (block[0], block[4])
                        run = [Glyph(bare, min(g.x0 for g in line), min(g.y0 for g in line), max(g.x1 for g in line),
                                     max(g.y1 for g in line), line[0].page, line[0].offset)]
                        heading = '／'.join(band.header)
                        word = normalize(text(label)) or REVISION_HISTORY
                        annotations.append((target, f'{heading}／注記／{word}', run, logical.unit_of(heading)))
                        remarks.append({'kind': 'annotation', 'target': target, 'heading': None, 'hint': REVISION_HISTORY,
                                        'label': list(label), 'runs': [run], 'unit': logical.unit_of(heading)})
                        if history is not None:
                            revisions[-1][2] = line_middle(line)
                            history[2] = False  # the round is paid: the next line is a round or `計`
                            if normalize(text(label)).strip('()') == '計':
                                history = None  # the total closes the history
                        continue
                    if history is not None:
                        history = None  # the next amount of the column closes the history
                    printed = {}  # the amount of a word that runs on into text, by the word it was cut from
                    cut = [_leading_amount(g) for g in line]
                    printed.update({id(new): old for new, old in zip(cut, line)})
                    line = cut
                    heading = round_heading(line)
                    money = [g for g in line[len(heading):] if is_amount(g.text) or re.fullmatch(r'[0-9,△▲\-]+', g.text)]
                    if heading and money:
                        # `第` `２` `次補正` set apart: the round's number is no amount, and the heading names the amount
                        # printed after it on the same line. (A heading alone on its line names the amount below it.)
                        if unpaid and SUPPLEMENT_ROUND.fullmatch(stacked[0]):
                            unpaid_rounds.extend(stacked_label)
                        cell = _cell(band, sum((g.y0 + g.y1) / 2 for g in heading) / len(heading))
                        stacked = (normalize(text(heading)), cell)
                        stacked_label = heading
                        unpaid = True
                    if [g.text for g in money] in (['△'], ['▲']):
                        sign = money[0]  # a minus sign printed above its number
                        continue
                    if not money:
                        if band.inline and line and kind_heading(normalize(text(line)), band.header[-1]) is not None:
                            # A kind word that fills its line (`継続費及び繰越事業費繰越額`): its amount is the next line's.
                            waiting = (kind_heading(normalize(text(line)), band.header[-1]), sum((g.y0 + g.y1) / 2 for g in line) / len(line))
                            continue
                        # A kind word inside an amount cell (`継続費逓次繰越` / `73,871,000` / `繰越明許費` /
                        # `102,288,855`): the amount printed below it, in the same cell, carries it (132241).
                        word = normalize(text(line))
                        if line and STACKED_KIND.fullmatch(word):
                            cell = _cell(band, sum((g.y0 + g.y1) / 2 for g in line) / len(line))
                            if unpaid and SUPPLEMENT_ROUND.fullmatch(stacked[0]):
                                unpaid_rounds.extend(stacked_label)
                            # A round of a supplementary budget is unambiguous: it counts without a second amount in a cell.
                            stacked = (word, cell) if '／'.join(band.header) in stacking or SUPPLEMENT_ROUND.fullmatch(word) else None
                            stacked_label = line
                            unpaid = stacked is not None
                        continue
                    if sign is not None and money[0].y0 - sign.y0 < 14 and not money[0].text.startswith(('△', '▲')):
                        money = [sign] + money
                    sign = None
                    candidate = ''.join(g.text for g in money)
                    if not is_amount(candidate):
                        unowned.append({'kind': 'unreadable amount', 'page': money[0].page, 'text': candidate}); continue
                    target = owner(money, band, ordered, found, owners, ocr=logical.ocr, next_row=amounts_next_row,
                                   name_line=name_lines)
                    if (target is None and amounts_next_row and waiting_subject is not None
                            and _cell(band, money[0].y0)[0] == band.body_top
                            and not any(i.role == 'node' and i.anchor < money[0].y0
                                        for g in ordered if g.subject for i in found[id(g)])):
                        # The amounts row of the item that ends the page before opens this page.
                        target = waiting_subject
                    if (target is None and band.lines and previous is not None
                            and stacked_lines[previous[0].key] < len(band.lines)
                            and previous[1] == _cell(band, sum((g.y0 + g.y1) / 2 for g in money) / len(money))):
                        # A stacked line below the item's name (`(36,524)` under a 目 named on one line): the
                        # cell's item, while it has a heading left.
                        target = previous[0]
                    if target is None and stacked is not None and previous is not None:
                        # `事故繰越` / `19,968,000` printed two lines below its 節 under `31,321,000`: the amount
                        # under a kind word, in the same cell as the amount above it, belongs to that amount's item.
                        cell = _cell(band, sum((g.y0 + g.y1) / 2 for g in money) / len(money))
                        if stacked[1] == cell and previous[1] == cell:
                            target = previous[0]
                    if target is None and carry is not None and _cell(band, money[0].y0)[0] == band.body_top:
                        # `繰越明許費` at the foot of a page, its amount in the first row of the next page's column
                        # (a row that prints nothing else): the cell runs on over the page break.
                        # A cell that runs on with its kind word printed on the next page (`第５次補正` / `△56,880,000`
                        # in the first row) is the open item's too.
                        cell = _cell(band, money[0].y0)
                        if stacked is not None and stacked[1] == cell:
                            # Another kind word opens this cell: the one carried over was never paid.
                            drop_carried_round(carry)
                            target = carry[0]
                        elif carry[1] is not None:
                            if unpaid and SUPPLEMENT_ROUND.fullmatch(stacked[0]):
                                unpaid_rounds.extend(stacked_label)  # a round of an earlier cell, never paid
                            target, stacked, stacked_label = carry[0], (carry[1], cell), carry[2]
                            unpaid = False
                    elif carry is not None:
                        drop_carried_round(carry)  # not at the top of the page: the cell did not run on
                    carry = None
                    if target is not None and target.role == 'total':
                        notes.append({'kind': 'total amount', 'page': money[0].page, 'text': candidate,
                                      'header': '／'.join(band.header), 'unit': logical.unit_of('／'.join(band.header)), 'label': target.name,
                                      'box': _bbox([printed.get(id(g), g) for g in money])})
                        continue
                    if target is None or target.key is None:
                        record = {'kind': 'amount without row', 'page': money[0].page, 'text': candidate,
                                  'header': '／'.join(band.header)}
                        unowned.append(record)
                        centre = sum((g.y0 + g.y1) / 2 for g in money) / len(money)
                        if stacked is None or stacked[1] != _cell(band, centre):  # a kind word names it otherwise
                            unowned_runs.append((record, money))
                        continue
                    header = '／'.join(band.header)
                    if band.inline:
                        word = normalize(''.join(g.text for g in line if g not in money and g.text not in SIGNS))
                        kind = kind_heading(word, band.header[-1]) if word else None
                        if kind is None and band.inline_free and word:
                            kind = word  # declared inline: the printed word is the last word of the heading
                        if kind is None and not word and waiting is not None \
                                and 0 < sum((g.y0 + g.y1) / 2 for g in money) / len(money) - waiting[1] <= 2.2 * (money[0].y1 - money[0].y0):
                            kind = waiting[0]
                        waiting = None
                        if kind is None:
                            unowned.append({'kind': 'amount without kind', 'page': money[0].page, 'text': candidate,
                                            'header': header})
                            continue
                        header = '／'.join((band.header if band.inline_free else band.header[:-1]) + (kind,))
                    if band.lines:
                        index = stacked_lines[target.key]
                        name = target.lines[0][0] if target.lines and target.lines[0] else None
                        if name is not None and name.page == money[0].page:
                            # The line the amount stands on below the item's name: a line left blank or printed as a
                            # dash (`41,589` / `-` / `41,589`) keeps the lines under it in their headings.
                            step = band.line_pitch or .82 * (name.y1 - name.y0)
                            middle = sum((g.y0 + g.y1) / 2 for g in money) / len(money)
                            if index < len(band.lines):
                                index = min(max(index, round((middle - (name.y0 + name.y1) / 2) / step)), len(band.lines) - 1)
                        stacked_lines[target.key] = index + 1
                        if index >= len(band.lines):
                            unowned.append({'kind': 'amount past the stacked lines', 'page': money[0].page,
                                            'text': candidate, 'header': header})
                            continue
                        header = '／'.join(band.header[:-1] + (band.lines[index],))
                    y = sum((g.y0 + g.y1) / 2 for g in money) / len(money)
                    if unpaid and stacked[1] != _cell(band, y) and SUPPLEMENT_ROUND.fullmatch(stacked[0]):
                        unpaid_rounds.extend(stacked_label)  # the cell ended without an amount for it
                        unpaid = False
                    if stacked is not None and stacked[1] == _cell(band, y):
                        header = f'{header}／{stacked[0]}'
                        unpaid = False
                        if SUPPLEMENT_ROUND.fullmatch(stacked[0]):
                            # How a supplementary budget moved the amount, round by round: a note of the item, no
                            # amount of its own (the column's total is the sum).
                            remarks.append({'kind': 'kind line', 'target': target, 'heading': header, 'label': stacked_label,
                                            'runs': [money], 'unit': logical.unit_of(header)})
                    amounts.append(_amount(target.key, header, money, logical.unit_of(header)))
                    if target.role == 'repeat' and not target.group.subject:
                        repeated_codes.extend(money)  # the open item's amount printed again (`repeated_at_top`)
                    owned.add(target.key)
                    previous = (target, _cell(band, y))
                if history is not None:
                    histories['／'.join(band.header)] = history  # the history goes on at the top of the next page
                drop_carried_round(carry)  # no amount line in this column at all
                if unpaid and previous is not None and stacked[1] == previous[1]:
                    carried['／'.join(band.header)] = (previous[0], stacked[0], stacked_label)
                else:
                    # The kind word is not carried over the page break: nothing follows it.
                    if unpaid and SUPPLEMENT_ROUND.fullmatch(stacked[0]):
                        unpaid_rounds.extend(stacked_label)
                    if previous is not None and previous[1][1] >= band.body_bottom - .5:
                        # The cell at the foot may run on: its kind word, printed again on the next page, is the item's.
                        carried['／'.join(band.header)] = (previous[0], None, [])
            if amounts_next_row:
                subjects = [i for g in ordered if g.subject for i in found[id(g)] if i.role == 'node' and i.key is not None]
                last = max(subjects, key=lambda i: i.anchor, default=None)
                waiting_subject = last if last is not None and last.key not in owned and not last.amounts else None
    for entry in carried.values():
        drop_carried_round(entry)  # the document ends with a round no amount follows
    for target, header, run, unit in annotations:
        amounts.append(_amount(target.key, header, run, unit))
    marked = []
    for remark in remarks:
        # The account a note belongs to: a remark's own target, or the item's nearest account ancestor.
        cursor = remark['target']
        while cursor is not None and not cursor.group.subject:
            cursor = cursor.parent
        if cursor is None or cursor.key is None or remark['target'].key is None:
            continue
        marked.append({'kind': remark['kind'], 'node_key': remark['target'].key, 'parent_node_key': cursor.key,
                       'heading': remark['heading'], 'label': remark['label'], 'runs': remark['runs'],
                       'unit': remark['unit'], 'hint': remark.get('hint')})
    nest_by_rows(nodes, placed, layout)
    repeated_amounts = repeated_parent_rows(nodes, amounts, unowned, unowned_runs)
    return Built(nodes, _dedupe(amounts, unowned), unowned, notes, marked, skipped, repeated_codes, repeated_amounts, unpaid_rounds)


def nest_by_rows(nodes: list[dict], placed: list[Item], layout: dict | None) -> None:
    """The axes that select the quirk `under`: their items nest under the item of the named axis in their ruled row."""
    for axis, hints in (layout or {}).items():
        if (under := quirk(hints, 'under')) is not None:
            under.module.nest(nodes, placed, axis, under.value)


def judged_roles(judge, group: Group, margins: set[int] | None) -> dict[int, str]:
    """Features of each printed line for a judgment: text, indentation and amount column in characters."""
    entries = entries_of(group, margins)
    labelled = [e for e in entries if e[0]]
    if not labelled:
        return {}
    heights = sorted(g.y1 - g.y0 for e in labelled for g in e[0])
    char = heights[len(heights) // 2] or 9
    left = min(e[0][0].x0 for e in labelled)
    right = group.bands[-1].x1
    features = []
    for index, (label, money, code, name) in enumerate(entries):
        if not label:
            continue
        features.append({'id': f'L{index}', 'text': normalize(text(label)), 'code': code,
                         'indent': round((label[0].x0 - left) / char),
                         'amount': normalize(text(money[-1])) if money else None,
                         'amount_inset': round((right - money[-1][-1].x1) / char) if money else None})
    return {int(key[1:]): role for key, (role, _) in judge(features).items()}


def within_row(logical: Logical, previous: Item, item: Item) -> bool:
    """The item's lines lie in the rule-bounded row of the amount column next to the subject columns (the
    subject's own amounts: a 節 column further right rules a row for each 節)."""
    edge = max(b.x1 for b in previous.group.bands)
    y = previous.anchor
    beside = [b for b in logical.bands if b.kind == 'amount' and b.x0 >= edge - 3 and b.body_top < y < b.body_bottom]
    if not beside:
        return False
    top, bottom = _cell(min(beside, key=lambda b: b.x0), y)
    return item.y0 >= previous.y1 and top - .5 <= item.y0 and item.y1 <= bottom + .5


def subject_row(item: Item, logical: Logical) -> tuple[float, float]:
    """The narrowest rule-bounded row around a subject label among the amount bands whose body
    holds the label's height. (The other half of a spread may still be in its taller header at
    that height and would give a cell of no height, 132276.)"""
    y = item.anchor
    cells = [_cell(b, y) for b in logical.bands if b.kind == 'amount' and b.body_top < y < b.body_bottom]
    cells = [c for c in cells if c[1] - c[0] <= 80]
    return min(cells, key=lambda c: c[1] - c[0]) if cells else (y - 4, y + 4)


def _bbox(glyphs: list[Glyph]) -> tuple[float, float, float, float]:
    boxes = [g.original for g in glyphs]
    return (min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes))


def header_phase(header: str) -> str | None:
    """The amount phase of the longest suffix of a printed header path that the shared dictionary knows."""
    parts = header.split('／')
    for start in range(len(parts)):
        phase = amount_phase('／'.join(parts[start:]), 'settlement', '科目', None)
        if phase:
            return phase
    return None


def repeated_parent_rows(nodes: list[dict], amounts: list[dict], unowned: list[dict],
                         runs: list[tuple[dict, list[Glyph]]]) -> list[Glyph]:
    """The unowned amount rows that print the amounts of the account row above them again.

    A row has no name and no row of its own, and each of its printed amounts is equal, to the yen and in the
    same column (or a column of the same amount phase: a 節 column's `金額` and the account's `計` both
    stand for the 予算現額), to the amount of the nearest 款・項・目 row above it on the page. One amount that differs keeps
    the whole row unowned (the check stops). The row is recorded, not dropped: its glyphs become an excluded
    region of kind `親の繰り返し`.
    """
    if not runs:
        return []
    subject = {n['node_key'] for n in nodes if n['axis_header'] == '科目'}
    rows: dict[tuple, list] = defaultdict(list)
    for record, run in runs:
        x0, y0, x1, y1 = _bbox(run)
        rows[record['page'], round((y0 + y1) / 2)].append((record, run, y0))
    repeated: list[Glyph] = []
    for (page, _), row in rows.items():
        matched = []
        for record, run, y0 in row:
            phase = header_phase(record['header'])
            above = [a for a in amounts if a['node_key'] in subject and a['physical_page'] == page
                     and (a['header_path'] == record['header']
                          or (phase is not None and header_phase(a['header_path']) == phase))
                     and a['y1'] is not None and a['y1'] <= y0 + 1]
            nearest = max(above, key=lambda a: a['y1'], default=None)
            same = nearest is not None and normalize(nearest['amount_text']) == normalize(record['text'])
            matched.append(same)
        if all(matched):
            for record, run, _ in row:
                repeated += run
                unowned.remove(record)
    return repeated


def yen_marked(logical: Logical, run: list[Glyph]) -> bool:
    """The amount prints 円 after it (`46.4円 × 1,115,000件 ＝ 51,736,000円`, touching it or set apart) in a column of
    another unit: a reckoning in yen inside a column of 千円 (`yen_marked`). `_split_line` takes the 円 off the run."""
    last = run[-1]
    middle = (last.y0 + last.y1) / 2
    for band in logical.bands:
        for glyph in band.words:
            if glyph.page != last.page or abs((glyph.y0 + glyph.y1) / 2 - middle) > 1.5:
                continue
            shown = normalize(glyph.text)
            if shown.endswith('円') and abs(glyph.x0 - last.x0) <= .5 and shown[:-1].endswith(normalize(last.text)):
                return True
            if shown == '円' and 0 <= glyph.x0 - last.x1 <= 3:
                return True
    return False


def _amount(key: str, header: str, run: list[Glyph], unit: str | None) -> dict:
    x0, y0, x1, y1 = _bbox(run)
    return {'node_key': key, 'header_path': header, 'amount_text': ''.join(g.text for g in run),
            'unit_text': unit, 'physical_page': run[0].page, 'x0': x0, 'y0': y0, 'x1': x1, 'y1': y1}


def _dedupe(amounts: list[dict], unowned: list[dict]) -> list[dict]:
    """A repeated subject heading reprints its amounts; keep one, flag differences."""
    seen: dict[tuple, dict] = {}
    for amount in amounts:
        identity = (amount['node_key'], amount['header_path'])
        if identity in seen:
            if normalize(seen[identity]['amount_text']) != normalize(amount['amount_text']):
                unowned.append({'kind': 'conflicting amount', 'page': amount['physical_page'],
                                'text': f"{seen[identity]['amount_text']} / {amount['amount_text']}",
                                'header': amount['header_path'],
                                'sources': [{k: source[k] for k in ('physical_page', 'amount_text', 'unit_text',
                                                                   'x0', 'y0', 'x1', 'y1')}
                                            for source in (seen[identity], amount)]})
            continue
        seen[identity] = amount
    return list(seen.values())
