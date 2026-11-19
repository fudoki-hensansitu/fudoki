"""Document quirk: the narrow 款・項・目 code columns are parted by dotted rules (132080 R5 決算). The page's rule detector
keeps long strokes only, so the columns read as one and a code read into its neighbour's column (or a 項's code a row
leaves unread) gives the row the wrong level. A pixel column of the frame's first column (the codes and names of the
subjects) that is inked in short dashes, each gap no longer than `GAP` pixel rows and at least `REACH` of the frame's
height long, is a column rule (`scan.pages`). The 節's code columns are dotted too, but the breakdown reads its numbers
and names as one column."""
from dataclasses import replace

import numpy as np

from ingestion.lib import pdf_rules

SCOPE = 'document'
OPTIONS = {'const': True}

GAP = 6  # pixel rows of white between two dashes
REACH = .5  # of the frame's height
INKED = (.2, .85)  # the share of the column's rows a dotted rule inks (a solid rule inks all)


def added(pdf, detected: pdf_rules.PageRules, dark: int) -> pdf_rules.PageRules:
    long = [v for v in detected.vertical if v.end - v.start >= REACH * detected.height]
    if not long:
        return detected
    image = pdf_rules.render(pdf, detected.page)
    scale = pdf_rules.DPI / 72
    top, bottom = min(v.start for v in long), max(v.end for v in long)
    positions = sorted({round(v.position, 1) for v in long})
    if len(positions) < 2:
        return detected
    left, right = positions[0], positions[1]
    y0, y1 = round(top * scale), round(bottom * scale)
    cells = image[y0:y1, round(left * scale) + 3:round(right * scale) - 2] < dark
    runs = []
    for index, column in enumerate(cells.T):
        edges = np.flatnonzero(np.diff(np.concatenate(([0], column.astype(np.int8), [0]))))
        starts, ends = edges[::2], edges[1::2]
        if len(starts) < 2:
            continue
        # The stretches of dashes: dashes no more than GAP rows apart.
        breaks = np.flatnonzero(starts[1:] - ends[:-1] > GAP)
        for first, last in zip(np.concatenate(([0], breaks + 1)), np.concatenate((breaks, [len(starts) - 1]))):
            if last - first < 2 or (ends[last] - starts[first]) < REACH * (y1 - y0):
                continue
            share = column[starts[first]:ends[last]].mean()
            if INKED[0] <= share <= INKED[1]:
                runs.append((round(left * scale) + 3 + index, y0 + int(starts[first]), y0 + int(ends[last])))
    found = [r for r in pdf_rules._merge(runs, 1 / scale)
             if not any(abs(v.position - r.position) <= 2 for v in detected.vertical)]
    return replace(detected, vertical=tuple(sorted([*detected.vertical, *found], key=lambda r: (r.position, r.start))))
