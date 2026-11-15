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
DEPARTMENT = re.compile(r'[^\[\]0-9]+(?:課|部|局|室|所|係|センター|委員会|館)')


def _column(label: list) -> int | None:
    """The index of the label's first glyph in the department column: after a gap wider than any in a name."""
    for index in range(1, len(label)):
        if label[index].x0 - label[index - 1].x1 > GAP:
            return index
    return None


def _below(tail: list, head) -> bool:
    """Whether `tail` starts on the next line, at the place `head` starts."""
    return (abs(tail[0].x0 - head.x0) <= 3 and tail[0].page == head.page
            and 0 <= tail[0].y0 - head.y1 <= head.y1 - head.y0 + 4)


def join(entries: list) -> list:
    """`entries` (label, money, code, name) with each wrapped department joined in brackets onto its 事業's label.

    Three forms: the letter-spaced lines with drawn brackets (`子ども子育て支援課･` / `･保・育・課･`, the second line no
    item); a printed bracket left open on the 事業's line and closed on the next item's line in the same column
    (`[シティプロモー]` or `[シティプロモー` over `[ション推進課]`, on a line of its own or at the end of the next item's line, taken off it); a bare department alone."""
    out = list(entries)
    index = 0
    while index < len(out):
        label, money, code, name = out[index]
        start = _column(label) if label and money else None
        if start is None:
            index += 1
            continue
        head = label[start]
        first = normalize(''.join(g.text for g in label[start:]))
        tail, tail_money, tail_code, tail_name = out[index + 1] if index + 1 < len(out) else ([], [], None, None)
        taken = None  # the glyphs of the next entry that are the department's end
        if first.startswith('['):
            whole = first.endswith(']')
            if (whole and DEPARTMENT.fullmatch(first[1:-1])) or not tail:
                index += 1
                continue
            # The end on a line of its own (`[ション推進課]`, no number, no amount), or in the next item's column.
            alone = not tail_money and tail_code is None
            rest = 0 if alone else _column(tail)
            end = tail[rest:] if rest is not None else []
            closing = normalize(''.join(g.text for g in end))
            if not end or not closing.endswith(']') or not _below(end, head) or closing.count('[') > (1 if whole else 0):
                index += 1
                continue
            text = (first[:-1] + closing[1:]) if whole else first + closing
            if not DEPARTMENT.fullmatch(text[1:-1]):
                index += 1
                continue
            taken = tail if alone else end
        elif first.endswith(tuple(DOTS)) and tail and not tail_money and tail_code is None and _below(tail, head):
            second = normalize(''.join(g.text for g in tail)).strip(DOTS).replace('・', '')
            text, taken = '[' + first.strip(DOTS) + '・' + second + ']', tail
        elif DEPARTMENT.fullmatch(first):
            text = '[' + first + ']'
        else:
            index += 1
            continue
        glyph = Glyph(text, head.x0, head.y0, max(g.x1 for g in label[start:] + (taken or [])), head.y1,
                      head.page, head.offset)
        out[index] = (label[:start] + [glyph], money, code, re.sub(re.escape(first) + '$', text, name) if name else name)
        if taken is tail:
            del out[index + 1]
        elif taken is not None:
            kept = tail[:len(tail) - len(taken)]
            dropped = normalize(''.join(g.text for g in taken))
            out[index + 1] = (kept, tail_money, tail_code,
                              re.sub(re.escape(dropped) + '$', '', tail_name) if tail_name else tail_name)
        index += 1
    return out
