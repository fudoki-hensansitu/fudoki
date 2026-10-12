"""Stages 2–3: rule-bounded column bands, header paths and band kinds.

A *band* is the strip between two neighbouring vertical rules that reach the
table body. Its header path stacks the header cells (rule-bounded rectangles
above the first printed number) that cover the band, from the top. A page whose
leftmost band holds amounts continues the rows of the previous page (a spread);
the two are read as one logical page with the right page shifted to the right.
"""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
import re
import unicodedata

from ingestion.generic.observe import Page, Rule, Word

AMOUNT = re.compile(r'[△▲\-]?(?:[0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)')
DASHES = {'－', '―', '—', '-', 'ー'}
SIGNS = {'△', '▲'}
SUBJECT_LEVELS = ('款', '項', '目')
UNIT = re.compile(r'単位\s*[:：]?\s*(百万円|千円|円)')  # the shared rule is in units.py


def normalize(text: str) -> str:
    return re.sub(r'\s+', '', unicodedata.normalize('NFKC', text))


def is_amount(text: str) -> bool:
    text = normalize(text)
    return text in {normalize(d) for d in DASHES} or AMOUNT.fullmatch(text) is not None


@dataclass
class Glyph:
    """A word placed on a logical page. `x0`/`x1` include the spread offset."""
    text: str
    x0: float
    y0: float
    x1: float
    y1: float
    page: int
    offset: float

    @property
    def original(self) -> tuple[float, float, float, float]:
        return self.x0 - self.offset, self.y0, self.x1 - self.offset, self.y1


@dataclass
class Band:
    x0: float
    x1: float
    page: int
    header: tuple[str, ...]
    rows: list[float]  # horizontal rules crossing this band in the body, sorted
    body_top: float
    body_bottom: float
    words: list[Glyph] = field(default_factory=list)
    kind: str | None = None  # 'amount' | 'label' | None (empty)
    spans: list[tuple[float, float, str]] = field(default_factory=list)  # header cells over the band

    @property
    def center(self) -> float:
        return (self.x0 + self.x1) / 2


@dataclass
class Logical:
    pages: list[int]
    bands: list[Band]
    unit: str | None
    outside: list[Glyph]


def _crosses(rule: Rule, y: float) -> bool:
    return rule.y0 - 1 <= y <= rule.y1 + 1


def _covers(rule: Rule, x: float) -> bool:
    return rule.x0 - 1 <= x <= rule.x1 + 1


def split_at_rules(word: Word, verticals: list[Rule]) -> list[Word]:
    """Split a word that a vertical rule crosses, by proportional character width."""
    y = (word.y0 + word.y1) / 2
    cuts = sorted(r.x0 for r in verticals if word.x0 + 1 < r.x0 < word.x1 - 1 and _crosses(r, y))
    if not cuts or len(word.text) < 2:
        return [word]
    width = (word.x1 - word.x0) / len(word.text)
    pieces, start = [], 0
    for cut in cuts + [word.x1 + 1]:
        end = len(word.text) if cut > word.x1 else max(start, min(len(word.text), round((cut - word.x0) / width)))
        if end > start:
            pieces.append(Word(word.text[start:end], word.x0 + start * width, word.y0,
                               word.x0 + end * width, word.y1))
        start = end
    return pieces


def reading(words: list[Word]) -> str:
    """Text of words in reading order: lines by vertical overlap, then left to right.

    Rounding the top edge would split one printed line whose glyphs sit on
    slightly different baselines and read 予算現額 as 算予現額.
    """
    rows: list[list[Word]] = []
    for word in sorted(words, key=lambda w: ((w.y0 + w.y1) / 2, w.x0)):
        if rows:
            last = rows[-1][-1]
            if min(last.y1, word.y1) - max(last.y0, word.y0) >= .5 * min(last.y1 - last.y0, word.y1 - word.y0):
                rows[-1].append(word)
                continue
        rows.append([word])
    return ''.join(w.text for row in rows for w in sorted(row, key=lambda w: w.x0))


def _frames(page: Page) -> list[tuple[float, float, float, float, list[float]]]:
    """Frames as (x0, x1, top, bottom, band edges) from rules that bound a table."""
    verticals = [r for r in page.rules if r.vertical and r.y1 - r.y0 > 40]
    horizontals = [r for r in page.rules if not r.vertical]
    xs = sorted({round(r.x0, 1) for r in verticals})
    edges: list[float] = []
    for x in xs:
        if not edges or x - edges[-1] > 3:
            edges.append(x)
    frames, current = [], []
    for left, right in zip(edges, edges[1:]):
        middle = (left + right) / 2
        inside = [h for h in horizontals if _covers(h, middle)]
        if len(inside) >= 2:
            if not current:
                current = [left]
            current.append(right)
        elif current:
            frames.append(current); current = []
    if current:
        frames.append(current)
    result = []
    for frame in frames:
        middle = [(a + b) / 2 for a, b in zip(frame, frame[1:])]
        spanning = [h for h in horizontals if all(_covers(h, m) for m in middle)]
        if len(spanning) < 2:
            continue
        result.append((frame[0], frame[-1], min(h.y0 for h in spanning), max(h.y0 for h in spanning), frame))
    return result


def _header_bottom(page: Page, frame) -> float:
    x0, x1, top, bottom, _ = frame
    horizontals = [r for r in page.rules if not r.vertical]
    full = sorted(h.y0 for h in horizontals
                  if h.x0 <= x0 + 3 and h.x1 >= x1 - 3 and top - 1 <= h.y0 <= bottom + 1)
    digits = [w.y0 for w in page.words if x0 < (w.x0 + w.x1) / 2 < x1 and top + 1 < w.y0 < bottom
              and re.search(r'[0-9０-９]', w.text)]
    first = min(digits) if digits else bottom
    candidates = [y for y in full if top + 1 < y <= first + 1]
    if candidates:
        return candidates[-1]
    return full[1] if len(full) > 1 else top


def page_bands(page: Page) -> tuple[list[Band], list[Word]]:
    """Bands of every frame on one physical page, and the words outside frames."""
    verticals = [r for r in page.rules if r.vertical]
    horizontals = [r for r in page.rules if not r.vertical]
    # Header words split at rules (a spanning header prints 款項 as one word);
    # body words keep Poppler's extent and belong to the band where they start,
    # so a two-digit code that overruns a narrow band stays whole.
    split = [(index, piece) for index, word in enumerate(page.words) for piece in split_at_rules(word, verticals)]
    used: set[int] = set()
    bands = []
    for frame in _frames(page):
        x0, x1, top, bottom, edges = frame
        header_bottom = _header_bottom(page, frame)
        # Header cells: the rule-bounded rectangle around each header word.
        cells: dict[tuple, list[Word]] = defaultdict(list)
        for index, word in split:
            cx, cy = (word.x0 + word.x1) / 2, (word.y0 + word.y1) / 2
            if not (x0 < cx < x1 and top < cy < header_bottom):
                continue
            used.add(index)
            left = max([r.x0 for r in verticals if r.x0 <= cx and _crosses(r, cy)] or [x0])
            right = min([r.x0 for r in verticals if r.x0 >= cx and _crosses(r, cy)] or [x1])
            upper = max([h.y0 for h in horizontals if h.y0 <= cy and _covers(h, cx)] or [top])
            lower = min([h.y0 for h in horizontals if h.y0 >= cy and _covers(h, cx)] or [header_bottom])
            cells[left, right, upper, lower].append(word)
        header_cells = sorted(((key, normalize(reading(ws))) for key, ws in cells.items()), key=lambda c: c[0][2])
        for left, right in zip(edges, edges[1:]):
            middle = (left + right) / 2
            covering = [(key, text) for key, text in header_cells if key[0] - 1 <= middle <= key[1] + 1 and text]
            rows = sorted(h.y0 for h in horizontals if _covers(h, middle) and header_bottom - 1 <= h.y0 <= bottom + 1)
            band = Band(left, right, page.number, tuple(text for _, text in covering), rows, header_bottom, bottom,
                        spans=[(key[0], key[1], text) for key, text in covering])
            for index, word in enumerate(page.words):
                sx, cy = word.x0 + min(2, (word.x1 - word.x0) / 2), (word.y0 + word.y1) / 2
                if left < sx < right and header_bottom < cy < bottom:
                    band.words.append(Glyph(word.text, word.x0, word.y0, word.x1, word.y1, page.number, 0))
                    used.add(index)
            bands.append(band)
    outside = [w for i, w in enumerate(page.words) if i not in used]
    return bands, outside


def lines(words: list[Glyph], tolerance: float = 2.0) -> list[list[Glyph]]:
    """Words of one band grouped into printed lines (by vertical centre)."""
    result: list[list[Glyph]] = []
    for word in sorted(words, key=lambda w: ((w.y0 + w.y1) / 2, w.x0)):
        cy = (word.y0 + word.y1) / 2
        if result and abs(cy - sum((w.y0 + w.y1) / 2 for w in result[-1]) / len(result[-1])) <= tolerance:
            result[-1].append(word)
        else:
            result.append([word])
    return [sorted(line, key=lambda w: w.x0) for line in result]


def runs(line: list[Glyph], gap: float = 2.5) -> list[list[Glyph]]:
    """Touching words of one line: Poppler splits digits and names arbitrarily."""
    result: list[list[Glyph]] = []
    for word in line:
        if result and word.x0 - result[-1][-1].x1 <= gap:
            result[-1].append(word)
        else:
            result.append([word])
    return result


def text(words: list[Glyph]) -> str:
    return ''.join(w.text for w in words)


def logical_pages(pages: list[Page]) -> list[Logical]:
    """Read each page's bands, classify them once per document, then join spreads."""
    per_page = [(page, *page_bands(page)) for page in pages]
    # Band kind by content, learned per header path over the whole document so
    # that empty continuation pages keep it. A band is a label band when at least
    # half of its printed lines carry text; otherwise it holds amounts if any
    # grouped number or only zeros appear (item codes alone are labels).
    stats: dict[tuple, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for _, bands, _ in per_page:
        for band in bands:
            for line in lines(band.words):
                kinds = set()
                for run in runs(line):
                    value = normalize(text(run))
                    if value in SIGNS:
                        continue
                    if not is_amount(value):
                        kinds.add('text')
                    elif ',' in value or len(value.lstrip('△▲-')) > 3:
                        kinds.add('grouped')
                    elif value.lstrip('△▲-') in ('0',) or value in {normalize(d) for d in DASHES}:
                        kinds.add('zero')
                    else:
                        kinds.add('code')
                counts = stats[band.header]
                counts['lines'] += 1
                for kind in kinds:
                    counts[kind] += 1
    for _, bands, _ in per_page:
        for band in bands:
            counts = stats[band.header]
            if band.header and band.header[-1] in SUBJECT_LEVELS:
                band.kind = 'label'
            elif not counts['lines']:
                band.kind = None
            elif counts['text'] * 2 >= counts['lines']:
                band.kind = 'label'
            elif counts['grouped'] or (counts['zero'] and not counts['code']):
                band.kind = 'amount'
            else:
                band.kind = 'label'
    result: list[Logical] = []
    for page, bands, outside in per_page:
        unit = None
        for line in lines([Glyph(w.text, w.x0, w.y0, w.x1, w.y1, page.number, 0) for w in outside]):
            found = UNIT.search(normalize(text(line)))
            if found:
                unit = found.group(1)
        glyphs = [Glyph(w.text, w.x0, w.y0, w.x1, w.y1, page.number, 0) for w in outside]
        if not bands:
            continue
        first = min(bands, key=lambda b: b.x0)
        if first.kind == 'amount' and result and result[-1].pages[-1] == page.number - 1 and len(result[-1].pages) == 1:
            previous = result[-1]
            offset = max(b.x1 for b in previous.bands) + 10 - first.x0
            for band in bands:
                band.x0 += offset; band.x1 += offset
                band.spans = [(a + offset, b + offset, t) for a, b, t in band.spans]
                for word in band.words:
                    word.x0 += offset; word.x1 += offset; word.offset = offset
            previous.pages.append(page.number)
            previous.bands.extend(bands)
            previous.unit = previous.unit or unit
            previous.outside.extend(glyphs)
            continue
        result.append(Logical([page.number], bands, unit, glyphs))
    return result
