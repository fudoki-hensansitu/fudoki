"""Spot check of a built 目 against the printed rows of its source pages (no reference table needed).

A 目 passes when all of these hold on the printed text (words after the text-layer repair):

- its 当初予算額 and 予算現額 are whole tokens of one printed row (`10,000` never matches `110,000`);
- its number and its whole name are printed at the left of that row, possibly wrapped over the
  two rows above and three below (`1` / `議会費`, `鶴川市民セ` / `ンター費`);
- its 支出済額 is a whole token of the same row, or of the row at the same height on the next
  page (the right half of a spread);
- going back from that row through the pages, the last 款 and the last 項 printed (any 款・項 the
  build produced, matched by number and whole name at the start of a row) are the 目's own
  parents, so an amount or a parent taken from another row fails.
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
    tokens: list[tuple[str, float]]  # (NFKC text, x0), left to right

    def first_amount(self) -> float | None:
        return next((x for t, x in self.tokens if ',' in t and is_amount(t)), None)

    def label(self, before: float | None = None) -> str:
        """The row's text left of `before` (default: its own first grouped amount), without spaces
        and without amounts trailing the name (`衆議院議員 0` keeps the name)."""
        limit = before if before is not None else self.first_amount()
        kept = [t for t, x in self.tokens if limit is None or x < limit]
        number = lambda t: is_amount(t) and any(c.isdigit() for c in t)  # `ー` in a name is no dash
        named = next((i for i, t in enumerate(kept) if not number(t)), len(kept))
        while len(kept) > named + 1 and number(kept[-1]):
            kept.pop()  # amounts printed after the name (`衆議院議員 0`), not a number inside it (`第 5 款`)
        return ''.join(kept)

    def has(self, amount: str) -> bool:
        """A token that is this number, whole (`10,000` is not in `110,000`); a number printed
        against the next column's text (`939,580,691明許`) counts by its whole leading number."""
        return any(_number(t) == amount for t, _ in self.tokens)


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
            result[-1].tokens.append((token, x0))
        else:
            result.append(Row(page, y, [(token, x0)]))
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


def _named(window: list[str], node: dict) -> bool:
    """The number starts one of the rows and the whole name reads through the rows around it."""
    code = unicodedata.normalize('NFKC', node.get('code') or '')
    pattern = re.compile(rf'^(?:[0-9]+[.．]?)*?第?{re.escape(code)}目?[.．]?')  # after any higher-level numbers
    for k, text in enumerate(window):
        found = pattern.match(text) if code else None
        if found:
            rest = window[:k] + [text[found.end():]] + window[k + 1:]
            if _name(node) and _name(node) in ''.join(rest):
                return True
    return False


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


def verify(moku: dict, kan: dict, kou: dict, pages: dict[int, list[Row]], others: dict[str, list[dict]],
           cache: dict | None = None) -> list[str]:
    """Reasons the 目 fails, empty when it passes. `others` lists every built 款 and 項 by level;
    pass one `cache` for every 目 of a document to read each row once."""
    cache = {} if cache is None else cache
    approved, adjusted, executed = (_amount(moku['amounts'].get(k)) for k in ('approved', 'adjusted', 'executed'))
    if not (approved and adjusted and executed):
        return ['金額が揃っていない']
    page = pages.get(moku['page'], [])
    candidates = [i for i, row in enumerate(page) if row.has(approved) and row.has(adjusted)]
    if not candidates:
        return ['当初予算額・予算現額の行が無い']
    reasons = []
    for index in candidates:
        # The 目's column: left of the first amount of its amount row, on that row, two rows above
        # and three below (a name may wrap around its number, `東久留米` / `6` / `市長選挙費`, or
        # run down a tall cell, `衆議院議` / `員選挙及` / `び国民審` / `査費`).
        limit = min(x for t, x in page[index].tokens if _number(t) in (approved, adjusted))  # the budget columns start here
        end = min(len(page), index + 4)
        while end < len(page) and page[end].first_amount() is None and page[end].label(limit) and end < index + 8:
            end += 1  # a name running further down a tall cell (`年・町制` / `施行50周` / `年記念事` / `業費`)
        window = [page[j].label(limit) for j in range(max(0, index - 2), end)]
        named = _named(window, moku)
        row = page[index]
        spent = row.has(executed) or any(r.has(executed) and abs(r.y - row.y) <= 3 for r in pages.get(moku['page'] + 1, []))
        if not named:
            reasons.append('番号と名前が行に無い')
            continue
        if not spent:
            reasons.append('支出済額が同じ行に無い')
            continue
        same = lambda a, b: a is not None and (a.get('code'), _name(a)) == (b.get('code'), _name(b))  # summary and detail print one 款
        last = {'款': None, '項': None}
        if 'running' not in cache:
            cache['running'] = _running(pages)
        running = cache['running']
        before = [r for p in sorted(pages) if p < moku['page'] for r in pages[p] if id(r) not in running] + \
            [r for r in page[:index] if id(r) not in running]
        for position, r in enumerate(before):
            following = tuple(before[position:position + 3])
            previous = before[position - 1] if position else None
            for level in ('款', '項'):
                hit = _hit(previous, following, level, others[level], cache)
                if hit is not None:  # a new 款 always prints its 項 before its 目, so the last 項 stands
                    last[level] = hit
        # The 款 is the last one printed before the 目, or the one the page's running heading or
        # footer names (`第8款 土木費`, `4衛生費保健衛生費…`): both are printed by the source.
        heading = any(_starts(r.label(), kan, '款') for r in page if id(r) in running)
        wrong = [level for level, node in (('款', kan), ('項', kou))
                 if not same(last[level], node) and not (level == '款' and heading)]
        if wrong:
            reasons.append(f"親が違う（{'・'.join(wrong)}）")
            continue
        return []
    return sorted(set(reasons))
