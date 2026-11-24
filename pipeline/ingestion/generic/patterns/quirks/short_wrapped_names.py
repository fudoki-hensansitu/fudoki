"""Axis quirk: a numbered name wraps to a second line before it reaches the amount column, and its amount goes on the
second line (132209 R5 決算書の備考: `1 高齢者の保健事業と介護予防の一体` / `的実施事業費 256,215`).

The generic wrap reads a codeless line with an amount as the end of the numbered name above only when that line ran up
to the column's right edge (the name did not fit with its amount). A name the print breaks at a fixed width never does,
so its tail became an item under the name, and the amount counted twice. With this quirk a codeless line that starts
under the numbered name (from the number's start to the name's start, two line heights on), under a name that has no
amount yet, is the end of that name."""

SCOPE = 'axis'
OPTIONS = {'const': True}


def continues(previous, label, money, code) -> bool:
    """The codeless line with an amount, at the numbered name's start, ends the name above (which has no amount yet)."""
    return (previous is not None and code is None and bool(label) and bool(money)
            and previous.code is not None and not previous.amounts and bool(previous.lines)
            and previous.indent - 3 <= label[0].x0 <= previous.indent + 2 * (label[0].y1 - label[0].y0))
