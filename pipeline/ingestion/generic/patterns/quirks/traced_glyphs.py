"""Document quirk: the words of a page drawn twice are built again from the glyphs `mutool trace` lists, not from
pdfium's (目黒区の決算書 R5).

pdfium measures a glyph by the font it draws it with. A font the PDF does not embed (`HiraKakuPro-W6,Bold` for the
支出済額 column of 目黒区) is replaced by a system font, so the boxes change with the machine, and a machine with no
Japanese font drops the glyphs: the column heading is lost and the table cannot be read. MuPDF draws such a font with
its own built-in fonts, so the trace is the same on every machine.

A glyph prints when its box meets every clip it is drawn under (the intersection: the copy of each line, shifted
14.3 pt, is drawn under the half-page clip and its own cell, which do not meet) and no white box drawn after it
covers its centre (p61・p62: `271050400` under a white box, `271,050,400` printed on it)."""
SCOPE = 'document'
OPTIONS = {'const': True}

from html import unescape
from pathlib import Path
import re
import subprocess

TAG = re.compile(r'<(/?)(\w+)((?:\s+[\w-]+="[^"]*")*)\s*(/?)>?')
ATTRIBUTE = re.compile(r'([\w-]+)="([^"]*)"')
WHITE = 250 / 255  # each component of a fill at least this: paper, not ink
ASCENT, DESCENT = .88, -.12  # the em box of a glyph, in em
CLIPS = ('clip_path', 'clip_stroke_path', 'clip_text', 'clip_stroke_text', 'clip_image_mask')
NOTHING = (float('inf'), float('inf'), float('-inf'), float('-inf'))
SKIPPED = {' ', '　', '\n', '\r', '�'}


def _matrix(text: str | None) -> tuple:
    return tuple(float(v) for v in text.split()) if text else (1, 0, 0, 1, 0, 0)


def _apply(m: tuple, x: float, y: float) -> tuple[float, float]:
    return m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]


def _bounds(points: list[tuple[float, float]]) -> tuple:
    xs, ys = [p[0] for p in points], [p[1] for p in points]
    return (min(xs), min(ys), max(xs), max(ys)) if points else NOTHING


def _meet(a: tuple, b: tuple | None) -> tuple:
    if b is None:
        return a
    box = (max(a[0], b[0]), max(a[1], b[1]), min(a[2], b[2]), min(a[3], b[3]))
    return box if box[0] < box[2] and box[1] < box[3] else NOTHING


def trace(pdf_path: Path, number: int) -> str:
    from ingestion.generic.patterns.components.clipped_words import find_mutool
    return subprocess.run([find_mutool(None), 'trace', str(pdf_path), str(number)],
                          capture_output=True, check=True).stdout.decode('utf-8', 'replace')


def read(text: str, character_map: dict[str, str] | None = None) -> tuple[list, list]:
    """(box, character, visible) of every glyph a trace fills, and (box, visible) of every path it draws, in the
    page's top-left coordinates."""
    clips: list[tuple | None] = []
    glyphs: list[tuple[int, tuple, str, tuple]] = []  # (order, box, character, clip)
    patches: list[tuple[int, tuple]] = []
    strokes: list[tuple[tuple, bool]] = []  # (box, visible) of every path drawn, for the rules
    path: dict | None = None
    drawing: tuple | None = None  # the transform of the text being filled, None inside text that is not drawn
    span: tuple = (1, 0, 0, 1)
    order = 0
    for closing, name, attributes, empty in TAG.findall(text):
        attrs = {key: unescape(value) for key, value in ATTRIBUTE.findall(attributes)}
        order += 1
        if name in ('clip_path', 'clip_stroke_path', 'fill_path', 'stroke_path') and not closing:
            path = {'name': name, 'transform': _matrix(attrs.get('transform')), 'points': [], 'color': attrs.get('color', ''),
                    'alpha': float(attrs.get('alpha', 1))}
            if empty:
                closing = '/'
        if name in ('moveto', 'lineto') and path is not None:
            path['points'].append(_apply(path['transform'], float(attrs['x']), float(attrs['y'])))
        elif name == 'curveto' and path is not None:
            for x, y in (('x1', 'y1'), ('x2', 'y2'), ('x3', 'y3')):
                if x in attrs:
                    path['points'].append(_apply(path['transform'], float(attrs[x]), float(attrs[y])))
        if closing and path is not None and name == path['name']:
            box = _bounds(path['points'])
            if name in ('fill_path', 'stroke_path'):
                clip = _current(clips)
                strokes.append((box, clip is None or (box[0] <= clip[2] and box[2] >= clip[0] and box[1] <= clip[3] and box[3] >= clip[1])))
            if name == 'fill_path':
                colour = [float(v) for v in path['color'].split()]
                if colour and min(colour) >= WHITE and path['alpha'] >= 1 and len(colour) in (1, 3):
                    patches.append((order, _meet(box, _current(clips))))
            elif name != 'stroke_path':
                clips.append(box)
            path = None
            continue
        if name in CLIPS[2:] and not closing:
            clips.append(None)
            drawing = None
            if empty:
                continue
        elif name == 'pop_clip':
            if clips:
                clips.pop()
        elif name in ('fill_text', 'stroke_text') and not closing:
            drawing = _matrix(attrs.get('transform'))
        elif name in ('fill_text', 'stroke_text', 'clip_text', 'clip_stroke_text', 'ignore_text') and closing:
            drawing = None
        elif name == 'ignore_text' and not closing:
            drawing = None
        elif name == 'span' and not closing:
            span = _matrix(attrs.get('trm'))[:4]
        elif name == 'g' and drawing is not None:
            char = attrs.get('unicode', '')
            char = (character_map or {}).get(char, char)
            if not char or char in SKIPPED:
                continue
            x, y, advance = float(attrs['x']), float(attrs['y']), float(attrs.get('adv', 1))
            corners = [_apply(drawing, x + span[0] * u + span[2] * v, y + span[1] * u + span[3] * v)
                       for u in (0, advance) for v in (DESCENT, ASCENT)]
            glyphs.append((order, _bounds(corners), char, _current(clips)))
    found = []
    for drawn, box, char, clip in glyphs:
        visible = clip is None or (box[0] < clip[2] and box[2] > clip[0] and box[1] < clip[3] and box[3] > clip[1])
        if visible:
            x, y = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
            visible = not any(index > drawn and patch[0] < x < patch[2] and patch[1] < y < patch[3] for index, patch in patches)
        found.append((box, char, visible))
    return found, strokes


def _current(clips: list[tuple | None]) -> tuple | None:
    """The intersection of the clips in force (None: no clip limits the glyph)."""
    current = None
    for clip in clips:
        if clip is not None:
            current = clip if current is None else _meet(current, clip)
    return current


def glyphs(pdf_path: Path, number: int, character_map: dict[str, str] | None = None) -> tuple[list, list]:
    return read(trace(pdf_path, number), character_map)
