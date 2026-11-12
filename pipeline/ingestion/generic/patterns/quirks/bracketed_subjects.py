"""Document quirk: a 目 the year drops prints its name in brackets with no code (`(都議会議` / `員選挙費)` `0 172,475
△172,475`, 新宿区の予算事項別明細書). Read by the subject pattern `bands`, as `marked_subjects` reads a `○`.

- A line that opens with a bracket starts an item of the level of its column, with no code, as a code does.
- A codeless line of the same column right under it, starting where its name does or right of it, is the rest of its
  name.
"""
from ingestion.generic.layout import normalize, text
from ingestion.generic.patterns.quirks.marked_subjects import continues, stray  # noqa: F401 (read by `tree`)

SCOPE = 'document'
OPTIONS = {'const': True}

OPENING = ('(', '（')


def marked(piece) -> bool:
    shown = normalize(text(piece))
    return shown[:1] in OPENING and not stray(piece)
