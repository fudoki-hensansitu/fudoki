"""Document quirk: OCR reads the 款 title, the 項 title and the unit notation of one line in boxes cut elsewhere than
the print (`2総務費(項)1総務管理費` as one box, `(項` and `) 1` or `(単位` and `：千円)` as two, 133035 当初予算). Before the line is cut into
titles, a box is cut where the 項's mark or the unit notation opens (by the characters' share of its width), and a box
that only opens a mark (`(項`, `(単位`) is joined to the box after it."""
import re

SCOPE = 'document'
OPTIONS = {'const': True}

CUT = re.compile(r'(?<=.)(?=[(（](?:項|単位))')
OPENED = re.compile(r'^[(（](?:款|項|単位)$')


def split(parts: list[list]) -> list[list]:
    from dataclasses import replace
    from ingestion.generic.layout import text
    result = []
    for run in parts:
        shown = text(run)
        cuts = [m.start() for m in CUT.finditer(shown)]
        if not cuts:
            result.append(run)
            continue
        first, last = run[0], run[-1]
        width = (last.x1 - first.x0) / max(len(shown), 1)
        for start, end in zip([0, *cuts], [*cuts, len(shown)]):
            result.append([replace(first, text=shown[start:end], x0=first.x0 + start * width,
                                   x1=first.x0 + end * width - (0.1 if end < len(shown) else 0),
                                   y0=min(g.y0 for g in run), y1=max(g.y1 for g in run))])
    joined = []
    for run in result:
        if joined and OPENED.match(text(joined[-1])):
            joined[-1] = joined[-1] + run
        else:
            joined.append(run)
    return joined
