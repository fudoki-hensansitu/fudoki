"""Document quirk: a continuation page prints the open 款・項・目 again at the top of the subject column, with no
amount (青梅市 R7 決算: `1 1 (1 議会費)`, `3 1 6 障害福祉費`). The brackets are thin and OCR leaves them out, and the
repeat opens a subject of its own (`bracketed_repeats` finds the repeat by its bracket and the unit row `円`, neither
of which this page reads). The words of the frame's first column (left of its first long rule `WIDE` from the frame's
left) below the column's own heading (`款項`, `目`) and wholly above the first amount in the subject's amount columns
(the value's `columns` columns right of it, so that one amount OCR left unread and a declaration reads, which this step
does not see, does not move the bound; or the page's foot, when they print none) are that repeat: they are dropped, and the page goes on under the open subjects. A
page whose first column has no such heading (the right page of a spread, which starts with an amount column) is left
as it is."""
import re

from ingestion.generic.layout import normalize

SCOPE = 'document'
OPTIONS = {'type': 'object', 'additionalProperties': False, 'required': ['columns'],
           'properties': {'columns': {'type': 'integer', 'minimum': 1}}}
WIDE = 50  # pt: the subject column (codes and names) is wider than one code column
HEADINGS = {'款', '項', '目', '款項', '款項目', '科目'}

AMOUNT = re.compile(r'△?[0-9]{1,3}(,[0-9]{3})+|0')


def dropped(words: list, detected, value: dict) -> list:
    # (the frame's column rules: half as long as its longest, the frame ending halfway down a page that closes the 款)
    tallest = max((v.end - v.start for v in detected.vertical), default=0)
    long = sorted({round(v.position, 1) for v in detected.vertical if v.end - v.start >= .5 * tallest})
    edges = [x for x in long[1:] if x - long[0] >= WIDE] if long else []
    if not edges:
        return words
    edge = edges[0]
    after = long[long.index(edge) + value['columns']] if long.index(edge) + value['columns'] < len(long) else detected.width
    heads = [w for w in words if w.x1 <= edge + 1 and normalize(w.text) in HEADINGS]
    if not heads:
        return words
    top = max(w.y1 for w in heads)
    amounts = [w.y0 for w in words if edge < w.x0 and w.x1 <= after + 1
               and w.y0 > top and AMOUNT.fullmatch(normalize(w.text))]
    first = min(amounts, default=detected.height)
    # (wholly above the first amount: a subject that opens the page prints its first line beside its amount,
    # `2 1 14シティプロ` / `モーション` / `費`)
    repeat = [w for w in words if w.x1 <= edge + 1 and top < (w.y0 + w.y1) / 2 and w.y1 < first]
    return [w for w in words if w not in repeat]
