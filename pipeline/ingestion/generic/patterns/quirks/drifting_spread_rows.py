"""Document quirk: the right page of a spread prints its row rules a little off the left page's, more at the top than
at the foot (千代田区の決算書 2020: 2.9pt higher at the first row, level at the last). No one shift lines the rows up,
so `layout.same_rows` finds too few of them within 1pt and the halves stay two logical pages. With the quirk a row
rule counts as shared when the other page has one within `DRIFT` pt of it, shift or not."""

SCOPE = 'document'
OPTIONS = {'const': True}

DRIFT = 4.0


def matches(shorter: list[float], longer: list[float]) -> int:
    return sum(1 for x in shorter if any(abs(x - y) <= DRIFT for y in longer))
