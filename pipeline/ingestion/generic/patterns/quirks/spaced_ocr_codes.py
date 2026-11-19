"""Document quirk: on the OCR pages of a mixed document (a text PDF with a few pages drawn as outlines, `ocr_inputs`), an
item number printed a space before its name stays a word of its own, as the text pages' item numbers are.

Paddle reads `7 在宅医療・介護連携推進会議委員謝礼` as one line, and its characters nearly touch, so the line is one
word; the name's start is then estimated from the share of the digit in the word, a few points off where the name is
printed, and an OCR page's items fall between the text pages' levels (132187 R6 介護 p112: the 事業 under a 目 read one
level up). With the quirk the number and the name are cut where the space is printed, and the name starts where its
first character does."""
from __future__ import annotations

import re

SCOPE = 'document'
OPTIONS = {'const': True}

# Share of the line's height: the space between an item number and its name (5.5pt at 10pt) against the characters of
# a name, which touch or overlap.
GAP = .3
CODE = re.compile(r'[0-9]{1,3}')


def split(pieces: list) -> list[list] | None:
    """The pieces of one OCR line as [number], [rest] when the line starts with a number set apart from its name."""
    if len(pieces) < 2 or not CODE.fullmatch(pieces[0].text.strip()):
        return None
    first, second = pieces[0], pieces[1]
    height = max(first.y1 - first.y0, second.y1 - second.y0)
    if second.text[:1].isdigit() or second.x0 - first.x1 < GAP * height:
        return None
    return [pieces[:1], pieces[1:]]
