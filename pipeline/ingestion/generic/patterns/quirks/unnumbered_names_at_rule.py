"""Document quirk: a subject the year drops prints no number, and its name starts where the names of its level start,
right at the rule that closes the level's code column (132128 R8 当初 歳入 土地区画整理: `分担金及び負担金 0 1 △1`
under 款, `負担金` under 項, the mark `廃款`・`廃項`・`廃目` in the 説明 column). Its first character touches the next
column, so the band it starts in is one level too deep: its level is the column whose closing rule it starts at."""
SCOPE = 'document'
OPTIONS = {'const': True}

# How far from the rule the first character may start (the print sets it on the rule: 45.38 against 45.4).
SLACK = 1.0


def level(x0: float, bands: list, found: int | None) -> int | None:
    """The level of a codeless name whose first character starts at `x0`, read as `found` by its band."""
    if not found:
        return found
    return found - 1 if abs(x0 - bands[found - 1].x1) <= SLACK else found
