"""Stage 1b: repair the text layer before bands. No jurisdiction, page or coordinate is configured.

1. Invisible glyphs: a text object drawn outside its clipping path leaves no
   ink. Some PDFs draw a spread twice and clip each copy to one half
   (131172), so Poppler reports every glyph twice. pdfium exposes each text
   object's clip; a character is dropped when the only objects drawing it at
   its position are clipped away. Exact repeats at the same position collapse.
2. Position repairs: single glyphs overlapping at one position are one printed
   character split by the font (分 as 八 + 刀); digits, commas and minus signs
   touching on one line are one amount (`1 3 , 4 6 3` drawn glyph by glyph).
3. Known misreadings: `pipeline/shared/text_repairs.csv` (wrong, right,
   optional context regex, reason). They are applied only to documents judged
   broken by `is_broken`, whose criterion and threshold live here, so a
   legitimate word elsewhere is not rewritten. Every hit is counted with
   examples for review.
"""
from __future__ import annotations

from collections import Counter, defaultdict
import csv
import ctypes
from dataclasses import dataclass, field
from functools import cache
from pathlib import Path
import re
import unicodedata

from ingestion.generic.observe import Page, Word

REPAIRS = Path(__file__).resolve().parents[2] / 'shared/text_repairs.csv'
NUMERIC = re.compile(r'^[0-9,△▲\-]+$')
# Health criteria (one place). A document is broken when known multi-character
# misreadings are frequent. Pages without the common column headings are
# recorded but do not decide: a narrative report (132012) has none, and judging
# it broken rewrote correct words (捕獲→捕護, 関連動画→関運動画, 大栗川→大票川).
CORE_HEADINGS = ('支出済額', '不用額', '予算現額', '当初予算額', '予算額', '決算額', '備考', '説明')
MISREADINGS_PER_10K = 2.0      # multi-character dictionary misreadings per 10,000 characters
REBUILD_SHARE = 0.2            # invisible share of a page's glyphs above which words are rebuilt from glyphs


@dataclass
class Report:
    hidden_glyphs: int = 0
    hidden_rules: int = 0
    duplicate_words: int = 0
    composite_glyphs: int = 0
    joined_numbers: int = 0
    health: dict = field(default_factory=dict)
    broken: bool = False
    hits: Counter = field(default_factory=Counter)
    examples: dict = field(default_factory=lambda: defaultdict(list))

    def as_dict(self) -> dict:
        return {'hidden_glyphs': self.hidden_glyphs, 'hidden_rules': self.hidden_rules, 'duplicate_words': self.duplicate_words,
                'composite_glyphs': self.composite_glyphs, 'joined_numbers': self.joined_numbers,
                'health': self.health, 'broken': self.broken, 'repairs': sum(self.hits.values()),
                'hits': dict(self.hits.most_common()), 'examples': {k: v[:5] for k, v in self.examples.items()}}


@cache
def rules() -> tuple[tuple[str, str, re.Pattern | None], ...]:
    with REPAIRS.open() as stream:
        return tuple((row['wrong'], row['right'], re.compile(row['context']) if row['context'] else None)
                     for row in csv.DictReader(stream))


# --- 1. invisible glyphs -----------------------------------------------------

def _glyphs(pdf, number: int):
    """(box, character, visible) of every drawn character, in Poppler's top-left coordinates.

    Visibility belongs to the text object that draws the character: visible
    when it has no clip or its bounds meet the clip.
    """
    import pypdfium2.raw as raw
    page = pdf[number - 1]
    left, _, _, top = page.get_cropbox()
    textpage = page.get_textpage()
    clips: dict[int, tuple | None] = {}

    def clip_of(handle):
        """The clip rectangle of an object (page space), or None when it has none."""
        address = ctypes.cast(handle, ctypes.c_void_p).value
        if address not in clips:
            clip = raw.FPDFPageObj_GetClipPath(handle)
            box = None
            if clip and raw.FPDFClipPath_CountPaths(clip) > 0:
                xs, ys = [], []
                for i in range(raw.FPDFClipPath_CountPaths(clip)):
                    for j in range(raw.FPDFClipPath_CountPathSegments(clip, i)):
                        segment = raw.FPDFClipPath_GetPathSegment(clip, i, j)
                        x, y = ctypes.c_float(), ctypes.c_float()
                        raw.FPDFPathSegment_GetPoint(segment, x, y)
                        xs.append(x.value); ys.append(y.value)
                box = (min(xs), min(ys), max(xs), max(ys)) if xs else None
            clips[address] = box
        return clips[address]

    def inside(box, clip) -> bool:
        # box and clip as (left, bottom, right, top) in PDF space
        return clip is None or (box[0] < clip[2] and box[2] > clip[0] and box[1] < clip[3] and box[3] > clip[1])

    paths = []
    for index in range(raw.FPDFPage_CountObjects(page.raw)):
        handle = raw.FPDFPage_GetObject(page.raw, index)
        if raw.FPDFPageObj_GetType(handle) == raw.FPDF_PAGEOBJ_PATH:
            l, b, r, t = (ctypes.c_float() for _ in range(4))
            raw.FPDFPageObj_GetBounds(handle, l, b, r, t)
            paths.append(((l.value - left, top - t.value, r.value - left, top - b.value),
                          inside((l.value, b.value, r.value, t.value), clip_of(handle))))
    found = []
    for index in range(textpage.count_chars()):
        code = raw.FPDFText_GetUnicode(textpage.raw, index)
        if code in (0, 10, 13, 32, 0x3000):
            continue
        l, r, b, t = (ctypes.c_double() for _ in range(4))
        if not raw.FPDFText_GetCharBox(textpage.raw, index, l, r, b, t):
            continue
        handle = raw.FPDFText_GetTextObject(textpage.raw, index)
        # The character box is in page space; compare it, not the object's bounds,
        # with the clip (object bounds come back in another space on some PDFs).
        found.append(((l.value - left, top - t.value, r.value - left, top - b.value), chr(code),
                      inside((l.value, b.value, r.value, t.value), clip_of(handle)) if handle else True))
    textpage.close(); page.close()
    return found, paths


def _drawn(rule, paths) -> bool:
    """A rule is ink unless clipped-away strokes are almost all that cover it.

    Only strokes thin across the rule count; a path whose bounds span the whole
    grid says nothing about one line.
    """
    length = {True: 0.0, False: 0.0}
    for (x0, y0, x1, y1), visible in paths:
        if rule.vertical:
            if x1 - x0 < 6 and x0 - 1.5 <= rule.x0 <= x1 + 1.5:
                length[visible] += max(0.0, min(y1, rule.y1) - max(y0, rule.y0))
        elif y1 - y0 < 6 and y0 - 1.5 <= rule.y0 <= y1 + 1.5:
            length[visible] += max(0.0, min(x1, rule.x1) - max(x0, rule.x0))
    # A ghost line has no visible stroke at all; a real line merged with its
    # shifted ghost keeps a visible share.
    return not length[False] or length[True] > .1 * (length[True] + length[False])


def words_from_glyphs(glyphs: list[tuple[tuple[float, float, float, float], str]], report: Report,
                      rules: list | None = None) -> list[Word]:
    """Glyphs into words: neighbours that overlap vertically and sit close, never across a vertical rule."""
    verticals = [r for r in rules or [] if r.vertical]
    unique: list[tuple[tuple[float, float, float, float], str]] = []
    for box, char in sorted(glyphs, key=lambda g: ((g[0][1] + g[0][3]) / 2, g[0][0])):
        if any(char == other and abs(box[0] - b[0]) < 1 and abs(box[1] - b[1]) < 1 for b, other in unique[-8:]):
            report.duplicate_words += 1  # a glyph struck twice (bold by overprint)
            continue
        unique.append((box, char))
    # Glyphs that are horizontally close and overlap vertically form one word
    # (union of neighbours). Small marks such as commas sit low but still overlap.
    order = sorted(range(len(unique)), key=lambda i: unique[i][0][0])
    parent = list(range(len(unique)))

    def root(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for position, i in enumerate(order):
        a = unique[i][0]
        for j in order[position + 1:]:
            b = unique[j][0]
            height = max(a[3] - a[1], b[3] - b[1], 1)
            if b[0] - a[2] > .8 * height:
                break
            if min(a[3], b[3]) - max(a[1], b[1]) >= .3 * min(a[3] - a[1], b[3] - b[1]) and not any(
                    a[2] - .5 <= r.x0 <= b[0] + .5 and r.y0 <= (a[1] + a[3]) / 2 <= r.y1 for r in verticals):
                parent[root(j)] = root(i)
    groups: dict[int, list] = defaultdict(list)
    for i in order:
        groups[root(i)].append(unique[i])
    return [_word(members) for members in groups.values()]


def _word(glyphs: list) -> Word:
    return Word(''.join(char for _, char in glyphs), min(b[0] for b, _ in glyphs), min(b[1] for b, _ in glyphs),
                max(b[2] for b, _ in glyphs), max(b[3] for b, _ in glyphs))


def _without_hidden(words: list[Word], glyphs) -> list[Word]:
    """Remove from Poppler's words the characters whose nearest drawing of the same character is invisible."""
    grid: dict[int, list] = defaultdict(list)
    for glyph in glyphs:
        grid[int(((glyph[0][0] + glyph[0][2]) / 2) // 20)].append(glyph)
    kept: list[Word] = []
    for word in words:
        width = (word.x1 - word.x0) / max(len(word.text), 1)
        flags = []
        for index, char in enumerate(word.text):
            cx, cy = word.x0 + (index + .5) * width, (word.y0 + word.y1) / 2
            near = [(abs((x0 + x1) / 2 - cx), visible) for cell in (-1, 0, 1)
                    for (x0, y0, x1, y1), value, visible in grid[int(cx // 20) + cell]
                    if value == char and abs((x0 + x1) / 2 - cx) <= max(2.0, width) and y0 - 2 <= cy <= y1 + 2]
            flags.append(not near or min(near)[1])
        start = None
        for index, flag in enumerate(flags + [False]):
            if flag and start is None:
                start = index
            elif not flag and start is not None:
                kept.append(Word(word.text[start:index], word.x0 + start * width, word.y0, word.x0 + index * width, word.y1))
                start = None
    return kept


def drop_invisible(pdf_path: Path, pages: list[Page], report: Report) -> None:
    import pypdfium2 as pdfium
    pdf = pdfium.PdfDocument(str(pdf_path))
    try:
        for page in pages:
            glyphs, paths = _glyphs(pdf, page.number)
            # Glyphs placed off the page are not on it at all (Poppler skips them);
            # only invisible glyphs on the page call for a rebuild.
            glyphs = [g for g in glyphs if g[0][2] > 0 and g[0][0] < page.width and g[0][3] > 0 and g[0][1] < page.height]
            if all(visible for _, _, visible in glyphs):
                continue  # rules are filtered only on pages that draw invisible text
            drawn = [rule for rule in page.rules if _drawn(rule, paths)]
            report.hidden_rules += len(page.rules) - len(drawn)
            page.rules = drawn
            hidden = sum(1 for _, _, visible in glyphs if not visible)
            report.hidden_glyphs += hidden
            if hidden >= REBUILD_SHARE * len(glyphs):
                # Most of the page is drawn twice: rebuild its words from the visible
                # glyphs, whose boxes are exact, instead of Poppler's words.
                page.words = words_from_glyphs([(box, char) for box, char, visible in glyphs if visible], report, page.rules)
            else:
                page.words = _without_hidden(page.words, glyphs)
    finally:
        pdf.close()


# --- 2. position repairs -----------------------------------------------------

def _same_line(a: Word, b: Word) -> bool:
    overlap = min(a.y1, b.y1) - max(a.y0, b.y0)
    return overlap >= .5 * min(a.y1 - a.y0, b.y1 - b.y0)


def repair_positions(page: Page, report: Report) -> None:
    words = sorted(page.words, key=lambda w: (round((w.y0 + w.y1) / 2), w.x0))
    result: list[Word] = []
    for word in words:
        twin = next((w for w in result[-6:] if w.text == word.text and abs(w.x0 - word.x0) < .6
                     and abs(w.y0 - word.y0) < .6), None)
        if twin is not None:
            report.duplicate_words += 1  # the same glyph struck twice
            continue
        previous = result[-1] if result else None
        if previous is not None and _same_line(previous, word):
            overlap = min(previous.x1, word.x1) - max(previous.x0, word.x0)
            narrow = min(previous.x1 - previous.x0, word.x1 - word.x0)
            if (len(previous.text) == 1 and len(word.text) == 1 and not NUMERIC.match(previous.text + word.text)
                    and overlap >= .6 * narrow):
                result[-1] = Word(previous.text + word.text, min(previous.x0, word.x0), min(previous.y0, word.y0),
                                  max(previous.x1, word.x1), max(previous.y1, word.y1))
                report.composite_glyphs += 1  # one printed character drawn as two glyphs
                continue
            if (NUMERIC.match(previous.text) and NUMERIC.match(word.text) and word.x0 > previous.x0
                    and -.5 * (word.x1 - word.x0) <= word.x0 - previous.x1 <= 1.0):
                result[-1] = Word(previous.text + word.text, previous.x0, min(previous.y0, word.y0),
                                  max(previous.x1, word.x1), max(previous.y1, word.y1))
                report.joined_numbers += 1
                continue
        result.append(word)
    page.words = result


# --- 3. health and known misreadings --------------------------------------------

def _lines(page: Page) -> list[str]:
    rows: list[list[Word]] = []
    for word in sorted(page.words, key=lambda w: ((w.y0 + w.y1) / 2, w.x0)):
        if rows and _same_line(rows[-1][-1], word):
            rows[-1].append(word)
        else:
            rows.append([word])
    return [''.join(w.text for w in sorted(row, key=lambda w: w.x0)) for row in rows]


def health(pages: list[Page]) -> dict:
    text = [re.sub(r'\s+', '', unicodedata.normalize('NFKC', line)) for page in pages for line in _lines(page)]
    without = sum(1 for page in pages
                  if not any(h in re.sub(r'\s+', '', ''.join(_lines(page))) for h in CORE_HEADINGS))
    characters = sum(len(line) for line in text) or 1
    misreadings = sum(line.count(wrong) for line in text for wrong, _, context in rules() if len(wrong) > 1 and not context)
    return {'pages': len(pages), 'pages_without_headings': without,
            'missing_headings_ratio': round(without / max(len(pages), 1), 3),
            'misreadings': misreadings, 'misreadings_per_10k': round(misreadings * 10000 / characters, 2)}


def is_broken(measure: dict) -> bool:
    return measure['misreadings_per_10k'] >= MISREADINGS_PER_10K


def apply_dictionary(page: Page, report: Report) -> None:
    repaired = []
    for word in page.words:
        value = word.text
        for wrong, right, context in rules():
            if wrong not in value:
                continue
            if context is None:
                count = value.count(wrong)
                fixed = value.replace(wrong, right)
            else:
                spans = [m.span() for m in context.finditer(value)]
                pieces, cursor, count = [], 0, 0
                for found in re.finditer(re.escape(wrong), value):
                    if any(a <= found.start() and found.end() <= b for a, b in spans):
                        pieces.append(value[cursor:found.start()] + right)
                        cursor = found.end(); count += 1
                fixed = ''.join(pieces) + value[cursor:]
            if count:
                key = f'{wrong}→{right}'
                report.hits[key] += count
                if len(report.examples[key]) < 5:
                    report.examples[key].append({'page': page.number, 'before': value, 'after': fixed})
                value = fixed
        repaired.append(Word(value, word.x0, word.y0, word.x1, word.y1) if value != word.text else word)
    page.words = repaired


def repair(pdf_path: Path | None, pages: list[Page]) -> tuple[list[Page], Report]:
    report = Report()
    if pdf_path is not None and pdf_path.exists():
        drop_invisible(pdf_path, pages, report)
    for page in pages:
        repair_positions(page, report)
    report.health = health(pages)
    report.broken = is_broken(report.health)
    if report.broken:
        for page in pages:
            apply_dictionary(page, report)
    return pages, report
