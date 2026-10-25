from __future__ import annotations
import re
from ingestion.generic.observe import Word, Rule
from ingestion.generic.layout import is_amount, _width, _crosses


def split_text_at_rules(word: Word, verticals: list[Rule]) -> list[Word]:
    """Split a body word of text where a vertical rule runs between two of its characters.

    Poppler joins the last character of one cell and the first of the next into one word when they sit
    close (a vertical 主管課 column `政` against the name `行政…`, `１６号` against `(8年度へ繰越`). A rule inside a
    word on a character boundary (within 2pt) is a cell edge, never text; amounts are left whole. A character's
    width is its class's: full width one line high, half width half of it."""
    if len(word.text) < 2 or is_amount(word.text):
        return [word]
    y = (word.y0 + word.y1) / 2
    glued = re.match(r'^([△▲\-]?[0-9][0-9,]*)([^0-9,△▲\-].*)$', word.text)
    if glued:
        # An amount with text glued to its end (`4,123,524国`): cut where the amount ends when a rule runs there.
        at = word.x0 + sum(_width(c) for c in glued.group(1)) * (word.x1 - word.x0) / sum(_width(c) for c in word.text)
        if any(abs(r.x0 - at) <= 3 and _crosses(r, y) for r in verticals):
            return [Word(glued.group(1), word.x0, word.y0, at, word.y1), Word(glued.group(2), at, word.y0, word.x1, word.y1)]
    weights = [_width(c) for c in word.text]
    unit = (word.x1 - word.x0) / sum(weights)
    edges = [word.x0]
    for weight in weights:
        edges.append(edges[-1] + weight * unit)
    cuts = sorted({index for index, edge in enumerate(edges) if 0 < index < len(word.text)
                   for r in verticals if abs(r.x0 - edge) <= 2 and word.x0 + 1 < r.x0 < word.x1 - 1 and _crosses(r, y)})
    if not cuts:
        return [word]
    pieces, start = [], 0
    for cut in cuts + [len(word.text)]:
        pieces.append(Word(word.text[start:cut], edges[start], word.y0, edges[cut], word.y1))
        start = cut
    return pieces

