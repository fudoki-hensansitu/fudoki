"""The prior year's row printed under each row of the year (小笠原村の決算資料「款別決算対前年度比較表（様式2）」).

Each 款 prints two lines, `５年度` and `４年度`, each with its own 予算現額・支出額・翌年度繰越額・不用額・執行率 under
the one 款 name that runs over both. The table is the year's: the line headed by the prior year's label is no amount of
this document and has no row of its own, so the words right of its label, on its line, are dropped before the
bands. The 款 name, drawn to the left of the label, is kept (a long name wraps over both lines).
"""
from __future__ import annotations

import re

LABEL = re.compile(r'^[４4]年度$')
SAME_LINE = 3.0  # points between the centres of the label and a word of its line


def drop(page) -> int:
    dropped = 0
    for label in [w for w in page.words if LABEL.match(w.text)]:
        middle = (label.y0 + label.y1) / 2
        keep = [w for w in page.words
                if not (w.x0 >= label.x0 - 1 and abs((w.y0 + w.y1) / 2 - middle) <= SAME_LINE)]
        dropped += len(page.words) - len(keep)
        page.words = keep
    return dropped
