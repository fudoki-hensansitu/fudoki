"""Document quirk: the 目 a page carries on, printed in brackets in the subject column's first row, runs over the rule
that parts the subject column from the first amount column (`(1 特定健康診` | `査等事業費)`, 132276 R5 当初の特別会計).

`running_titles.carried_names` takes the row for a repeat of the open 目 only when the subject column holds all of it
(its name closes the bracket there). A scan cuts the row's words at the rule, so the tail of a long name falls into the
next column and the row's rest opens a 目 of its own that the page's 説明 then runs under. The text words of the same
line in the other columns, laid on the row, are its tail: when the row and its tail read as one carried name, both are
dropped as the carried row is."""
import re

from ingestion.generic import layout
from ingestion.generic.layout import is_amount, normalize

SCOPE = 'document'
OPTIONS = {'const': True}

TOUCHING = 12  # pt: the gap a name's next word may leave after the one before it (a cut at a rule leaves up to a character)
LINE = 3  # pt: how far a word's middle may be from the row's and still be on its line


def tail(first: list, bands: list, page: int) -> list:
    """The words of the page's other columns that lie on the subject row's line and run on from its end, left to right."""
    top, bottom = min(g.y0 for g in first), max(g.y1 for g in first)
    middle = (top + bottom) / 2
    found = [w for band in bands if band.page == page and not layout._subject(band) for w in band.words
             if abs((w.y0 + w.y1) / 2 - middle) <= LINE and not is_amount(w.text) and not re.search(r'[0-9]', w.text)]
    chain, end = [], max(g.x1 for g in first)
    for word in sorted(found, key=lambda w: w.x0):
        if word.x0 - end > TOUCHING:
            break  # the words a column on prints further right (the notes of 財源内訳) are no part of the name
        chain.append(word)
        end = max(end, word.x1)
    return chain
