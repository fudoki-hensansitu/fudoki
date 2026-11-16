"""Document quirk: a continuation page prints the open 款・項・目 again in the first row of the subject column, the 目's
name in brackets and no amount (`5 5 5(議会費)`, 132080 R5 決算). OCR reads the line in many ways (`5 5(会)`,
`10 5 5一股理`, `5(一般管理` / `費)`), and a misread one opens a subject of its own or runs on into the open 目's name.
The words of the frame's first column (left of its first long rule `WIDE` from the frame's left) between the unit row (`円`) and the first amount
in the subject's first amount column (or the page's foot, when it prints none), when they hold a bracket, are that repeat: they are dropped, and the page goes on under the open
subjects."""
import re

from ingestion.generic.layout import normalize

SCOPE = 'document'
OPTIONS = {'const': True}
WIDE = 50  # pt: the subject column (codes and names) is wider; a code column parted by a dotted rule is narrower

AMOUNT = re.compile(r'△?[0-9]{1,3}(,[0-9]{3})+|0')


def dropped(words: list, detected) -> list:
    long = sorted({round(v.position, 1) for v in detected.vertical if v.end - v.start >= .5 * detected.height})
    units = [w for w in words if normalize(w.text) == '円']
    # (the first column's dotted rules, `dotted_column_rules`, part its narrow code columns: its edge is the first long
    # rule `WIDE` or more right of the frame's left)
    edges = [x for x in long[1:] if x - long[0] >= WIDE] if long else []
    if not edges or not units:
        return words
    edge, top = edges[0], max(w.y1 for w in units)
    after = edges[1] if len(edges) > 1 else detected.width
    # (the subject's first amount column: the 節's amounts on the same page start in the first row)
    amounts = [w.y0 for w in words if edge < w.x0 and w.x1 <= after + 1
               and w.y0 > top and AMOUNT.fullmatch(normalize(w.text))]
    first = min(amounts, default=detected.height)  # (a page of the open 目's 節 only prints no subject amount)
    repeat = [w for w in words if w.x1 <= edge + 1 and top < (w.y0 + w.y1) / 2 < first - 1]
    if not any(re.search(r'[(（)）]', w.text) for w in repeat):
        return words
    return [w for w in words if w not in repeat]
