"""Document quirk: two tables stacked on a page, the lower set a few points aside (132144; also 131024, 131067, 134210). The
column edge of one ends above where the other's starts, or no word stands between the two: the two are one column
edge drawn twice, and the frame's rules start up to that far inside its outermost edge."""
from collections import defaultdict

SCOPE = 'document'
OPTIONS = {'const': True}


def one_edge(page, a: float, b: float) -> bool:
    """Whether the column edges at `a` and `b` (3–8pt apart) are one edge drawn twice."""
    if b - a > 8:
        return False
    spans: dict[float, list[tuple[float, float]]] = defaultdict(list)
    for r in page.rules:
        if r.vertical:
            spans[round(r.x0, 1)].append((r.y0, r.y1))
    above = lambda x, y: all(y1 <= min(z0 for z0, _ in spans[y]) + 3 for _, y1 in spans[x])
    apart = bool(spans[a]) and bool(spans[b]) and (above(a, b) or above(b, a))
    return apart or not any(a < (w.x0 + w.x1) / 2 < b for w in page.words)


def reach(page, frame) -> float:
    """How far inside the frame's edges its rules may start."""
    x0, x1, top, bottom, _ = frame
    verticals = [r for r in page.rules if r.vertical]
    return 3 + max([abs(r.x0 - x) for x in (x0, x1) for r in verticals if 2 < abs(r.x0 - x) <= 8
                    and top - 3 <= r.y0 <= bottom], default=0)
