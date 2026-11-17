"""Document quirk (scan): a two-digit code set right runs over the rule on its left, and OCR reads it as one word
across the rule (132063 当初予算 R6 の特別会計: 款「10」 from x 9.6 over the frame's left rule at 14.2, 項「10」 over
the rule at 21.2; R7 の国民健康保険も). Cut by width, its `1` falls outside the frame or in the box on its left and
its `0` is no code, so the 款・項 lose their codes. With the quirk a word (or the start of a line) of two digits that
one rule crosses is kept whole, from the rule on, as the code of the box the rule opens; the name after it is a word
of its own. The value `left` keeps the code where OCR boxes it instead: the scan whose two-digit codes start where the
one-digit codes of their level start and run over the next level's rule (132063 R7 の国民健康保険: 項「15」 from x 42
over the 目's rule at 43.7). Read by `scan._split`."""
import re

SCOPE = 'document'
OPTIONS = {'enum': [True, 'left']}


def across(word, inside: list[float], side=True):
    """On a scan, the OCR word (or line) of a two-digit code that one rule crosses: the code from the rule on, and the
    name after it as a word of its own (cut at the other rules as any). None when no single rule crosses the code."""
    from ingestion.generic.layout import _width
    from ingestion.generic.observe import Word
    found = re.match(r'([0-9]{2})(\s*)(.*)$', word.text)
    if found is None:
        return None
    code, space, name = found.groups()
    if name and (re.match(r'[0-9,]', name) or not name.strip()):
        return None
    unit = (word.x1 - word.x0) / sum(_width(c) for c in word.text)
    end = word.x0 + unit * sum(_width(c) for c in code)
    crossing = sorted({round(x, 1) for x in inside if x < end - .5})  # (a rule drawn in pieces is one rule)
    if len(crossing) != 1:
        return None
    pieces = [Word(code, word.x0 if side == 'left' else crossing[0], word.y0, end, word.y1)]
    if name:
        pieces.append(Word(name, end + unit * sum(_width(c) for c in space), word.y0, word.x1, word.y1))
    return pieces
