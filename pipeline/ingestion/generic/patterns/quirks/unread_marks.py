"""Document quirk: the 備考 marks each line's level with a bullet in front of its name (`◎市報等発行費` / `○市報発行費` /
`・市報印刷製本費`, 132080 R5 決算), and the levels are read from where a line starts (`indent_chars`). OCR leaves some
bullets unread (`◎` in `19,224市報等発行費` read as `19,224市報等発行費`, p98), so the line starts one step deeper than
it is printed. A round mark of ink, about a character wide and with no other ink or word between it and the rule to its left,
just in front of a name that starts with a letter, is that bullet: the name's word starts where the ink does, with a `○`
in front (a mark the levels read, `tree.BULLET`). Only in a column `WIDE` or wider (the 備考's)."""
import re

import numpy as np

from ingestion.lib import pdf_rules

SCOPE = 'document'
OPTIONS = {'const': True}
WIDE = 150  # pt: the 備考 column; the narrow 節 column has a dotted rule and a code's digit before its names

MARKED = re.compile(r'[◎○〇●•・]')
LETTER = re.compile(r'[^\W\d_]')


def marked(words: list, pdf, number: int, cuts: list[float]) -> list:
    from ingestion.generic.scan import Word
    image = None
    scale = pdf_rules.DPI / 72
    out = []
    for word in words:
        height = word.y1 - word.y0
        left = max((x for x in cuts if x < word.x0 - .5), default=None)
        right = min((x for x in cuts if x > word.x0 + .5), default=None)
        if (not LETTER.match(word.text[:1]) or MARKED.match(word.text) or left is None or right is None
                or right - left < WIDE
                or word.x0 - left < .8 * height
                or any(w is not word and left < w.x0 < word.x0 and min(w.y1, word.y1) > max(w.y0, word.y0)
                       for w in words)):
            out.append(word)
            continue
        if image is None:
            image = pdf_rules.render(pdf, number) < pdf_rules.DARK
        start = left + 1
        x0, x1 = round(start * scale), round((word.x0 + height) * scale)
        y0, y1 = round((word.y0 + .1 * height) * scale), round((word.y1 - .1 * height) * scale)
        band = image[y0:y1, x0:x1]
        inked = band.any(axis=0) if band.size else np.zeros(0, bool)
        # (a column inked down most of the line is a rule's ink: a thick rule, or one the page's rules left out)
        ruled = np.flatnonzero(band.mean(axis=0)[:max(0, round((word.x0 - start) * scale))] >= .65) if band.size else []
        if len(ruled):
            inked[:ruled[-1] + 1] = False  # the mark is right of the rule
        columns = np.flatnonzero(inked)
        # the mark: from the first ink to the last ink column with a blank one after it within a character's width (a
        # faint ring prints broken, and the name may follow it a column or two off), when it starts before the word does:
        # OCR may box the name from inside the mark
        end = max((int(c) for c in columns if (c - columns[0] + 1) / scale <= height and not inked[c + 1:c + 2].any()),
                  default=None) if len(columns) else None
        if end is None or start + columns[0] / scale > word.x0 - .3 * height:
            out.append(word)
            continue
        ink = image[y0:y1, x0 + columns[0]:x0 + end + 1]
        rows = np.flatnonzero(ink.any(axis=1))
        width, tall = (end - columns[0] + 1) / scale, (rows[-1] - rows[0] + 1) / scale
        # one round mark: as wide as .65〜1 of a character and about as tall as wide, a hole in its middle
        middle = ink[len(ink) // 2 - 1:len(ink) // 2 + 1, ink.shape[1] // 3:2 * ink.shape[1] // 3]
        if .65 * height <= width <= height and .7 <= tall / width <= 1.4 and middle.size and not middle.all():
            mark = start + columns[0] / scale
            out.append(Word('○' + word.text, float(mark), word.y0, word.x1, word.y1))
        else:
            out.append(word)
    return out
