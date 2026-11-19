"""Document quirk: a subject the year drops prints no number, and its name starts where the names of its level start,
right at the rule that closes the level's code column (132128 R8 当初 歳入 土地区画整理: `分担金及び負担金 0 1 △1`
under 款, `負担金` under 項, the mark `廃款`・`廃項`・`廃目` in the 説明 column). Its first character touches the next
column, so the band it starts in is one level too deep: its level is the column whose closing rule it starts at.

The names of a level may start a little right of that rule, less than half a character (132292 R7 当初 国保: the 項
`傷病手当金 0 930 △930` and its 目 under it, both without a number, the 項's name 2.6pt right of the 項 column's
rule, where the coded 項 names start, and the 目's a character and a half right of it)."""
SCOPE = 'document'
OPTIONS = {'const': True}

# How far from the rule the first character may start (the print sets it on the rule: 45.38 against 45.4).
SLACK = 1.0


def level(x0: float, bands: list, found: int | None, size: float = 0.0) -> int | None:
    """The level of a codeless name whose first character, `size` high (as wide as high), starts at `x0`, read as
    `found` by its band."""
    if not found:
        return found
    return found - 1 if -SLACK <= x0 - bands[found - 1].x1 <= max(SLACK, size / 2) else found
