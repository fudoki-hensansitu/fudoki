"""Document quirk: the three digits after a comma end at the rule that crosses their number fragment, not at three
characters' share of its box. Paddle can box a fragment over the gap between two cells (`7031` = `703` of `30,703`
flush at the 節 金額 cell's right rule, a gap, and `1` opening the 説明, 132233 R5 当初): the gap widens the share, the
cut lands past the rule, and the two sides join back into `30,7031`."""

SCOPE = 'document'
OPTIONS = {'const': True}


def edge(share: float, crossing: list[float]) -> float:
    """Where the group of three ends: the crossing rule nearest the share's cut."""
    return min(crossing, key=lambda x: abs(x - share))
