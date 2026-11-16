"""Document quirk: a spread prints a table on each half, and a half stacks tables (132101 の予算事項別明細書の歳入: 左の頁に
目・節、右の頁に説明の枠を刷り、款・項が頁の途中で替わると、次の款・項の題字の下に両方の枠をもう一組刷る). No rule crosses
both halves, so the rules that cross the whole frame are found per half: the horizontals are grouped into runs that overlap
or touch along the page, and a rule that crosses its own run is a full rule of the page."""

SCOPE = 'document'
OPTIONS = {'const': True}

TOUCH = 3  # points: how far apart two rules may end and still belong to one table


def full_rules(horizontals, joined, reach: float) -> list[float]:
    """The heights of the rules that cross their own half's tables (`joined` joins the pieces of one rule)."""
    rules = sorted(joined(horizontals), key=lambda r: r.x0)
    runs: list[list] = []
    for rule in rules:
        if runs and rule.x0 <= max(r.x1 for r in runs[-1]) + TOUCH:
            runs[-1].append(rule)
        else:
            runs.append([rule])
    heights = set()
    for run in runs:
        left, right = min(r.x0 for r in run), max(r.x1 for r in run)
        heights.update(round(r.y0, 2) for r in run if r.x0 <= left + reach and r.x1 >= right - reach)
    return sorted(heights)
