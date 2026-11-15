"""Axis quirk: a department too long for its column wraps onto the next line, letter-spaced and with its brackets
drawn as lines rather than printed (`子 ど も 子 育 て 支 援 課 ･` / `･保・育・課･`, 131024). The department of a
line that fits is printed in brackets in the same column (`[子ども子育て支援課]`), and goes with the name.

The two lines are one department, `[子ども子育て支援課・保育課]`: the first stays on the 事業's line and the second,
a line of its own with no number and no amount, starting at the same place, is no item. A department printed without
its brackets on the 事業's line alone (`徴収事務 保険年金課 25,630千円`) is put in brackets too."""
import re

from ingestion.generic.layout import Glyph, normalize

SCOPE = 'axis'
OPTIONS = {'const': True}
GAP = 40  # the space between the end of the name and the department column (pt)
DOTS = '･・'
DEPARTMENT = re.compile(r'[^\[\]0-9]+(?:課|部|局|室|所|係|センター)')


def _column(label: list) -> int | None:
    """The index of the label's first glyph in the department column: after a gap wider than any in a name."""
    for index in range(1, len(label)):
        if label[index].x0 - label[index - 1].x1 > GAP:
            return index
    return None


def join(entries: list) -> list:
    """`entries` (label, money, code, name) with each wrapped department joined in brackets onto its 事業's label."""
    out = list(entries)
    index = 0
    while index < len(out) - 1:
        label, money, code, name = out[index]
        start = _column(label) if label and money else None
        if start is None or normalize(label[start].text).startswith('['):
            index += 1
            continue
        first = normalize(''.join(g.text for g in label[start:]))
        tail, tail_money, tail_code, _ = out[index + 1]
        wrapped = (first.endswith(tuple(DOTS)) and bool(tail) and not tail_money and tail_code is None
                   and abs(tail[0].x0 - label[start].x0) <= 3 and tail[0].page == label[start].page
                   and 0 <= tail[0].y0 - label[start].y1 <= label[start].y1 - label[start].y0 + 4)
        if wrapped:
            second = normalize(''.join(g.text for g in tail)).strip(DOTS).replace('・', '')
            text = '[' + first.strip(DOTS) + '・' + second + ']'
        elif DEPARTMENT.fullmatch(first):
            text = '[' + first + ']'
        else:
            index += 1
            continue
        head = label[start]
        glyph = Glyph(text, head.x0, head.y0, max(g.x1 for g in label[start:] + (tail if wrapped else [])), head.y1,
                      head.page, head.offset)
        out[index] = (label[:start] + [glyph], money, code, re.sub(re.escape(first) + '$', text, name) if name else name)
        if wrapped:
            del out[index + 1]
        index += 1
    return out
