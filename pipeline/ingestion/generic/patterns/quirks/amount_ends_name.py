"""Axis quirk: a name ends at its amount in the axis's own amount column, at a line that stops short of the column's
right end, or where the next line is set a row apart rather than a line apart (栃木県の決算書の歳入: a name that
wraps fills its line, goes on at the line pitch and prints its amount on its last line).

The line under such a line is the next item, even when it prints no amount of its own in the column: a 節 with no
budget but a 収入済額 on the other page of the spread (`現年課税分 2,368,000,000` / `滞納繰越分`, or
`国営塩那台地土地改良事業費` / `負担金` / `深山・板室ダム管理事業費負` / `担金 158,273,000`). Without the quirk, a line
with no amount in the column goes on with the name above.
"""
SCOPE = 'axis'
OPTIONS = {'const': True}
SHORT_CHARS = 1.5  # a line this many characters short of the column's width did not wrap
ROW_APART = 1.8    # line heights from the top of a line to the top of the next: farther is the next row, not a wrap


def ends(column_amounts: list, previous, label: list, limit: float | None) -> bool:
    """Whether the name of the item above ended on its last line, so that `label` begins the next item."""
    if previous is None or not previous.lines or not previous.lines[-1]:
        return False
    line = previous.lines[-1]
    middle = (line[0].y0 + line[0].y1) / 2
    if any(a.page == line[0].page and a.y0 < middle < a.y1 for a in column_amounts or ()):
        return True
    height = line[0].y1 - line[0].y0
    if label and label[0].page == line[0].page and label[0].y0 - line[0].y0 > ROW_APART * height:
        return True
    # The column's right end: its own rule, or the longest name line when that is nearer (a heading printed past the
    # column on some page sets `limit` beyond it). A wrapped line holds as many characters as the column holds
    # full-width ones, half-width letters too (`GIGAスクール運営支援セ` / `ンター整備事業費補助金`): it is short only when it
    # falls short both in width and in characters.
    right = previous.group.x1 if limit is None else min(limit, previous.group.x1)
    characters = len(''.join(g.text for g in line).replace(' ', ''))
    return (max(g.x1 for g in line) < right - SHORT_CHARS * height
            and characters < int((right - line[0].x0) / height) - SHORT_CHARS)
