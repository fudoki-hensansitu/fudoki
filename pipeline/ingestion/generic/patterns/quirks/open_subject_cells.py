"""Document quirk: the subject column draws no rule between a 目, the lines its name wraps onto, the 項's `計` and the
header of the next table on the page (日の出町の予算書), so one cell of the subject column holds all of them. Read by
the subject pattern `bands`.

- A line that starts a character or more right of the code (or the `△`) above it in the cell goes on that name, also
  when it begins with digits (`13 日の出町合併` / `70周年・町制` / `施行50周年記` / `念事業費`).
- The `計` line is the 項's total, not the end of the name above it.
- The subject heading of the next table (`目`) is no item.
"""
from ingestion.generic.layout import SUBJECT_LEVELS, normalize, text

SCOPE = 'document'
OPTIONS = {'const': True}
TOTAL = '計'


def wraps(piece, above) -> bool:
    """The piece goes on the name begun by `above` (the glyphs of the line that opens it): it starts a character or
    more right of where that line starts, below it, on its page."""
    if above is None:
        return False
    start = above[0]
    return piece[0].x0 >= start.x0 + (start.y1 - start.y0) and piece[0].y0 > start.y0 and piece[0].page == start.page


def total(piece) -> bool:
    return normalize(text(piece)) == TOTAL


def heading(piece) -> bool:
    return normalize(text(piece)) in SUBJECT_LEVELS
