"""Observation stage for scan PDFs: pinned OCR observations and image rules as generic pages.

The generic builder reads Poppler words and drawn rules. A scan PDF has neither, so this
module turns one pinned OCR observation (ADR 0019) into the same ``Page`` values: rules come
from the page image (``pdf_rules``) and words from the OCR lines. Vision cuts a line into
pieces at wide gaps, including the gap a scanned thousands separator leaves ("15,936" "120"),
so the pieces of one line are cut at the vertical rules first and rejoined within a cell when
they nearly touch, unless one of them is an amount.
"""
from __future__ import annotations

from collections import Counter
from pathlib import Path
import re

from ingestion.generic.layout import _frames, _header_bottom, normalize
from ingestion.generic.observe import Page, Rule, Word
from ingestion.lib import pdf_rules
from ingestion.lib.scan_ocr import superseded

# Vision reads the minus sign △ as a letter.
MINUS = re.compile(r'^[AΔ▲]\s*(?=[0-9])')
NUMBER = re.compile(r'△?[0-9][0-9,.]*')
AMOUNT = re.compile(r'△?[0-9]{1,3}([,.][0-9]{3})+|△?[0-9]{4,}')
# Pieces closer than this share of the line height belong to one word.
JOIN_GAP = .6


def _text(raw: str) -> str:
    text = MINUS.sub('△', raw.strip().replace('，', ','))
    if NUMBER.fullmatch(text) and re.search(r'[0-9][,.]?[0-9]', text):
        sign = '△' if text.startswith('△') else ''
        digits = re.sub(r'[^0-9]', '', text)
        # A misplaced or missing separator ("15,936120") is regrouped; a leading zero is kept.
        if not digits.startswith('0') or len(digits) == 1:
            return sign + f'{int(digits):,}'
    return text


def _amount(text: str) -> bool:
    return bool(AMOUNT.fullmatch(_text(text)))


def _split(word: Word, cuts: list[float]) -> list[Word]:
    """Cut a piece that crosses vertical rules, giving each side its share of the characters."""
    inside = [x for x in cuts if word.x0 + 1 < x < word.x1 - 1]
    if not inside or len(word.text) < 2:
        return [word]
    pieces, start, used = [], word.x0, 0
    width = (word.x1 - word.x0) / len(word.text)
    for x in [*inside, word.x1]:
        end = len(word.text) if x == word.x1 else max(used, min(len(word.text), round((x - word.x0) / width)))
        if end > used:
            pieces.append(Word(word.text[used:end], start, word.y0, x, word.y1))
        start, used = x, end
    return pieces


def _cell_words(pieces: list[Word], cuts: list[float]) -> list[Word]:
    """Rejoin the pieces of one OCR line that sit in the same cell and nearly touch."""
    words: list[Word] = []
    for piece in sorted((p for w in pieces for p in _split(w, cuts)), key=lambda w: w.x0):
        if words:
            last = words[-1]
            height = max(last.y1 - last.y0, piece.y1 - piece.y0)
            same_cell = not any(last.x0 < x <= piece.x0 for x in cuts)
            # "2" "款" "1" "項" join; a name and its amount stay apart even when they nearly touch.
            amount_with_text = _amount(last.text) != _amount(piece.text) and not (
                NUMBER.fullmatch(_text(last.text)) and NUMBER.fullmatch(_text(piece.text)))
            if same_cell and piece.x0 - last.x1 <= JOIN_GAP * height and not amount_with_text:
                words[-1] = Word(last.text + piece.text, last.x0, min(last.y0, piece.y0), piece.x1,
                                 max(last.y1, piece.y1))
                continue
        words.append(piece)
    return [Word(_text(w.text), w.x0, w.y0, w.x1, w.y1) for w in words if w.text.strip()]


def page(observation_page: dict, pdf: Path) -> Page:
    number = observation_page['page_number']
    detected = pdf_rules.detect(pdf, number)
    rules = [Rule(r.position, r.start, r.position, r.end) for r in detected.vertical]
    rules += [Rule(r.start, r.position, r.end, r.position) for r in detected.horizontal]
    cuts = sorted(r.position for r in detected.vertical)
    gone = superseded(observation_page)
    words: list[Word] = []
    for region in observation_page['regions']:
        items = [o for o in region['observations'] if o['id'] not in gone and o['bbox_pdf_pt'] and o['raw_text'].strip()]
        parts: dict[str, list[Word]] = {}
        for item in items:
            if item['kind'] == 'word' and item.get('parent_id'):
                parts.setdefault(item['parent_id'], []).append(Word(item['raw_text'], *item['bbox_pdf_pt']))
        for item in items:
            if item['kind'] == 'region':
                words += _cell_words(parts.get(item['id']) or [Word(item['raw_text'], *item['bbox_pdf_pt'])], cuts)
    return Page(number, detected.width, detected.height, words, rules)


def _header(page: Page) -> tuple[list[float], float, float, list[Word]] | None:
    """The widest frame's band edges, its top and header bottom, and the header words."""
    frames = _frames(page)
    if not frames:
        return None
    frame = max(frames, key=lambda f: f[1] - f[0])
    x0, x1, top, _, edges = frame
    bottom = _header_bottom(page, frame)
    words = [w for w in page.words if x0 < (w.x0 + w.x1) / 2 < x1 and top < (w.y0 + w.y1) / 2 < bottom]
    return edges, top, bottom, words


def agreed_headers(pages: list[Page]) -> list[Page]:
    """Give pages printed on one frame the header most of them read, column by column.

    Every page of a scanned statement repeats the same header, but OCR reads it differently
    from page to page (a missed 目, 繰越 as 灤越). The builder learns a band's kind per header
    path over the document, so a misread splits one column into several. Pages whose frames
    have the same band widths share one reading: for each band, the text most pages read
    (ties to the longer), with the words of a page that read it, moved onto each page.
    """
    headers = [_header(p) for p in pages]
    groups: dict[tuple, list[int]] = {}
    for index, header in enumerate(headers):
        if header:
            widths = tuple(round((b - a) / 3) for a, b in zip(header[0], header[0][1:]))
            groups.setdefault(widths, []).append(index)
    replaced = {i: list(p.words) for i, p in enumerate(pages)}
    for members in groups.values():
        if len(members) < 2:
            continue
        columns = len(headers[members[0]][0]) - 1
        chosen: list[tuple[int, int]] = []  # (band, page index whose reading wins)
        for band in range(columns):
            readings = {}
            for index in members:
                edges, _, _, words = headers[index]
                inside = sorted((w for w in words if edges[band] < (w.x0 + w.x1) / 2 < edges[band + 1]),
                                key=lambda w: (round(w.y0 / 4), w.x0))
                readings[index] = normalize(''.join(w.text for w in inside))
            counts = Counter(readings.values())
            best = max(counts, key=lambda text: (counts[text], len(text)))
            chosen.append((band, next(i for i in members if readings[i] == best)))
        for index in members:
            edges, top, _, words = headers[index]
            header_ids = {id(w) for w in words}
            moved = []
            for band, source in chosen:
                source_edges, source_top, _, source_words = headers[source]
                dx, dy = edges[band] - source_edges[band], top - source_top
                moved += [Word(w.text, w.x0 + dx, w.y0 + dy, w.x1 + dx, w.y1 + dy) for w in source_words
                          if source_edges[band] < (w.x0 + w.x1) / 2 < source_edges[band + 1]]
            replaced[index] = [w for w in pages[index].words if id(w) not in header_ids] + moved
    return [Page(p.number, p.width, p.height, replaced[i], p.rules) for i, p in enumerate(pages)]


def pages(observation: dict, pdf: Path) -> list[Page]:
    return agreed_headers([page(p, pdf) for p in observation['pages']])


def logicals(observation: dict, pdf: Path) -> list:
    """The logical pages of an OCR observation, marked as OCR so the builder's rules for misreads apply."""
    from ingestion.generic.layout import logical_pages
    found = logical_pages(pages(observation, pdf))
    for logical in found:
        logical.ocr = True
    return found


def near_code(first: str | None, second: str | None) -> bool:
    """Two printings of one code, or a code and its OCR misreading: equal as numbers (`02` and `2`), or one
    digit dropped or added at either end (`10` read `1`, `3` read `13`, 132055). A code not read is no evidence
    against it."""
    if second is None or first is None:
        return True
    if first == second or (first.isdigit() and second.isdigit() and int(first) == int(second)):
        return True
    a, b = sorted((first.lstrip('0') or '0', second.lstrip('0') or '0'), key=len)
    return len(b) - len(a) == 1 and (b.startswith(a) or b.endswith(a))


def misread_repeat(previous_code: str | None, previous_name: str, code: str | None, name: str) -> bool:
    """A subject line OCR misread that still repeats the open heading of its level on a continuation page.

    Codes only (`10 2 3` at the top of a page, or with a one-character scrap beside them, `10 -`, 132101):
    a near code (`near_code`). With a name of three characters or more: the names agree to one character,
    whatever the code reads (`13 小学校特別支援教育費` for `3`, 132055)."""
    from ingestion.generic.layout import normalize
    from ingestion.generic.tree import same_heading
    if len(normalize(name or '')) < 2:
        return near_code(previous_code, code)
    return len(normalize(name)) >= 3 and same_heading(previous_name, name)


def dense_limit(values: list[float]) -> float:
    """The right limit of a breakdown's names under OCR: the rightmost end that enough lines reach.

    Many long names reach the limit; a few lines run past it because OCR read an amount into the label
    (`度任用職員報酬2人4,26L400`, 132101). Printed text uses the longest line (`tree.line_limits`)."""
    values = sorted(values)
    enough = max(3, len(values) // 200)
    reached = [v for i, v in enumerate(values) if i + 1 >= enough and v - values[i + 1 - enough] <= 3]
    return reached[-1] if reached else values[-1]


def total_row(label: str) -> bool:
    """A total word alone on a line under OCR (`計 449,855,116` closing a 備考, 132055): a total row, though
    the shared dictionary knows `予算現額／計` as an amount kind. Printed text stacks `補正予算額` / `計` as
    kinds in one cell (132063), so this stays with OCR."""
    from ingestion.generic.tree import TOTAL
    return TOTAL.fullmatch(label) is not None
