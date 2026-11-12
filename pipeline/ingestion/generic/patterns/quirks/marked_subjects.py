"""Document quirk: a 項・目 the year drops prints `○` where its code would stand (`○ 東京都知事選挙費 0 (44,560)
(△44,560)`, 国立市の予算説明書), and its name may go on under it (`○ 市長・市議会議員` / `選挙費`). Read by the subject
pattern `bands`.

- The `○` line starts an item of the level of its column, with no code, as a code does.
- A codeless line of the same column right under it, starting where its name does or right of it, is the rest of its
  name.
- A line that is only a bracket (`)` printed under the `○`) is no part of a name.
"""
from ingestion.generic.layout import normalize, text

SCOPE = 'document'
OPTIONS = {'const': True}

MARKS = ('○', '〇')
BRACKETS = frozenset('()（）')


def marked(piece) -> bool:
    return normalize(text(piece))[:1] in MARKS


def stray(piece) -> bool:
    shown = normalize(text(piece))
    return bool(shown) and set(shown) <= BRACKETS


def continues(token, piece) -> bool:
    """The name piece goes on the name of the marked item `token` (its glyphs) on the line above."""
    height = max(g.y1 - g.y0 for g in token)
    gap = min(g.y0 for g in piece) - max(g.y0 for g in token)
    return 0 < gap <= 1.6 * height and piece[0].x0 >= token[0].x0 - 1 and piece[0].page == token[0].page
