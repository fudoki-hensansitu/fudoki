"""Axis quirk: each level's numbers are set right in a column of its own, the deeper level's a digit right of the
outer one's (132292's 説明: 事業「1」 at x 770.2–774.7, 節「1」 at 779.2–783.7 and 節「22」 at 774.7–783.7). A two-digit
number then starts where the outer level's one-digit numbers nearly start: on pages that print no one-digit number of
its level (公債費 prints only 節「22」, 諸支出金 only「24」「27」), the pattern `position` would read it at the outer
level. A number stands where a one-digit number of its level would: it starts a digit before where it ends."""
SCOPE = 'axis'
OPTIONS = {'const': True}


def span(number: tuple[float, float, int]) -> tuple[float, float, int]:
    """The number's (start, end, digits) read as a one-digit number ending where it ends."""
    start, end, digits = number
    return (end - (end - start) / digits, end, digits) if digits > 1 else number
