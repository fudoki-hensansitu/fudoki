"""Spot check of a built 目 against the printed rows of its source pages (no reference table needed).

A 目 passes when all of these hold on the printed text (words after the text-layer repair):

- each of its 当初予算額・予算現額・支出済額 is printed, as the whole number, at the place the build
  recorded for it (`10,000` never matches `110,000`);
- each sits in its stage's column, the cell under the source's own header word for that stage
  (`stage_columns`; a number running into the next column's text is placed by its start), so an
  amount the build read from another column fails;
- the 当初予算額 and 予算現額 share one printed row, and the 支出済額 is on it or on the row at the
  same height of the next page (the right half of a spread);
- its number and its whole name are printed in the subject columns around that row, without
  crossing another item: a row with an amount in the budget columns or a row opening with another
  number ends the 目's rows (`1` / `議会費`, `東久留米` / `6` / `市長選挙費`, `衆議院議` / … / `査費`);
- going back from that row through the pages, the last 款 and the last 項 printed (any 款・項 the
  build produced, matched by number and whole name at the start of a row) are the 目's own
  parents; the 款 may also be the one the page's running footer names.
"""
from __future__ import annotations

from dataclasses import dataclass
import re
import unicodedata

from ingestion.generic.layout import is_amount


@dataclass
class Row:
    page: int
    y: float
    tokens: list[tuple[str, float, float]]  # (NFKC text, x0, x1), left to right

    def first_amount(self) -> float | None:
        return next((x for t, x, _ in self.tokens if ',' in t and is_amount(t)), None)

    def label(self, before: float | None = None) -> str:
        """The row's text left of `before` (default: its own first grouped amount), without spaces
        and without amounts trailing the name (`衆議院議員 0` keeps the name)."""
        limit = before if before is not None else self.first_amount()
        kept = [t for t, x, _ in self.tokens if limit is None or x < limit]
        number = lambda t: is_amount(t) and any(c.isdigit() for c in t)  # `ー` in a name is no dash
        named = next((i for i, t in enumerate(kept) if not number(t)), len(kept))
        while len(kept) > named + 1 and number(kept[-1]):
            kept.pop()  # amounts printed after the name (`衆議院議員 0`), not a number inside it (`第 5 款`)
        return ''.join(kept)

    def has(self, amount: str) -> bool:
        """A token that is this number, whole (`10,000` is not in `110,000`); a number printed
        against the next column's text (`939,580,691明許`) counts by its whole leading number."""
        return any(_number(t) == amount for t, _, _ in self.tokens)

    def token(self, x0: float) -> tuple[str, float, float] | None:
        """The token starting at x0 (within 2pt)."""
        return next((t for t in self.tokens if abs(t[1] - x0) <= 2), None)

    def at(self, x0: float) -> str | None:
        """The whole leading number of the token starting at x0 (within 2pt)."""
        found = self.token(x0)
        return _number(found[0]) if found else None


def _number(token: str) -> str | None:
    """The whole leading number of a token (`939,580,691明許` → `939,580,691`)."""
    found = re.match(r'[△▲]?[0-9][0-9,]*', token)
    return found.group(0) if found else None


def rows(words, page: int, tolerance: float = 2.0) -> list[Row]:
    """Printed rows of one page from (text, x0, y0, x1, y1) words."""
    result: list[Row] = []
    for text, x0, y0, x1, y1 in sorted(words, key=lambda w: ((w[2] + w[4]) / 2, w[1])):
        y = (y0 + y1) / 2
        token = re.sub(r'\s', '', unicodedata.normalize('NFKC', text))
        if result and abs(result[-1].y - y) <= tolerance:
            result[-1].tokens.append((token, x0, x1))
        else:
            result.append(Row(page, y, [(token, x0, x1)]))
    for row in result:
        row.tokens.sort(key=lambda t: t[1])
    return result


def _name(node: dict) -> str:
    return re.sub(r'\s', '', unicodedata.normalize('NFKC', node.get('name') or ''))


def _starts(text: str, node: dict, level: str) -> bool:
    """The row starts with the node's number and whole name, after any higher-level numbers
    printed before it (`3 2 児童福祉費` is 項 2 of 款 3)."""
    code = unicodedata.normalize('NFKC', node.get('code') or '')
    return bool(code) and re.match(rf'^(?:[0-9]+[.．]?)*?第?{re.escape(code)}{level}?[.．]?{re.escape(_name(node))}', text) is not None


def _named(segment: list[str], node: dict) -> bool:
    """One row of the 目's rows opens with its number and the whole name reads through them."""
    code = unicodedata.normalize('NFKC', node.get('code') or '')
    pattern = re.compile(rf'^(?:[0-9]+[.．]?)*?第?{re.escape(code)}目?[.．]?')  # after any higher-level numbers
    for k, text in enumerate(segment):
        found = pattern.match(text) if code else None
        if found and _name(node) and _name(node) in ''.join(segment[:k] + [text[found.end():]] + segment[k + 1:]):
            return True
    return False


def _segment(page: list[Row], index: int, limit: float, budget: list[float]) -> list[str]:
    """The subject-column text of the 目's rows: its amount row and the rows around it, up to a row
    with an amount in the budget columns (another item's row) or a row opening with a number
    (another item's start; the 目's own number may open a row above its amount row)."""
    other_amounts = lambda r: any(abs(x1 - b) <= 3 for _, _, x1 in r.tokens for b in budget)
    opens = lambda r: re.match(r'^(?:第?[0-9]+[款項目]?[.．、]?)', r.label(limit)) is not None
    rows = [page[index]]
    for j in range(index - 1, max(-1, index - 8), -1):
        if other_amounts(page[j]) or not page[j].label(limit):
            break
        rows.insert(0, page[j])
        if opens(page[j]):
            break  # the 目's own number, or another item's: either way nothing above belongs here
    for j in range(index + 1, min(len(page), index + 9)):
        if other_amounts(page[j]) or opens(page[j]) or not page[j].label(limit):
            break
        rows.append(page[j])
    return [r.label(limit) for r in rows]


def _running(pages: dict[int, list[Row]], share: float = .3) -> set[int]:
    """Rows of running footers: rows without an amount in the bottom tenth of the printed area, at a
    height (2pt) shared by at least `share` of the pages. They are not read in order with the
    table's rows. (A heading row printed at the top of every page, `5. 社会教育費` with its amounts
    on the next line, is a table row.)"""
    bottom = .9 * max((row.y for page in pages.values() for row in page), default=0)
    heights: dict[int, set[int]] = {}
    for number, page in pages.items():
        for row in page:
            if row.first_amount() is None and row.y >= bottom:
                heights.setdefault(round(row.y / 2), set()).add(number)
    common = {h for h, numbers in heights.items() if len(numbers) >= max(2, share * len(pages))}
    return {id(row) for page in pages.values() for row in page if row.first_amount() is None and round(row.y / 2) in common}


def _amount(value: int | None) -> str | None:
    return None if value is None else (f'△{-value:,}' if value < 0 else f'{value:,}')


def _hit(previous: Row | None, following: tuple[Row, ...], level: str, nodes: list[dict], cache: dict) -> dict | None:
    """The 款 or 項 a row starts with; its name may wrap into the next rows (`1` / `公共土木施設災` /
    `害復旧費`, `3 戸籍住民基本` / `台帳費`), or around a row of its number only (`戸籍住民` / `3` /
    `基本台帳費`). Remembered per rows and level: every 目 asks again."""
    key = (id(previous), tuple(id(r) for r in following), level)
    if key not in cache:
        labels = [r.label() for r in following]
        texts = [''.join(labels[:k]) for k in range(1, len(labels) + 1)]
        if previous is not None and re.fullmatch(r'第?[0-9]+[款項]?[.．]?', labels[0]):
            texts += [labels[0] + previous.label() + ''.join(labels[1:k]) for k in range(1, len(labels) + 1)]
        cache[key] = next((n for n in nodes if _name(n) and any(_starts(t, n, level) for t in texts)), None)
    return cache[key]


PHASES = ('approved', 'adjusted', 'executed')
MARKER = re.compile(r'[(（]?[A-Z][)）]?$')  # `支出済額(B)`


def stage_columns(page) -> dict[str, tuple[float, float]]:
    """Each stage's column on one observed page (words and rules after the repair), from the
    source's own header: a header word the shared dictionary maps to the stage (当初予算額, 計,
    予算現額, 支出済額, 決算額…) and the vertical rules on either side of it. The header is the part
    above the page's first line with two grouped amounts (a 款 title above the table prints one);
    spaced words of one cell read as one (`支 出 済 額`).
    The column is the body cell under the header word (between the vertical rules crossing the
    first amount's height); where headers stack, the lowest one naming a stage is its column
    (計 under 予算現額). Stages whose cells overlap get no column.
    Nothing here comes from the build, so a build that reads a column as the wrong stage fails."""
    from ingestion.lib.node_tables import phase_dictionary
    names = {header: phase for (kind, header), phase in phase_dictionary().items() if not kind and phase in PHASES}
    words = sorted(page.words, key=lambda w: (round((w.y0 + w.y1) / 2 / 2), w.x0))  # a printed line, left to right
    # The body starts at the first line with two grouped amounts (a 款 title above the table prints one).
    lines: dict[int, int] = {}
    for w in words:
        if ',' in w.text and is_amount(unicodedata.normalize('NFKC', w.text)):
            lines[round((w.y0 + w.y1) / 2 / 2)] = lines.get(round((w.y0 + w.y1) / 2 / 2), 0) + 1
    first = min((key * 2 for key, count in lines.items() if count >= 2), default=None)
    verticals = [r for r in page.rules if r.vertical]
    ruled = lambda a, b, y: any(a <= r.x0 <= b and r.y0 - 1 <= y <= r.y1 + 1 for r in verticals)
    phrases: list[list] = []
    for word in words:
        y = (word.y0 + word.y1) / 2
        if first is None or y >= first - 1:
            continue
        last = phrases[-1] if phrases else None
        # Words of one header cell join (`支 出 済 額`); a rule between them parts two cells.
        if last and abs(last[2] - y) <= 2 and -2 <= word.x0 - last[1] <= 1.5 * (word.y1 - word.y0) and not ruled(last[1], word.x0, y):
            last[1], last[3] = word.x1, last[3] + word.text
        else:
            phrases.append([word.x0, word.x1, y, word.text])
    # The body's columns: rules crossing the height of the page's first amount.
    body = [r.x0 for r in verticals if r.y0 - 1 <= first <= r.y1 + 1] if first is not None else []
    cells: dict[str, tuple[float, float, float]] = {}
    for x0, x1, y, text in phrases:
        phase = names.get(MARKER.sub('', re.sub(r'\s', '', unicodedata.normalize('NFKC', text))))
        if phase is None:
            continue
        centre = (x0 + x1) / 2
        left, right = max([x for x in body if x <= centre], default=None), min([x for x in body if x >= centre], default=None)
        # The lowest header naming a stage is its own column (計 under 予算現額).
        if left is not None and right is not None and (phase not in cells or y > cells[phase][2]):
            cells[phase] = (left, right, y)
    # Two stages in overlapping cells (a rule between their columns ends inside the header) leave
    # neither column known: both are dropped, and their amounts fail as unverifiable.
    overlapping = {a for a in cells for b in cells if a != b and cells[a][0] < cells[b][1] and cells[b][0] < cells[a][1]}
    return {phase: (left, right) for phase, (left, right, _) in cells.items() if phase not in overlapping}


def _in_column(token: tuple[str, float, float], cell: tuple[float, float]) -> bool:
    """A printed number inside its stage's cell; a number running into the next column's text
    (`939,580,691明許`), whose own right edge the text hides, by where it starts."""
    text, x0, x1 = token
    left, right = cell
    return left - 1 <= x0 and (x1 <= right + 1 or _number(text) != text) and x0 < right


def verify(moku: dict, kan: dict, kou: dict, pages: dict[int, list[Row]], others: dict[str, list[dict]],
           stages: dict[int, dict[str, tuple[float, float]]], cache: dict | None = None) -> list[str]:
    """Reasons the 目 fails, empty when it passes. `moku` carries its amounts and their printed
    places (`positions`: phase → (page, x0, y0, x1, y1)); `others` lists every built 款 and 項 by
    level; `stages` maps each page to `stage_columns` of it. Pass one `cache` for every 目 of a
    document."""
    cache = {} if cache is None else cache
    values = {phase: _amount(moku['amounts'].get(phase)) for phase in PHASES}
    places = moku.get('positions') or {}
    if any(values[p] is None or not places.get(p) for p in PHASES):
        return ['金額が揃っていない']
    found: dict[str, tuple[int, int]] = {}
    reasons = []
    for phase in PHASES:
        number, x0, y0, x1, y1 = places[phase]
        page = pages.get(number, [])
        index = next((i for i, r in enumerate(page) if abs(r.y - (y0 + y1) / 2) <= 2 and r.at(x0) is not None), None)
        if index is None or page[index].at(x0) != values[phase]:
            return ['金額がその位置に無い']
        cell = stages.get(number, {}).get(phase)
        if cell is None:
            reasons.append('列を確かめられない')  # no header naming the stage on that page
        elif not _in_column(page[index].token(x0), cell):
            reasons.append('金額の列が違う')
        found[phase] = (number, index)
    (page_no, index), (adjusted_page, adjusted_index) = found['approved'], found['adjusted']
    page = pages[page_no]
    row = page[index]
    if (adjusted_page, adjusted_index) != (page_no, index):
        reasons.append('当初予算額と予算現額が別の行')
    spent_page, spent_index = found['executed']
    if not ((spent_page, spent_index) == (page_no, index) or
            (spent_page == page_no + 1 and abs(pages[spent_page][spent_index].y - row.y) <= 3)):
        reasons.append('支出済額が同じ行に無い')
    budget = [places['approved'][3], places['adjusted'][3]]
    limit = min(places['approved'][1], places['adjusted'][1])  # the budget columns start here
    if not _named(_segment(page, index, limit, budget), moku):
        reasons.append('番号と名前が行に無い')
    if reasons:
        return sorted(set(reasons))
    same = lambda a, b: a is not None and (a.get('code'), _name(a)) == (b.get('code'), _name(b))  # summary and detail print one 款
    last = {'款': None, '項': None}
    if 'running' not in cache:
        cache['running'] = _running(pages)
    running = cache['running']
    before = [r for p in sorted(pages) if p < page_no for r in pages[p] if id(r) not in running] + \
        [r for r in page[:index] if id(r) not in running]
    for position, r in enumerate(before):
        following = tuple(before[position:position + 3])
        previous = before[position - 1] if position else None
        for level in ('款', '項'):
            hit = _hit(previous, following, level, others[level], cache)
            if hit is not None:  # a new 款 always prints its 項 before its 目, so the last 項 stands
                last[level] = hit
    # The 款 is the last one printed before the 目, or the one the page's running footer names.
    heading = any(_starts(r.label(), kan, '款') for r in page if id(r) in running)
    wrong = [level for level, node in (('款', kan), ('項', kou)) if not same(last[level], node) and not (level == '款' and heading)]
    return [f"親が違う（{'・'.join(wrong)}）"] if wrong else []
