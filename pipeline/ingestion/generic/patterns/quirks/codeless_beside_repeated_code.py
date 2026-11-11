"""Document quirk: a page prints the code of the 項 it goes on with at its top, beside the first 目 of the page
(`１ ２農業総務費`). A 目 the year drops prints no code of its own, so its name stands beside that code alone, in the 目
column (`４ 東京都知事` / `選挙費` with `0 46,316 △46,316`, 稲城市の予算説明書 2025, p84). Read by the subject pattern
`bands`.

The name is no part of the 項 code beside it: it starts an item of the level of the column it stands in, with no code,
as the code of a 目 would. Only a name a full line height right of a bare code, in a deeper column, is read so.
"""
import re

from ingestion.generic.layout import normalize, text

SCOPE = 'document'
OPTIONS = {'const': True}

BARE_CODE = re.compile(r'[0-9]{1,4}')


def apart(previous, glyph, band: int) -> bool:
    """The glyph starts a name of its own: it stands in a deeper column than the bare code before it, a line height off."""
    level, before = previous
    return (band > level and BARE_CODE.fullmatch(normalize(text(before))) is not None
            and glyph.x0 - before[-1].x1 > glyph.y1 - glyph.y0)


def codeless(band: int, piece, pieces) -> bool:
    """The piece is such a name: it follows a bare code of a shallower column on its line."""
    index = next((i for i, (_, other) in enumerate(pieces) if other is piece), 0)
    if index == 0:
        return False
    level, before = pieces[index - 1]
    return level < band and BARE_CODE.fullmatch(normalize(text(before))) is not None
