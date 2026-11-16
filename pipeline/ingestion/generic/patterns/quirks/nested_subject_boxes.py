"""Document quirk: the 款・項・目 print in one column of nested boxes, each level's box drawn a few points right of its
parent's (小笠原村 R5 当初予算). OCR boxes a line up to 2pt off its print, while the names start only 2pt apart: where
a line starts tells no level. The box tells it: a word of the frame's first column starts where the innermost box
around it starts, so a 項 starts at its box's rule and a 目 at its own, 5–6pt apart."""
from dataclasses import replace

SCOPE = 'document'
OPTIONS = {'const': True}
PAD = 1.5  # pt right of the box's rule
COLUMN = .8  # a column's rule runs from the frame's top at least this share of the longest rule


def snap(words: list, verticals) -> list:
    longest = max((v.end - v.start for v in verticals), default=0)
    # A box opened on the page before runs down the whole page as well: a column's rule starts at the frame's top,
    # a box's below the heading of its level.
    long = [v for v in verticals if v.end - v.start >= COLUMN * longest]
    top = min((v.start for v in long), default=0)
    columns = sorted((v for v in long if v.start <= top + 3), key=lambda v: v.position)
    if len(columns) < 2:
        return words
    left, right, bottom = columns[0].position, columns[1].position, columns[0].end
    boxes = [v for v in verticals if left + 1 < v.position < right - 1]
    result = []
    for word in words:
        middle = (word.y0 + word.y1) / 2
        if left < word.x0 and word.x1 <= right + 1 and top < middle < bottom:
            edge = max([v.position for v in boxes if v.position < word.x0 and v.start <= middle <= v.end], default=left)
            word = replace(word, x0=edge + PAD)
        result.append(word)
    return result
