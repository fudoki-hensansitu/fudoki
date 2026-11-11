"""What a conversion reads off frozen OCR observations and the page render: ink no OCR box covers, and the
observations a fuller re-read replaced. Acquisition (``scan_ocr``) uses them too; a converter imports them from here,
so a change to how observations are acquired does not touch the code that builds tables (its fingerprint)."""
from __future__ import annotations

from collections import deque
from typing import Sequence

import numpy as np

RULE_RUN_PT = 14.0   # a straight dark run this long is a rule or an underline, not a glyph
BOX_PAD_PT = 1.5     # ink this close to an OCR box belongs to it
JOIN_PX = 4          # pixels this close are one mark
MIN_PIXELS = 9       # smaller marks are specks; a thin 1 or a lone 0 is 9-11 px at 144 dpi, a bracket's tip 4-8


def _strip_runs(dark: np.ndarray, minimum: int) -> np.ndarray:
    out = dark.copy()
    for array, transposed in ((dark, False), (dark.T, True)):
        padded = np.zeros((array.shape[0], array.shape[1] + 2), np.int8)
        padded[:, 1:-1] = array
        edges = np.diff(padded, axis=1)
        for row in range(array.shape[0]):
            for start, end in zip(np.flatnonzero(edges[row] == 1), np.flatnonzero(edges[row] == -1)):
                if end - start >= minimum:
                    if transposed:
                        out[start:end, row] = False
                    else:
                        out[row, start:end] = False
    return out


def missed_ink(dark: np.ndarray, scale: float, boxes: Sequence[Sequence[float]],
               ignored: np.ndarray | None = None) -> list[tuple[float, ...]]:
    """Marks on the page that no OCR box covers and that are not rules, in displayed-page points.

    ``dark`` is a thresholded render, ``scale`` points per pixel. OCR drops a lone 0, a
    bare 一, single kanji of letter-spaced names and sometimes whole lines; all leave ink here.
    """
    ink = _strip_runs(dark, int(RULE_RUN_PT / scale))
    if ignored is not None:  # (after the rules: a rule crossing a dashed rule is still one run)
        ink &= ~ignored
    for x0, y0, x1, y1 in boxes:
        ink[max(0, int((y0 - BOX_PAD_PT) / scale)):int((y1 + BOX_PAD_PT) / scale) + 1,
            max(0, int((x0 - BOX_PAD_PT) / scale)):int((x1 + BOX_PAD_PT) / scale) + 1] = False
    pixels = set(zip(*(axis.tolist() for axis in np.nonzero(ink))))
    seen, marks = set(), []
    for seed in sorted(pixels):
        if seed in seen:
            continue
        queue, group = deque([seed]), []
        seen.add(seed)
        while queue:
            y, x = queue.popleft()
            group.append((y, x))
            for dy in range(-JOIN_PX, JOIN_PX + 1):
                for dx in range(-JOIN_PX, JOIN_PX + 1):
                    near = (y + dy, x + dx)
                    if near in pixels and near not in seen:
                        seen.add(near)
                        queue.append(near)
        if len(group) >= MIN_PIXELS:
            ys, xs = [g[0] for g in group], [g[1] for g in group]
            marks.append((min(xs) * scale, min(ys) * scale, (max(xs) + 1) * scale, (max(ys) + 1) * scale))
    return sorted(marks, key=lambda m: (m[1], m[0]))


def superseded(page: dict) -> set[str]:
    """Observations a fuller re-read replaced (and their words): readers skip them."""
    ids = {i for region in page["regions"] for i in region.get("supersedes", ())}
    return ids | {o["id"] for region in page["regions"] for o in region["observations"] if o.get("parent_id") in ids}
