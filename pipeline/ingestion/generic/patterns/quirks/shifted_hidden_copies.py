"""Document quirk: the text layer holds a second copy of every line, a fixed distance to the side, that prints no ink,
and the clip of the placed page does not tell it from the printed one (世田谷区の予算説明書 2025, the copy `113.6` pt
left of the printed line: `11 地域包括支援センター…` read twice, the two copies run together into one word). The
distance changes from page to page (112.9 to 120.3 pt), so each page's is the commonest distance between two glyphs of
one character on one line. Read in `repair.drop_invisible`, before the words are built again from the visible glyphs.

The rules are read again the same way, from the rectangles that show ink (`rules`).

Poppler's words cannot be kept: where the two copies overlap on a line, Poppler joins them into one word. The words
are built from the glyphs with a narrow gap (`GAP` line heights) between a figure and a letter: the document sets a code
a space apart from its name (`01 社会福祉総務費`, 1.8 pt at 9 pt). The figures of an amount keep the usual gap
(`130, 034` sets a space after the comma), and so do the letters of a name.

A glyph with a twin of the same character at the distance on its line is a copy. Which of the two prints is decided
on each half of the page by the pairs the clip tells apart and, for the others, by the render (the box that shows ink
where its twin's does not). The clip is wrong where the copy falls on printed text of the next column, so the render
alone cannot settle those pairs: the side the half votes for is kept and the other is hidden.
"""
from __future__ import annotations

from collections import Counter
from pathlib import Path
import subprocess
import tempfile

SCOPE = 'document'
OPTIONS = {'const': True}

PLACE = .6        # pt: how far off the line a twin may sit
REACH = (60, 200)  # pt: the distances a copy is looked for at
SPREAD = .6        # pt: how far a twin may sit from the page's distance (`120.1` to `120.3` on one page)
HAIR = (1., 3.)    # pt: the distances of a copy struck over the printed glyph
LEAST = 20         # pairs at one distance that make a page one with a copy
INK = .06
GAP = .15   # line heights between a figure and a letter of one word
FIGURE = set('0123456789,△▲')    # share of dark pixels by which one copy shows more ink than its twin


def render(pdf: Path, number: int):
    import numpy as np
    from PIL import Image
    with tempfile.TemporaryDirectory() as directory:
        subprocess.run(['pdftoppm', '-f', str(number), '-l', str(number), '-r', '144', '-gray', '-png', str(pdf),
                        str(Path(directory) / 'page')], check=True)
        return np.array(Image.open(next(Path(directory).glob('page*.png'))).convert('L'))


def hide(pdf: Path, number: int, width: float, glyphs: list, image=None) -> list:
    """`glyphs` are `(box, char, visible)`; the hidden copies come back as not visible."""
    by_line: dict[str, list[int]] = {}
    for index, (box, char, visible) in enumerate(glyphs):
        if not char.isspace():
            by_line.setdefault(char, []).append(index)
    # A copy set a hair off the printed glyph (2 pt on 世田谷 p9, both drawn per the clip) prints on top of it: one of
    # the two is kept, as a glyph struck twice is.
    doubled = set()
    for members in by_line.values():
        for a in members:
            for b in members:
                if glyphs[a][2] and glyphs[b][2] and a not in doubled and HAIR[0] < glyphs[b][0][0] - glyphs[a][0][0] < HAIR[1] \
                        and abs(glyphs[b][0][1] - glyphs[a][0][1]) < PLACE:
                    doubled.add(b)
    if doubled:
        glyphs = [(box, char, False) if index in doubled else (box, char, visible)
                  for index, (box, char, visible) in enumerate(glyphs)]
    distances = Counter()
    for members in by_line.values():
        for a in members:
            for b in members:
                gap = glyphs[b][0][0] - glyphs[a][0][0]
                if REACH[0] < gap < REACH[1] and abs(glyphs[b][0][1] - glyphs[a][0][1]) < PLACE:
                    distances[round(gap, 1)] += 1
    if not distances or distances.most_common(1)[0][1] < LEAST:
        return glyphs
    shift = distances.most_common(1)[0][0]
    pairs = []
    for members in by_line.values():
        for a in members:
            for b in members:
                if abs(glyphs[b][0][0] - glyphs[a][0][0] - shift) < SPREAD and abs(glyphs[b][0][1] - glyphs[a][0][1]) < PLACE:
                    pairs.append((a, b))
    if not pairs:
        return glyphs
    image = render(pdf, number) if image is None else image
    scale = image.shape[1] / width

    def ink(box) -> float:
        region = image[int(box[1] * scale):int(box[3] * scale) + 1, int(box[0] * scale):int(box[2] * scale) + 1]
        return float((region < 160).mean()) if region.size else 0.
    votes = {False: Counter(), True: Counter()}  # by half of the page: which copy shows ink
    for a, b in pairs:
        if glyphs[a][2] != glyphs[b][2]:  # the clip told the two apart
            votes[glyphs[a][0][0] > width / 2]['first' if glyphs[a][2] else 'second'] += 1
            continue
        difference = ink(glyphs[a][0]) - ink(glyphs[b][0])
        if abs(difference) > INK:
            votes[glyphs[a][0][0] > width / 2]['first' if difference > 0 else 'second'] += 1
    hidden, kept = set(), set()
    for a, b in pairs:
        if glyphs[a][2] != glyphs[b][2]:
            kept.add(a if glyphs[a][2] else b)
            continue
        vote = votes[glyphs[a][0][0] > width / 2]
        if vote['first'] > 2 * vote['second']:
            hidden.add(b)
        elif vote['second'] > 2 * vote['first']:
            hidden.add(a)
    # A printed glyph may have a printed twin of its own at the distance (`特財：…、特別区債`, the two 特 114 pt apart):
    # a glyph whose copy the clip hides is the printed one, and is not hidden as the copy of another.
    hidden = {i for i in hidden - kept if glyphs[i][2]}
    return [(box, char, False) if index in hidden else (box, char, visible)
            for index, (box, char, visible) in enumerate(glyphs)]


def rules(pdf: Path, number: int, width: float, image=None) -> list:
    """The page's rules: its thin rectangles that show ink along their length. The frame is drawn twice too, in a spot
    colour the reader gives as light, and the copy shows none: read together, the copy's rules made the page's light
    rules look undrawn and the page lost them all."""
    import pdfplumber
    from ingestion.generic.observe import Rule, merge_rules
    image = render(pdf, number) if image is None else image
    scale = image.shape[1] / width
    found = []
    with pdfplumber.open(pdf) as document:
        page = document.pages[number - 1]
        for rect in page.rects:
            x0, x1, y0, y1 = rect['x0'], rect['x1'], rect['top'], rect['bottom']
            if not (min(x1 - x0, y1 - y0) < 2 and max(x1 - x0, y1 - y0) > 3):
                continue
            region = image[max(int(y0 * scale) - 1, 0):int(y1 * scale) + 2, max(int(x0 * scale) - 1, 0):int(x1 * scale) + 2]
            along = x1 - x0 > y1 - y0
            if region.size and float((region.min(axis=0 if along else 1) < 128).mean()) > .9:
                found.append(Rule((x0 + x1) / 2, y0, (x0 + x1) / 2, y1) if not along else Rule(x0, (y0 + y1) / 2, x1, (y0 + y1) / 2))
        page.close()
    return merge_rules(found)


def joins(left: str, right: str) -> float:
    """The gap in line heights that still joins the two characters into one word."""
    return .8 if (left in FIGURE) == (right in FIGURE) else GAP


TOUCH = 1.  # pt: the slack of a 、 against the words beside it (its glyph is narrow: the word after it starts
            # up to an em after its box, the rest of its advance)


def rejoin(words: list) -> list:
    """The ideographic comma sits low on its line, below the half of the line the glyphs must share to be one word:
    joined back to the words it touches (`48,837、その他`), as Poppler reads it."""
    from ingestion.generic.observe import Word
    marks = [w for w in words if w.text == '、']
    rest = [w for w in words if w.text != '、']
    for mark in marks:
        left = next((w for w in rest if -TOUCH < mark.x0 - w.x1 < 2 * TOUCH and w.y0 < mark.y1 and mark.y0 < w.y1), None)
        right = next((w for w in rest if -TOUCH < w.x0 - mark.x1 < w.y1 - w.y0 and w.y0 < mark.y1 and mark.y0 < w.y1), None)
        if left is None and right is None:
            rest.append(mark)
            continue
        parts = [w for w in (left, mark, right) if w is not None]
        for w in (left, right):
            if w is not None:
                rest.remove(w)
        line = left or right
        rest.append(Word(''.join(w.text for w in parts), parts[0].x0, line.y0, parts[-1].x1, line.y1))
    return rest
