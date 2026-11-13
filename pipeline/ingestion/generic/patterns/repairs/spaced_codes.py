"""Repair: the document sets a code a half-width space apart from its name (`1 議員報酬`, `12 階段昇降機保守委託料`,
福生市の予算書: 5 pt at 10 pt). Where the words are built again from the visible glyphs (`repair.drop_invisible`), the
usual gap of 0.8 line heights would run the code into its name, and a name that begins with a counter (`12 階段…`,
`1 年額報酬`) would then read as a count. A figure and a letter join only when closer than `GAP` line heights; the
figures of an amount and the letters of a name keep the usual gap."""
FIGURE = set('0123456789,.')  # half-width, with an amount's separators; the full-width digits of `（２）` stay with their brackets
GAP = .3


def joins(left: str, right: str) -> float:
    """The gap in line heights that still joins the two characters into one word."""
    return .8 if (left in FIGURE) == (right in FIGURE) else GAP
