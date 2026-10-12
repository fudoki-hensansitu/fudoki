"""Stage 1: observe printed words and visible rules of a text PDF page.

Words come from Poppler (`pdftotext -bbox`), the same extraction the measured
converters use. Rules come from pdfplumber's vector objects: stroked lines and
thin filled rectangles in a dark colour. White background fills are not rules.
Coordinates are PDF points from the top-left of the displayed page.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
import json
import re
import subprocess
import tempfile
import xml.etree.ElementTree as ET


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


def words(pdf: Path, first: int, last: int) -> dict[int, tuple[float, float, list[Word]]]:
    with tempfile.TemporaryDirectory() as directory:
        output = Path(directory) / 'bbox.html'
        subprocess.run(['pdftotext', '-f', str(first), '-l', str(last), '-bbox', str(pdf), str(output)],
                       check=True)
        # Poppler copies control characters of broken font maps into the XML.
        source = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', '', output.read_text(errors='replace'))
        pages = {}
        for number, page in enumerate(ET.fromstring(source).findall('.//{*}page'), first):
            items = [Word(w.text or '', *(float(w.get(k)) for k in ('xMin', 'yMin', 'xMax', 'yMax')))
                     for w in page.findall('.//{*}word') if (w.text or '').strip()]
            pages[number] = (float(page.get('width')), float(page.get('height')), items)
    if len(pages) != last - first + 1:
        raise ValueError('Poppler returned an incomplete page range')
    return pages


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


def _segments(page) -> list[Rule]:
    rules = []
    for line in page.lines:
        if line.get('stroke', True) and _dark(line.get('stroking_color', 0)):
            x0, x1, y0, y1 = line['x0'], line['x1'], line['top'], line['bottom']
            if abs(x1 - x0) < 1:
                rules.append(Rule((x0 + x1) / 2, y0, (x0 + x1) / 2, y1))
            elif abs(y1 - y0) < 1:
                rules.append(Rule(x0, (y0 + y1) / 2, x1, (y0 + y1) / 2))
    for rect in page.rects:
        x0, x1, y0, y1 = rect['x0'], rect['x1'], rect['top'], rect['bottom']
        w, h = x1 - x0, y1 - y0
        if rect.get('fill') and _dark(rect.get('non_stroking_color')) and min(w, h) < 2:
            if w < h:
                rules.append(Rule((x0 + x1) / 2, y0, (x0 + x1) / 2, y1))
            else:
                rules.append(Rule(x0, (y0 + y1) / 2, x1, (y0 + y1) / 2))
        elif rect.get('stroke') and _dark(rect.get('stroking_color')):
            rules += [Rule(x0, y0, x1, y0), Rule(x0, y1, x1, y1), Rule(x0, y0, x0, y1), Rule(x1, y0, x1, y1)]
    return rules


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


def observe(pdf: Path, pages: list[int], cache: Path | None = None) -> list[Page]:
    """Observe the listed physical pages. A JSON cache keeps reruns cheap."""
    if cache is not None and cache.exists():
        data = json.loads(cache.read_text())
        if data['pages'] == pages:
            return [Page(p['number'], p['width'], p['height'], [Word(*w) for w in p['words']],
                         [Rule(*r) for r in p['rules']]) for p in data['observed']]
    import pdfplumber
    result = []
    first, last = min(pages), max(pages)
    poppler = words(pdf, first, last)
    with pdfplumber.open(pdf) as document:
        for number in pages:
            width, height, items = poppler[number]
            page = document.pages[number - 1]
            result.append(Page(number, width, height, items, merge_rules(_segments(page))))
            page.close()
    if cache is not None:
        cache.parent.mkdir(parents=True, exist_ok=True)
        cache.write_text(json.dumps({'pages': pages, 'observed': [
            {'number': p.number, 'width': p.width, 'height': p.height,
             'words': [[w.text, w.x0, w.y0, w.x1, w.y1] for w in p.words],
             'rules': [[r.x0, r.y0, r.x1, r.y1] for r in p.rules]} for p in result]}, ensure_ascii=False))
    return result
