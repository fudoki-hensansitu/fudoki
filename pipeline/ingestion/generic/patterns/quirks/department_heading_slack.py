"""Document quirk: a scan boxes the bracket of a department heading a little right of the print (`(施設建設課)` 751.1
over `旅費` 747.7, 132225): its parts may start up to half the line's height left of it, well short of the next
level's indent."""

SCOPE = 'document'
OPTIONS = {'const': True}


def slack(first) -> float:
    return max(3, (first.y1 - first.y0) / 2)
