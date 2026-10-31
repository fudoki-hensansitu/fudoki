"""Stage 1: observe printed words and visible rules of a text PDF page.

Words come from Poppler (`pdftotext -bbox`), the same extraction the measured
converters use. Rules come from pdfplumber's vector objects: stroked lines and
thin filled rectangles in a dark colour. White background fills are not rules.
Coordinates are PDF points from the top-left of the displayed page.
"""
from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field, replace
from pathlib import Path
import json
import re
import unicodedata
import subprocess
import tempfile
import xml.etree.ElementTree as ET
from xml.sax.saxutils import escape


@dataclass(frozen=True)
class Word:
    text: str
    x0: float
    y0: float
    x1: float
    y1: float


@dataclass(frozen=True)
class Rule:
    """A visible straight rule: vertical when x0 == x1, horizontal when y0 == y1."""
    x0: float
    y0: float
    x1: float
    y1: float

    @property
    def vertical(self) -> bool:
        return self.x0 == self.x1


@dataclass
class Page:
    number: int
    width: float
    height: float
    words: list[Word]
    rules: list[Rule] = field(default_factory=list)


def words(pdf: Path, first: int, last: int, character_map: dict[str, str] | None = None) -> dict[int, tuple[float, float, list[Word]]]:
    with tempfile.TemporaryDirectory() as directory:
        output = Path(directory) / 'bbox.html'
        subprocess.run(['pdftotext', '-f', str(first), '-l', str(last), '-bbox', str(pdf), str(output)],
                       check=True)
        # Poppler copies control characters of broken font maps into the XML.
        source = output.read_text(errors='replace')
        # Map only characters XML cannot represent; never rewrite XML tags or entities.
        invalid = r'[\x00-\x08\x0b\x0c\x0e-\x1f]'
        source = re.sub(invalid, lambda hit: escape((character_map or {}).get(hit[0], '')), source)
        pages = {}
        for number, page in enumerate(ET.fromstring(source).findall('.//{*}page'), first):
            items = [Word(w.text or '', *(float(w.get(k)) for k in ('xMin', 'yMin', 'xMax', 'yMax')))
                     for w in page.findall('.//{*}word') if (w.text or '').strip()]
            pages[number] = (float(page.get('width')), float(page.get('height')), items)
    if len(pages) != last - first + 1:
        raise ValueError('Poppler returned an incomplete page range')
    return pages


def _strokes(char: str) -> set[str]:
    """Which half-strokes (up, down, left, right) a box-drawing character draws."""
    name = unicodedata.name(char, '')
    tokens = set(name.split())
    found = {t.lower() for t in tokens & {'UP', 'DOWN', 'LEFT', 'RIGHT'}}
    if 'VERTICAL' in tokens:
        found |= {'up', 'down'}
    if 'HORIZONTAL' in tokens:
        found |= {'left', 'right'}
    return found


OPENING = '（〔【「『［｛'


def rule_glyphs(items: list[Word], chars: list | None = None) -> tuple[list[Word], list[Rule]]:
    """Some documents draw table rules as text (box-drawing characters ┃┯━…).
    Turn those characters into the rules a ruled table would carry and keep the other characters as words.
    `chars` are the page's characters (pdfplumber), which place each character of a word exactly; without
    them a word's characters are spread evenly over its box."""
    kept, rules = [], []
    for word in items:
        if not any('\u2500' <= c <= '\u257f' for c in word.text):
            kept.append(word)
            continue
        inside = sorted((c for c in chars or () if word.x0 - .5 <= (c['x0'] + c['x1']) / 2 <= word.x1 + .5
                         and word.y0 - 1 <= (c['top'] + c['bottom']) / 2 <= word.y1 + 1), key=lambda c: c['x0'])
        if [c['text'] for c in inside] == list(word.text):
            boxes = [(c['x0'], c['x1']) for c in inside]
        else:
            width = (word.x1 - word.x0) / len(word.text)
            boxes = [(word.x0 + i * width, word.x0 + (i + 1) * width) for i in range(len(word.text))]
        middle_y = (word.y0 + word.y1) / 2
        text, start = '', 0
        for index, char in enumerate(word.text):
            x0, x1 = boxes[index]
            middle_x = (x0 + x1) / 2
            strokes = _strokes(char) if '\u2500' <= char <= '\u257f' else None
            if strokes is None:
                if not text:
                    start = index
                text += char
                continue
            if text:
                kept.append(Word(text, boxes[start][0], word.y0, boxes[index - 1][1], word.y1))
                text = ''
            if strokes & {'up', 'down'}:
                rules.append(Rule(middle_x, word.y0 if 'up' in strokes else middle_y,
                                  middle_x, word.y1 if 'down' in strokes else middle_y))
            if strokes & {'left', 'right'}:
                rules.append(Rule(x0 if 'left' in strokes else middle_x, middle_y,
                                  x1 if 'right' in strokes else middle_x, middle_y))
        if text:
            kept.append(Word(text, boxes[start][0], word.y0, boxes[-1][1], word.y1))
    return kept, rules


def drop_hidden_copies(pdf: Path, number: int, width: float, items: list[Word]) -> list[Word]:
    """Some documents print every word twice, the second copy a fixed distance to the side and not visible
    (a layer the page's clip hides): Poppler reads both. A page where a good share of the words have a twin at one
    common distance is rendered, and in each half of the page the words of the side that shows no ink are dropped."""
    by_place: dict[tuple, list[int]] = {}
    for index, word in enumerate(items):
        by_place.setdefault((word.text, round(word.y0)), []).append(index)
    shifts = Counter()
    for members in by_place.values():
        for a in members:
            for b in members:
                gap = items[b].x0 - items[a].x0
                if 5 < gap < 80 and abs(items[b].y0 - items[a].y0) < .3:
                    shifts[round(gap, 1)] += 1
    if not shifts:
        return items
    shift, count = shifts.most_common(1)[0]
    if count < max(50, .35 * len(items)):  # a copy of nearly every word, not repeated figures of one column spacing
        return items
    pairs = []
    for members in by_place.values():
        for a in members:
            for b in members:
                if abs(items[b].x0 - items[a].x0 - shift) < .6 and abs(items[b].y0 - items[a].y0) < .3:
                    pairs.append((a, b))
    import numpy as np
    from PIL import Image
    with tempfile.TemporaryDirectory() as directory:
        subprocess.run(['pdftoppm', '-f', str(number), '-l', str(number), '-r', '144', '-gray', '-png', str(pdf),
                        str(Path(directory) / 'page')], check=True)
        image = np.array(Image.open(next(Path(directory).glob('page*.png'))).convert('L'))
    scale = image.shape[1] / width

    def ink(word: Word) -> float:
        region = image[int(word.y0 * scale):int(word.y1 * scale) + 1, int(word.x0 * scale):int(word.x1 * scale) + 1]
        return float((region < 160).mean()) if region.size else 0.
    votes = {False: Counter(), True: Counter()}  # right half: which copy shows ink
    for a, b in pairs:
        difference = ink(items[a]) - ink(items[b])
        if abs(difference) > .06:
            votes[items[a].x0 > width / 2]['first' if difference > 0 else 'second'] += 1
    dropped = set()
    for a, b in pairs:
        vote = votes[items[a].x0 > width / 2]
        if vote['first'] > 2 * vote['second']:
            dropped.add(b)
        elif vote['second'] > 2 * vote['first']:
            dropped.add(a)
    return [word for index, word in enumerate(items) if index not in dropped]


def _dark(color) -> bool:
    if color is None:
        return False
    values = color if isinstance(color, (list, tuple)) else (color,)
    values = [float(v) for v in values if isinstance(v, (int, float))]
    if not values:
        return False
    if len(values) == 4:  # CMYK: dark when the key channel or all inks are high
        return values[3] > .5 or min(values[:3]) > .5
    return max(values) < .5


SHOWN_SHARE = 4  # light rules at least this many times the dark ones are the table's (see `_segments`)


def _segments(page, pdf: Path | None = None) -> list[Rule]:
    rules = []
    unread = []  # thin filled rectangles whose colour the reader gives as light
    for line in page.lines:
        if line.get('stroke', True) and _dark(line.get('stroking_color', 0)):
            x0, x1, y0, y1 = line['x0'], line['x1'], line['top'], line['bottom']
            if abs(x1 - x0) < 1:
                rules.append(Rule((x0 + x1) / 2, y0, (x0 + x1) / 2, y1))
            elif abs(y1 - y0) < 1:
                rules.append(Rule(x0, (y0 + y1) / 2, x1, (y0 + y1) / 2))
        elif line.get('stroke', True) and max(line['x1'] - line['x0'], line['bottom'] - line['top']) > 20 \
                and min(line['x1'] - line['x0'], line['bottom'] - line['top']) < 1:
            unread.append(line)  # a stroke in a spot colour the reader gives as 1.0: checked on the rendered page below
    for rect in page.rects:
        x0, x1, y0, y1 = rect['x0'], rect['x1'], rect['top'], rect['bottom']
        w, h = x1 - x0, y1 - y0
        if rect.get('fill') and not _dark(rect.get('non_stroking_color')) and min(w, h) < 2 and max(w, h) > 20:
            unread.append(rect)
        if rect.get('fill') and _dark(rect.get('non_stroking_color')) and min(w, h) < 2:
            if w < h:
                rules.append(Rule((x0 + x1) / 2, y0, (x0 + x1) / 2, y1))
            else:
                rules.append(Rule(x0, (y0 + y1) / 2, x1, (y0 + y1) / 2))
        elif rect.get('stroke') and _dark(rect.get('stroking_color')) and not (w > .98 * page.width and h > .98 * page.height):  # a page-sized border is not a table's
            rules += [Rule(x0, y0, x1, y0), Rule(x0, y1, x1, y1), Rule(x0, y0, x0, y1), Rule(x1, y0, x1, y1)]
    # Printer's marks lie outside the page: they are neither rules of the table nor a reason to read none.
    left, top, right, bottom = page.cropbox  # pdfplumber measures it from the top, like the rules
    left, right, top, bottom = left - 1, right + 1, top - 1, bottom + 1
    onpage = lambda x0, x1, y0, y1: x0 >= left and y0 >= top and x1 <= right and y1 <= bottom
    shown = [r for r in rules if onpage(r.x0, r.x1, r.y0, r.y1)]
    # A white sliver as long as the page (the trim of 130001's spread) is not a rule either: it shows no ink.
    across = lambda r: r['bottom'] - r['top'] > .98 * page.height or r['x1'] - r['x0'] > .98 * page.width
    unread = [r for r in unread if onpage(r['x0'], r['x1'], r['top'], r['bottom']) and not across(r)]
    # A few dark strokes beside the table (a box drawn in the 備考 column, 130001) are not its rules either: the table's
    # are still the light ones, when they far outnumber the dark.
    if pdf is not None and len(unread) >= 6 and len(shown) * SHOWN_SHARE <= len(unread) and _drawn_dark(pdf, page, unread):
        rules = rules if shown else []  # what is drawn outside the page was all there was: the marks, not the table's rules
        for rect in unread:  # a spot colour read as 1.0 draws black: the rule is there when the page shows ink on it
            x0, x1, y0, y1 = rect['x0'], rect['x1'], rect['top'], rect['bottom']
            rules.append(Rule((x0 + x1) / 2, y0, (x0 + x1) / 2, y1) if x1 - x0 < y1 - y0
                         else Rule(x0, (y0 + y1) / 2, x1, (y0 + y1) / 2))
    return rules


def _drawn_dark(pdf: Path, page, rects: list[dict]) -> bool:
    """Whether the page, rendered, shows ink along the longest of these light-coloured thin rectangles."""
    import numpy as np
    from PIL import Image
    with tempfile.TemporaryDirectory() as directory:
        subprocess.run(['pdftoppm', '-f', str(page.page_number), '-l', str(page.page_number), '-r', '144', '-gray', '-png',
                        str(pdf), str(Path(directory) / 'page')], check=True)
        image = np.array(Image.open(next(Path(directory).glob('page*.png'))).convert('L'))
    scale = image.shape[1] / float(page.width)
    longest = sorted(rects, key=lambda r: -max(r['x1'] - r['x0'], r['bottom'] - r['top']))[:5]
    dark = []
    for rect in longest:
        y0, y1 = int(rect['top'] * scale), int(rect['bottom'] * scale) + 1
        x0, x1 = int(rect['x0'] * scale), int(rect['x1'] * scale) + 1
        region = image[max(y0 - 1, 0):y1 + 1, max(x0 - 1, 0):x1 + 1]
        dark.append(bool(region.size) and float(region.min(axis=0 if x1 - x0 > y1 - y0 else 1).mean()) < 128)
    return all(dark)


def merge_rules(rules: list[Rule], tolerance: float = 2.5, gap: float = 2.0) -> list[Rule]:
    """Merge parallel rules drawn as several thin strokes and join collinear pieces."""
    merged = []
    for vertical in (True, False):
        items = sorted((r for r in rules if r.vertical == vertical),
                       key=lambda r: (r.x0, r.y0) if vertical else (r.y0, r.x0))
        groups: list[list[Rule]] = []
        for rule in items:
            position = rule.x0 if vertical else rule.y0
            if groups and position - (groups[-1][0].x0 if vertical else groups[-1][0].y0) <= tolerance:
                groups[-1].append(rule)
            else:
                groups.append([rule])
        for group in groups:
            position = sum(r.x0 if vertical else r.y0 for r in group) / len(group)
            spans = sorted((r.y0, r.y1) if vertical else (r.x0, r.x1) for r in group)
            joined = [list(spans[0])]
            for start, end in spans[1:]:
                if start <= joined[-1][1] + gap:
                    joined[-1][1] = max(joined[-1][1], end)
                else:
                    joined.append([start, end])
            for start, end in joined:
                if end - start >= 3:
                    merged.append(Rule(position, start, position, end) if vertical
                                  else Rule(start, position, end, position))
    return merged


def observe(pdf: Path, pages: list[int], cache: Path | None = None,
            character_map: dict[str, str] | None = None) -> list[Page]:
    """Observe the listed physical pages. A JSON cache keeps reruns cheap."""
    if cache is not None and cache.exists():
        data = json.loads(cache.read_text())
        if data['pages'] == pages and data.get('character_map', {}) == (character_map or {}):
            return [Page(p['number'], p['width'], p['height'], [Word(*w) for w in p['words']],
                         [Rule(*r) for r in p['rules']]) for p in data['observed']]
    import pdfplumber
    result = []
    first, last = min(pages), max(pages)
    poppler = words(pdf, first, last, character_map)
    with pdfplumber.open(pdf) as document:
        for number in pages:
            width, height, items = poppler[number]
            page = document.pages[number - 1]
            items = drop_hidden_copies(pdf, number, width, items)
            items, glyph_rules = rule_glyphs(items, page.chars)
            result.append(Page(number, width, height, items, merge_rules(_segments(page, pdf) + glyph_rules)))
            page.close()
    if cache is not None:
        cache.parent.mkdir(parents=True, exist_ok=True)
        cache.write_text(json.dumps({'pages': pages, 'character_map': character_map or {}, 'observed': [
            {'number': p.number, 'width': p.width, 'height': p.height,
             'words': [[w.text, w.x0, w.y0, w.x1, w.y1] for w in p.words],
             'rules': [[r.x0, r.y0, r.x1, r.y1] for r in p.rules]} for p in result]}, ensure_ascii=False))
    return result
