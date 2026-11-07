"""Rows of a 事業別決算説明書 (the layout setting `explained_projects`).

131211 prints its 決算 by 事務事業 on facing pages. The left page has the 款・項・目 and 事務事業 rows with
予算現額 and 決算額; the right page explains them. Under each 事務事業 the left page prints:

- a total row (`1 区議会運営事務`) and, at the same indent, a row per department that spent it, with the department on
  a wrapped second line (`1 区議会運営事務` / `(政策経営部)`). The department rows are parts of the total;
- under a department, its 細事業 (`(1) 議員報酬事務`);
- in the 決算 column, left of the amount, a copy of the row's own code (`1`, `(2)`), and the items of the
  explanation on the facing page (`ア` `イ` `(ア)`): a code and an amount with no name on the left page;
- at the end of a department or 細事業, a bare amount: its 不用額 (予算現額 less 決算額).

The words are rearranged before the columns are read (`arrange`): a code copy beside a named row is taken out, an
item's code is moved into the name column one step deeper than the row it explains, a department row and its
second line move half a step right so the department is a child of the total, and a bare amount equal to the
予算現額 less the 決算額 of the row above is taken out as that row's 不用額. After the reading, the items are put on
their own axis (`items_axis`): they print only a 決算額, which is compared with the row's 決算額 alone.
"""
from __future__ import annotations

from dataclasses import dataclass, replace
import re

from ingestion.generic.layout import normalize
from ingestion.generic.observe import Page, Word

# The codes of the items: the katakana in their order (no voiced or small kana).
KANA = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン'
CODE = re.compile(rf'^(?:[0-9]+|[(（][0-9]+[)）]|[{KANA}]|[(（][{KANA}][)）]|[a-zA-Z]|[(（][a-zA-Z][)）])$')
# The items step down ア, (ア), a, (a) (131211's 扶助費 prints all four).
ITEM_LEVELS = (re.compile(rf'^[{KANA}]$'), re.compile(rf'^\([{KANA}]\)$'), re.compile(r'^[a-z]$'), re.compile(r'^\([a-z]\)$'))
ITEM = re.compile(rf'^(?:[{KANA}]|[(（][{KANA}][)）]|[a-zA-Z]|[(（][a-zA-Z][)）])$')
SUB_PROJECT = re.compile(r'^[(（][0-9]+[)）]')
DEPARTMENT = re.compile(r'^[(（][^()（）]+[)）]$')
# The part of a row's 予算現額 carried over from the year before, on a line of its own under the row:
# `(令和5年度繰越明許費分 5,100,000 円)`, `(令和5年度事故繰越し分 867,000円)`.
CARRIED = re.compile(r'^[(（](令和[0-9]+年度(?:繰越明許費|事故繰越し)分)\s*(△?[0-9]{1,3}(?:,[0-9]{3})*)\s*円[)）]$')
AMOUNT = re.compile(r'^△?[0-9]{1,3}(?:,[0-9]{3})*円?$')
# A department row moves one step (a character and a bit) right of its total, and a 細事業 one step right of it.
STEP = 12.0
SAME_LINE = 4.0
CONTINUED = -1  # the owner of an item under a row the volume before opened


@dataclass
class Moved:
    """A word taken out of the page, with why (a coverage exclusion or a 不用額)."""
    page: int
    word: Word
    kind: str  # 'code copy' | 'unused' | 'carried' (from the year before) | 'forward' (to the next) | 'explanation'
    # | 'misread code' (an item's イ read as 1)
    owner: tuple[int, float] | None = None  # the row (its page and y) the 不用額 belongs to
    value: int | None = None


@dataclass
class Item:
    """An item of the explanation: its code and amount on the left page, its name from the facing page."""
    page: int
    code: str
    name: str | None
    box: tuple[float, float, float, float]
    amount: str
    amount_box: tuple[float, float, float, float]
    owner: tuple[int, float]  # the page and y of the named row it explains


def _box(words: list[Word]) -> tuple[float, float, float, float]:
    return min(w.x0 for w in words), min(w.y0 for w in words), max(w.x1 for w in words), max(w.y1 for w in words)


# Katakana codes OCR reads as the kanji or katakana of the same shape (`工` for エ, `力` for カ).
KANA_SHAPES = str.maketrans({'工': 'エ', '才': 'オ', '力': 'カ', '夕': 'タ', '卜': 'ト', '二': 'ニ', '八': 'ハ',
                             '口': 'ロ', '已': 'コ', '千': 'チ', '牛': 'キ', '七': 'セ'})
# Kanji OCR reads in another form in one of the two rows (大気污染 for 大気汚染); compared only, never written.
KEY_VARIANTS = str.maketrans({'污': '汚'})
KANA_SHAPES_FROM = ('工', '才', '力', '夕', '卜', '二', '八', '口', '已', '千', '牛')


def _code(text: str) -> str:
    text = normalize(text).replace('（', '(').replace('）', ')')
    if len(text.strip('()')) != 1:
        return text
    return text.translate(KANA_SHAPES).lower()  # an item `c` OCR reads as `C`


def _value(text: str) -> int | None:
    text = normalize(text).replace('円', '')
    if not AMOUNT.match(text + '円'):
        return None
    return -int(text[1:].replace(',', '')) if text.startswith('△') else int(text.replace(',', ''))


def _lines(words: list[Word]) -> list[list[Word]]:
    lines: list[list[Word]] = []
    for word in sorted(words, key=lambda w: ((w.y0 + w.y1) / 2, w.x0)):
        middle = (word.y0 + word.y1) / 2
        if lines and abs((lines[-1][0].y0 + lines[-1][0].y1) / 2 - middle) <= SAME_LINE:
            lines[-1].append(word)
        else:
            lines.append([word])
    return [sorted(line, key=lambda w: w.x0) for line in lines]


def _heading(page: Page, text: str, after: float = 0.0) -> tuple[float, float, float] | None:
    """The x extent and bottom of a heading printed on one line, its characters spaced out as separate words
    (`予 算 現 額`)."""
    for line in _lines(page.words):
        chars = [(c, w) for w in line if w.x0 >= after for c in normalize(w.text).replace(' ', '')]
        joined = ''.join(c for c, _ in chars)
        start = joined.find(text)
        if start >= 0:
            span = [w for _, w in chars[start:start + len(text)]]
            return span[0].x0, span[-1].x1, max(w.y1 for w in span)
    return None


def _edges(page: Page, setting: dict) -> tuple[float, float, float, float, float] | None:
    """The left rule of the deepest name column (事務事業), of the budget column, of the 決算 column, the frame's right rule and the header's bottom,
    when the page prints the budget heading (the left page of a spread)."""
    budget = _heading(page, setting['budget'])
    settled = _heading(page, setting['settled'], budget[1]) if budget else None
    if budget is None or settled is None:
        return None
    verticals = sorted({round(r.x0, 1) for r in page.rules if r.x0 == r.x1 and r.y0 < budget[2] < r.y1 + 40})
    left = max((x for x in verticals if x < budget[0]), default=None)
    middle = max((x for x in verticals if budget[1] < x < settled[0]), default=None)
    right = min((x for x in verticals if x > settled[1]), default=None)
    if left is None or middle is None or right is None:
        return None
    inner = max((r.x0 for r in page.rules if r.x0 == r.x1 and r.x0 < left - 20 and r.y1 - r.y0 > 40), default=0.0)
    return inner, left, middle, right, max(budget[2], settled[2])


# A row's line on the facing page starts left of its items' codes (rows at 79-93pt, codes at 104, the explanation's
# own lines, `1年生～6年生…`, at 120 and right).
HEAD_X = 100.0
CODE_X = 118.0  # a katakana item code stands at 104-111pt (a latin one at 123)
ITEM_LINE = re.compile(rf'^([(（][{KANA}][)）]|[{KANA}]|[(（][a-zA-Z][)）](?=\s*[^\x00-\x7f]|$)|[a-zA-Z](?=\s*[^\x00-\x7f]|$))\s*(.*)$')
NAME_GAP = 15.0


def _section(text: str, department: str | None) -> tuple[str, str, str | None] | None:
    """The key of a 事務事業 row to find its explanation on the facing page: its code, the start of its name and its
    department (`('4', '報道事務', '(政策経営部)')`)."""
    found = LEADING_CODE.match(text)
    if not found:
        return None
    code = found.group(1).replace('（', '(').replace('）', ')')
    name = _key(text[found.end():])
    if not name or not re.match(r'[^0-9,円%]', name):
        return None
    return code, name[:8], _key(department).replace('（', '(').replace('）', ')') if department else None


def explained_items(page: Page) -> list[dict]:
    """The items of the explanation on a right page, in order: code and name (`イ 新年名刺交換会設営委託`; OCR may
    run the code into the name, `ウファイリング…`), and the 事務事業 row they explain (`section`, the last row named
    above them). The name ends at a wide gap (a count `42人` follows)."""
    items, section, headed, uncoded = [], None, False, []
    lines = _lines(page.words)
    for index, line in enumerate(lines):
        if len(line) > 1 and re.fullmatch(r'[(（][a-zA-Z]', line[0].text) and line[1].text[:1] in ')）':
            # OCR splits a bracketed code from its closing bracket: `（a` `）生活費`
            line = [replace(line[0], text=line[0].text + line[1].text[0], x1=line[1].x0 + 4),
                    replace(line[1], text=line[1].text[1:])] + line[2:]
        first = normalize(line[0].text)
        bare = first.strip('()（）')
        if bare and bare[0] in '工才力夕卜二八口' and (len(bare) == 1 or first.startswith(('(', '（')) or bare[1:2] in ' 　'):
            first = first.replace(bare[0], bare[0].translate(KANA_SHAPES), 1)
        found = ITEM_LINE.match(first)
        if found and line[0].x0 >= CODE_X and not found.group(1).isascii():
            found = None  # a line of the explanation that starts with a katakana word
        if not found:
            text = normalize(''.join(w.text for w in line))
            if headed and CODE_X <= line[0].x0 < CODE_X + 9 and re.match(r'[^0-9①-⑳主]', text):
                uncoded.append((len(items), section, _item_name(line)))  # an item whose code OCR left unread
            if not headed:  # the account (`01 一般会計`) and the column heads above the explanation
                headed = '執行率' in text
            elif '%' not in text and line[0].x0 < HEAD_X and (key := _section(text, None)):
                second = normalize(''.join(w.text for w in lines[index + 1])) if index + 1 < len(lines) else ''
                department = DEPARTMENT.match(second) and not CARRIED.match(second)
                section = key[:2] + ((_section(text, second) or key)[2] if department else None,)
            continue
        name, end = found.group(2), line[0].x1
        for word in line[1:]:
            if word.x0 - end > NAME_GAP:
                break
            name, end = name + normalize(word.text), word.x1
        if name:
            items.append({'section': section, 'code': normalize(found.group(1)).replace('（', '(').replace('）', ')').lower(),
                          'name': name, 'used': False})
    return _uncoded(items, uncoded)


def _item_name(line: list[Word]) -> str:
    name, end = normalize(line[0].text), line[0].x1
    for word in line[1:]:
        if word.x0 - end > NAME_GAP:
            break
        name, end = name + normalize(word.text), word.x1
    return name


def _uncoded(items: list[dict], uncoded: list[tuple[int, object, str]]) -> list[dict]:
    """The items with those whose code OCR left unread put back: a line where an item's name starts, alone between
    two items of its row whose codes skip one (ア, a line, ウ), is the item of the skipped code."""
    for index, section, name in reversed(uncoded):
        if not 0 < index < len(items):
            continue
        before, after = items[index - 1], items[index]
        if before['section'] != section or after['section'] != section:
            continue
        if sum(1 for i, _, _ in uncoded if i == index) != 1:
            continue
        a, b = before['code'], after['code']
        if a in KANA and b in KANA and KANA.index(b) - KANA.index(a) == 2:
            items.insert(index, {'section': section, 'code': KANA[KANA.index(a) + 1], 'name': name, 'used': False})
    return items


def _same(right, left) -> bool:
    """One row on both pages: the same code and department, and names that differ by at most one character (OCR
    reads 妊娠高血圧 on one page and 妊娠高血压 on the other, or drops one)."""
    if right is None or left is None or right[0] != left[0] or right[2] != left[2]:
        return False
    a, b = right[1], left[1]
    if a == b or (len(a) == len(b) and sum(x != y for x, y in zip(a, b)) <= 1):
        return True
    # one character dropped on one page (鹿浜いきき館 for 鹿浜いきいき館); the keys are the names' first characters
    return any((x[:i] + x[i + 1:]) == y[:len(x) - 1] for x, y in ((a, b), (b, a)) for i in range(len(x)))


def _name(lists: list[list[dict]], section, code: str, later: list[list[dict]] | None = None) -> str | None:
    """The name of an item from the explanations (the owner's facing page first): the next unused item with its code
    in the explanation of its row, or, when no explanation names the row, the next with its code among the next
    three unused that no row heads at the top of a facing page after the row's own (`later`: an explanation that
    runs on to the next spread)."""
    pending = False  # the row's explanation still has items to come: it did not run on
    for entries in lists:
        open_ = [e for e in entries if not e['used'] and _same(e['section'], section)]
        if section is not None and open_:
            found = next((i for i, e in enumerate(open_) if e['code'] == code), None)
            if found is None:
                pending = True
                continue
            for e in open_[:found + 1]:
                e['used'] = True
            return open_[found]['name']
    if pending:
        return None
    open_ = [e for entries in (lists if later is None else later) for e in entries if not e['used'] and e['section'] is None]
    found = next((i for i, e in enumerate(open_[:3]) if e['code'] == code), None)
    if found is None:
        return None
    for e in open_[:found + 1]:
        e['used'] = True
    return open_[found]['name']


LEADING_CODE = re.compile(r'^([0-9]+|[(（][0-9]+[)）])\s*')
# Where a name starts after its code, from the start of the row (`1 区議会運営事務`).
NAME_OFFSET = 10.0


def _key(text: str) -> str:
    """A row's text to compare a department row with its total: OCR reads the long vowel mark of one as 一, and a
    katakana next to katakana as the kanji of the same shape in one of them (創工ネ for 創エネ, 防犯力メラ)."""
    text = re.sub(r'(?<=[ァ-ヶ])[一－-]', 'ー', text.replace(' ', '')).translate(KEY_VARIANTS)
    shapes = ''.join(KANA_SHAPES_FROM)
    while (found := re.sub(rf'[{shapes}](?=[ァ-ヶー])|(?<=[ァ-ヶー])[{shapes}]',
                           lambda m: m.group(0).translate(KANA_SHAPES), text)) != text:
        text = found
    return text


def _relabel(label: list[Word], text: str, name_x: float) -> tuple[list[Word], float]:
    """The row's label as its code and its name, the name starting at `name_x` (the indentation of its level), and
    how far the name moved."""
    found = LEADING_CODE.match(text)
    top, bottom = min(w.y0 for w in label), max(w.y1 for w in label)
    name = text[found.end():] if found else text
    words = []
    if found:
        code = found.group(1)
        words.append(Word(code, name_x - 3 - 5 * len(code), top, name_x - 3, bottom))
    words.append(Word(name, name_x, top, name_x + max(label[-1].x1 - label[0].x0, 9 * len(name)), bottom))
    return words, name_x - (label[0].x0 + NAME_OFFSET)


def arrange(pages: list[Page], setting: dict, continued: list[dict] | None = None
            ) -> tuple[list[Page], list[Moved], list[Item], dict[tuple[int, int], int]]:
    """The pages with the words rearranged (see the module), the words taken out, the items, and the level of each
    事務事業 row (0 a total, 1 a department, 2 a 細事業) by its page and top. `continued` are the rows of a 事務事業
    a volume continues from the volume before it (see `continue_rows`)."""
    result, moved, items, levels = [], [], [], {}
    lefts = {page.number for page in pages if _edges(page, setting) is not None}
    by_number = {page.number: page for page in pages}
    names = {number: explained_items(by_number[number + 1]) for number in lefts
             if number + 1 in by_number and number + 1 not in lefts}
    totals: dict[str, float | None] = {}  # the text of a total row and its indent (None: any), kept across pages
    last_named: tuple[float, int, float] | None = None  # indent, page and y of the last named row
    last_budget: tuple[int, float, int, int | None] | None = None  # the page and y of the last row with a 予算現額
    department_x: float | None = None  # set while a department row is open
    last_section = None  # the key of the last named row, to find its explanation
    base = 0.0  # where the open total row starts
    for row in continued or ():  # the rows opened in the volume before: its first rows are their parts
        text = row['code'] + row['name']
        if 'department' in row:
            department_x = 0.0
            last_section = _section(text, f'({row["department"]})')
        elif SUB_PROJECT.match(row['code']):
            last_section = _section(text, None)
        else:
            totals[_key(text)] = None
            department_x, last_section = None, _section(text, None)
        last_named = (CONTINUED, 0.0, 0.0)
    for page in pages:
        edges = _edges(page, setting)
        if edges is None:
            if page.number - 1 in names:  # the facing page: its explanation named the items; nothing else is read
                moved += [Moved(page.number, w, 'explanation') for w in page.words]
                result.append(replace(page, words=[]))
            else:
                result.append(page)
            continue
        inner, left, middle, right, header_bottom = edges
        body = [w for w in page.words if w.y0 > header_bottom + 2]
        keep = [w for w in page.words if w.y0 <= header_bottom + 2]
        title = _heading(page, setting['title']) if setting.get('title') else None
        if title is not None:  # a title over the name and budget columns (`予 算 説 明`) heads no amount
            keep = [w for w in keep if not (abs(w.y1 - title[2]) < 3 and title[0] - 1 <= w.x0 and w.x1 <= title[1] + 1)]
        lines = _lines(body)
        delta = 0.0  # how far the last named row moved: its wrapped lines (the department) move with it
        for index, line in enumerate(lines):
            label = [w for w in line if (w.x0 + w.x1) / 2 < left]
            budget = [w for w in line if left <= (w.x0 + w.x1) / 2 < middle]
            column = [w for w in line if middle <= (w.x0 + w.x1) / 2 < right]
            codes = [w for w in column if CODE.match(_code(w.text)) and w.x1 < middle + (right - middle) * .3]
            amounts = [w for w in column if w not in codes]
            outside = [w for w in line if w not in label and w not in budget and w not in column]
            settled_value = _value(''.join(w.text for w in amounts)) if amounts else None
            if label:
                text = normalize(''.join(w.text for w in label))
                x = label[0].x0
                if codes:
                    moved += [Moved(page.number, w, 'code copy') for w in codes]
                if not budget and not amounts and not codes:  # a wrapped line of the row above
                    if CARRIED.match(text) and last_named is not None and last_named[0] != CONTINUED:
                        moved += [Moved(page.number, w, 'carried', (last_named[1], last_named[2])) for w in label]
                        keep += outside
                        continue
                    keep += [replace(w, x0=w.x0 + delta, x1=w.x1 + delta) for w in label] + outside
                    continue
                if x < inner - 6:  # a 款・項・目 row (a 事務事業's code of two digits stands out left of its column)
                    department_x = None
                    if any(w.x0 >= inner - 1 for w in label):  # its name runs past the column's rule: one word
                        label = [Word(text, label[0].x0, min(w.y0 for w in label), label[-1].x1, max(w.y1 for w in label))]
                    keep += label + budget + amounts + outside
                    delta = 0.0
                    continue
                # The lines below that only continue the label: the rest of a wrapped name, then the department.
                full, department = text, None
                for following in lines[index + 1:]:
                    if any(left <= (w.x0 + w.x1) / 2 for w in following):
                        break
                    second = normalize(''.join(w.text for w in following if (w.x0 + w.x1) / 2 < left))
                    if CARRIED.match(second):  # the carried-over part of the budget, a note of the row
                        continue
                    if DEPARTMENT.match(second):
                        department = second
                        break
                    if not second or LEADING_CODE.match(second):
                        break
                    full += second
                if department is not None and _key(full) in totals and (totals[_key(full)] is None or abs(totals[_key(full)] - x) <= 8):
                    level = 1
                elif department_x is not None and SUB_PROJECT.match(text):
                    level = 2
                else:
                    level, department_x = 0, None
                    totals[_key(full)] = x
                if level == 1:
                    department_x = x
                base = inner + 4  # every 事務事業 starts at the column's left; the levels below step right of it
                label, delta = _relabel(label, text, base + NAME_OFFSET + level * STEP)
                last_named = (base + level * STEP, page.number, min(w.y0 for w in label))
                levels[page.number, round(last_named[2])] = level
                last_section = _section(full, department if level == 1 else None)
                keep += label + budget + amounts + outside
                if budget and settled_value is not None:
                    last_budget = (page.number, min(w.y0 for w in label), _value(''.join(w.text for w in budget)) or 0, settled_value)
                continue
            # An item's イ OCR reads as 1 (a row's code copy is never on a line without its name).
            item_code = 'イ' if codes and _code(codes[0].text) == '1' else _code(codes[0].text) if codes else ''
            if codes and amounts and last_named is not None and ITEM.match(item_code):
                code = item_code
                if code != _code(codes[0].text):
                    moved.append(Moved(page.number, codes[0], 'misread code'))
                own = page.number if last_named[0] == CONTINUED else last_named[1]  # the row's facing page
                lists = [names[own]] if own in names else []
                owner = (CONTINUED, 0.0) if last_named[0] == CONTINUED else (last_named[1], last_named[2])
                # An explanation runs on to the top of the next facing page (of the first, for a row the volume
                # before opened).
                then = page.number if last_named[0] == CONTINUED else last_named[1] + 2
                later = [names[then]] if then in names else []
                name = _name(lists, last_section, code, later)
                items.append(Item(page.number, code, name, _box(codes), normalize(''.join(w.text for w in amounts)).replace('円', ''),
                                  _box(amounts), owner))
                keep += budget + outside
                continue
            if amounts and not codes and not budget and last_budget is not None and settled_value is not None:
                number, y, planned, spent = last_budget
                if spent is not None and planned - spent == settled_value:
                    moved += [Moved(page.number, w, 'unused', (number, y), settled_value) for w in amounts]
                    keep += outside
                    last_budget = None
                    continue
                # The rest may print as two: the part carried to the next year (翌年度繰越額, the facing page names
                # it 令和6年度繰越明許費), then the 不用額.
                after = lines[index + 1] if index + 1 < len(lines) else []
                rest = _value(''.join(w.text for w in after if middle <= (w.x0 + w.x1) / 2 < right)) \
                    if after and all(middle <= (w.x0 + w.x1) / 2 < right for w in after) else None
                if spent is not None and rest is not None and planned - spent == settled_value + rest:
                    moved += [Moved(page.number, w, 'forward', (number, y), settled_value) for w in amounts]
                    keep += outside
                    last_budget = (number, y, planned, spent + settled_value)
                    continue
                # The last amount of a volume, short of the rest: its 翌年度繰越額, the 不用額 heads the next volume.
                if (spent is not None and page.number == max(lefts) and 0 < settled_value < planned - spent
                        and not any(middle <= (w.x0 + w.x1) / 2 < right for later in lines[index + 1:] for w in later)):
                    moved += [Moved(page.number, w, 'forward', (number, y), settled_value) for w in amounts]
                    keep += outside
                    continue
            if amounts and not codes and not budget and last_budget is None and settled_value is not None \
                    and last_named is not None and last_named[0] == CONTINUED:
                # A volume's first amount, before any row: the 不用額 of the row the volume before left open.
                moved += [Moved(page.number, w, 'unused', (CONTINUED, 0.0), settled_value) for w in amounts]
                keep += outside
                continue
            keep += line
        result.append(replace(page, words=[part for w in keep for part in _split_unit(w)]))
    return result, moved, items, levels


FUSED = re.compile(r'^(△?[0-9]{1,3}(?:,[0-9]{3})*)円$')


def _split_unit(word: Word) -> list[Word]:
    """A short amount OCR reads with its unit as one word (`0円`; longer ones come apart, `5,977,191` `円`) as the
    two words the builder reads: the figure, then the unit (a full-width character, two digits wide)."""
    found = FUSED.match(normalize(word.text))
    if not found:
        return [word]
    figure = found.group(1)
    cut = word.x0 + (word.x1 - word.x0) * len(figure) / (len(figure) + 2)
    return [replace(word, text=figure, x1=cut), replace(word, text='円', x0=cut)]


def attach(built, items: list[Item], setting: dict, unit: str = '円', declared: list[dict] | None = None) -> list[str]:
    """Lay the items under the rows they explain, on the axis `items_axis`; `(ア)` under the `ア` above it, `a` under
    the `(ア)` (or the `ア`, when no `(ア)` stands between) and `(a)` under the `a`. The
    problems found (an item whose row is not found, or with no name on the facing page) are returned."""
    from ingestion.generic.inner_tables import node_key
    axis = setting['items_axis']
    rows = [n for n in built.nodes if not n.get('level_header')]
    problems, last, used = [], {}, set()
    for item in items:
        if item.owner[0] == CONTINUED:
            owner = next((n for n in reversed(built.nodes) if n.get('continued')), None)
        else:
            owner = next((n for n in rows if n['physical_page'] == item.owner[0] and abs(n['y0'] - item.owner[1]) < 3), None)
        if owner is None:
            problems.append(f'説明の項目の行が無い: {item.page}頁 {item.code} {item.amount}')
            continue
        if item.name is None:
            # a name OCR left unread on the facing page, read from the rendered page (`explained_names`)
            found = next((i for i, d in enumerate(declared or ()) if i not in used and d['page'] == item.page
                          and d['code'] == item.code and d['amount'] == item.amount), None)
            if found is None:
                problems.append(f'説明の項目の名前が対向頁に無い: {item.page}頁 {item.code} {item.amount}')
            else:
                used.add(found)
                item = replace(item, name=declared[found]['name'])
        level = next(i for i, pattern in enumerate(ITEM_LEVELS) if pattern.match(item.code))
        # under the nearest item above of a shallower level (a page may skip one: `a` straight under `ア`)
        parent = next((last[owner['node_key'], above] for above in range(level - 1, -1, -1)
                       if (owner['node_key'], above) in last), None) if level else owner
        if parent is None:
            problems.append(f'説明の項目の上の段の項目が無い: {item.page}頁 {item.code}')
            continue
        key = node_key(item.page, item.box, axis)
        node = {'node_key': key, 'parent_node_key': parent['node_key'], 'axis_header': axis,
                'depth': (parent['depth'] + 1) if parent['axis_header'] == axis else 1, 'level_header': None,
                'code_text': item.code, 'name_text': item.name or '', 'physical_page': item.page,
                'x0': item.box[0], 'y0': item.box[1], 'x1': item.box[2], 'y1': item.box[3]}
        built.nodes.append(node)
        built.amounts.append({'node_key': key, 'header_path': setting.get('settled_heading', '決算額'),
                              'amount_text': item.amount, 'unit_text': unit, 'physical_page': item.page,
                              'x0': item.amount_box[0], 'y0': item.amount_box[1], 'x1': item.amount_box[2], 'y1': item.amount_box[3]})
        last[owner['node_key'], level] = node
        for deeper in range(level + 1, len(ITEM_LEVELS)):
            last.pop((owner['node_key'], deeper), None)
    problems += [f'宣言した説明の項目の名前に当たる項目が無い: {d["page"]}頁 {d["code"]} {d["amount"]}'
                 for i, d in enumerate(declared or ()) if i not in used]
    return problems


def _running_header(page: Page) -> list[tuple[str, str, tuple[float, float, float, float]]]:
    """The 款・項・目 a left page prints above its frame (`2 総務費 4 戸籍及び住民基本台帳費 2 戸籍事務費`): code, name
    and box of each, the last line above the column heads (`款項目 事 務 事 業 …`) that starts with a code."""
    lines = _lines(page.words)
    heads = next((i for i, line in enumerate(lines) if normalize(line[0].text).startswith('款項目')), None)
    for words in reversed(lines[:heads or 0]):  # a title (`予 算 説 明`) may stand between
        found = []
        for word in words:
            text = normalize(word.text)
            if re.fullmatch(r'[0-9]+', text):
                found.append([text, '', [word]])
            elif found:
                found[-1][1] += text
                found[-1][2].append(word)
        if found and normalize(words[0].text).isdigit():
            return [(code, name, _box(boxed)) for code, name, boxed in found if name]
    return []


def _level(row: dict) -> int:
    return 1 if 'department' in row else 2 if SUB_PROJECT.match(row['code']) else 0


def continue_rows(built, pages: list[Page], continued: list[dict], levels: dict[tuple[int, int], int],
                  subject_axis: str, axis: str, setting: dict) -> list[str]:
    """A volume that starts inside a 事務事業 the volume before opened (131211 prints its general account in volumes
    cut anywhere): its first rows are parts of rows it does not print. The 款・項・目 they belong to are rebuilt from
    the running header of the first page, and the 事務事業 rows above them from `continued` (declared from the
    volume before, the department in `department`): rows with no amount, at the running header, which identify
    with the volume before's rows. The rows read with no parent are put under them by their depth. The problems
    found are returned."""
    first = min((p for p in pages if _running_header(p)), key=lambda p: p.number, default=None)
    if first is None:
        return ['続きの冊の頁に款・項・目の見出しが無い']
    header = _running_header(first)
    if len(header) != 3:
        return [f'続きの冊の見出しが款・項・目の3つでない: {[c + n for c, n, _ in header]}']
    from ingestion.generic.inner_tables import node_key
    chain, parent = [], None
    for index, (code, name, box) in enumerate(header):
        node = {'node_key': node_key(first.number, box, subject_axis), 'parent_node_key': parent, 'axis_header': subject_axis,
                'depth': index + 1, 'level_header': '款項目'[index], 'code_text': code, 'name_text': name,
                'physical_page': first.number, 'x0': box[0], 'y0': box[1], 'x1': box[2], 'y1': box[3]}
        chain.append(node)
        parent = node['node_key']
    box = header[-1][2]
    rows = []
    for index, row in enumerate(continued):
        name = row['name'] + (f'({row["department"]})' if 'department' in row else '')
        key = 'n-' + node_key(first.number, (box[0] + index + 1, box[1], box[2], box[3]), axis)[2:]
        rows.append({'node_key': key, 'parent_node_key': (rows[-1] if rows else chain[-1])['node_key'], 'axis_header': axis,
                     'depth': index + 1, 'level_header': None, 'code_text': row['code'].strip('()（）'), 'name_text': name,
                     'physical_page': first.number, 'x0': box[0], 'y0': box[1], 'x1': box[2], 'y1': box[3],
                     'continued': True})
    by_level = {'款': None, '項': chain[0], '目': chain[1]}
    for node in built.nodes:
        if node['parent_node_key'] is not None:
            continue
        if node['axis_header'] == subject_axis:
            if node['level_header'] != '款':
                if node['level_header'] not in by_level:
                    return [f'続きの冊の頭の科目の段が分からない: {node["code_text"]} {node["name_text"]!r}']
                node['parent_node_key'] = by_level[node['level_header']]['node_key']
        else:
            level = next((v for (page, y), v in levels.items() if page == node['physical_page'] and abs(y - node['y0']) < 3), None)
            above = [r for r, row in zip(rows, continued) if level is not None and _level(row) < level]
            if level is None or (level > 0 and not above):
                return [f'続きの冊の頭の行の段が分からない: {node["code_text"]} {node["name_text"]!r}']
            node['parent_node_key'] = (above[-1] if level else chain[-1])['node_key']
    # The builder levels the 科目 by their indents from the shallowest it reads: a volume with no row of the 款 it
    # continues reads its 項 as 款. The level is where the row starts in the 款・項・目 column, a third of it each.
    edges = _edges(first, setting)
    heads = next((w for w in first.words if normalize(w.text).startswith('款項目')), None)
    if edges is None or heads is None:
        return ['続きの冊の頁に款・項・目の欄が無い']
    step = (edges[0] - heads.x0) / 3
    for node in built.nodes:
        if node['axis_header'] == subject_axis and node['level_header'] in ('款', '項', '目'):
            level = min(2, max(0, round((node['x0'] - heads.x0) / step)))
            node['level_header'], node['depth'] = '款項目'[level], level + 1
    built.nodes[:0] = chain + rows
    # The builder hangs the 目 read before any 項 under the first of them: each 科目 is under the last one of the
    # level above it, in the order printed.
    last = {}
    for node in sorted((n for n in built.nodes if n['axis_header'] == subject_axis),
                       key=lambda n: (n not in chain, n['physical_page'], n['y0'])):
        level = '款項目'.index(node['level_header'])
        if level:
            node['parent_node_key'] = last['款項目'[level - 1]]['node_key']
        last[node['level_header']] = node
    by_key = {n['node_key']: n for n in built.nodes}

    def depth(node):
        parent = by_key.get(node['parent_node_key'])
        if parent is None or node['axis_header'] == subject_axis:
            return node['depth']
        return depth(parent) + 1 if parent['axis_header'] == node['axis_header'] else 1
    for node in built.nodes:
        node['depth'] = depth(node)
    # What the builder could not place for want of the rows above is placed now.
    placed = {(n['physical_page'], n['name_text']) for n in built.nodes if n['parent_node_key'] is not None}
    built.unowned[:] = [u for u in built.unowned if not (u['kind'] in ('no subject parent', 'subject depth gap')
                                                         and (u.get('page'), u.get('text')) in placed)]
    return []


def notes(built, moved: list[Moved], unit: str = '円') -> list[str]:
    """The notes of the rows (axis 注記, heading 注記金額), amounts the page prints for a row that are part of no
    sum (ADR 0024): the 不用額 under a row (kind 不用額, no label printed beside it), the part carried to the next
    year printed above it (kind 繰越額, no label), and the carried-over part of its budget from the year before (kind
    繰越額, `令和5年度繰越明許費分`). The problems found (a note whose row is not found) are returned."""
    groups: dict[tuple[str, int, tuple[int, float]], list[Moved]] = {}
    for m in moved:
        if m.kind in ('unused', 'carried', 'forward'):
            groups.setdefault((m.kind, m.page, m.owner), []).append(m)
    rows = [n for n in built.nodes if not n.get('level_header') and n['axis_header'] != '注記']
    problems = []
    for (kind, page, (number, y)), words in groups.items():
        text = normalize(''.join(m.word.text for m in words))
        if number == CONTINUED:
            owner = next((n for n in reversed(built.nodes) if n.get('continued')), None)
        else:
            owner = next((n for n in rows if n['physical_page'] == number and abs(n['y0'] - y) < 3), None)
        if owner is None:
            problems.append(f'注記の行が無い: {page}頁 {text}')
            continue
        if kind in ('unused', 'forward'):
            label, figures, amount = None, words, text.replace('円', '')
        else:
            found = CARRIED.match(text)
            label, amount = found.group(1), found.group(2)
            figures = [m for m in words if re.search(r'[0-9],[0-9]{3}|^[0-9]+円', normalize(m.word.text))] or words
        box, at = _box([m.word for m in words]), _box([m.word for m in figures])
        key = 'a-' + node_key_of(page, box)
        built.nodes.append({'node_key': key, 'parent_node_key': owner['node_key'], 'axis_header': '注記', 'depth': 1,
                            'level_header': '不用額' if kind == 'unused' else '繰越額', 'code_text': None,
                            'name_text': label, 'physical_page': page, 'x0': box[0], 'y0': box[1], 'x1': box[2], 'y1': box[3]})
        built.amounts.append({'node_key': key, 'header_path': '注記金額', 'amount_text': amount, 'unit_text': unit,
                              'physical_page': page, 'x0': at[0], 'y0': at[1], 'x1': at[2], 'y1': at[3]})
    return problems


def node_key_of(page: int, box: tuple[float, float, float, float]) -> str:
    from ingestion.generic.inner_tables import node_key
    return node_key(page, box, '注記')[2:]
