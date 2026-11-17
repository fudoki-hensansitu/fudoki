"""Document quirk: a 款・項 the year drops prints its title with no `第 n 款`・`第 n 項` over its table, its name alone on
the line (昭島市 当初予算 R8 の国民健康保険, p501: `第 2 款 保険給付費` / `傷病手当金` over its 目 `傷病手当金 0 100 △100`;
R7 p507: `共同事業拠出金` / `共同事業拠出金` over `その他共同事業事務費拠出金 0 1 △1`). Under the pattern `running_titles`,
a line that prints no digit and no amount, right under a 款's title, is a 項's title without a code; two such lines one
under the other are a 款's and its 項's. Read by the layout pattern `running_titles`."""
import re

SCOPE = 'document'
OPTIONS = {'const': True}
GAP = 6  # pt: how far under the title above a line may start (one line apart)


def _bare(value: str, amounted: bool) -> bool:
    return bool(value) and not amounted and not re.search(r'[0-9０-９]', value)


def _under(upper, lower) -> bool:
    return upper[0].page == lower[0].page and 0 <= min(g.y0 for g in lower) - max(g.y1 for g in upper) <= GAP


def assign(entries: list) -> list:
    """The titles of a run of lines, top to bottom: each entry is (title or None, text, glyphs, amounted); a bare line
    gets ('項', None, text) under a 款's title, or ('款', None, text) over another bare line set right under it."""
    found = [e[0] for e in entries]
    for i, (title, value, glyphs, amounted) in enumerate(entries):
        if title is not None or not _bare(value, amounted):
            continue
        above = entries[i - 1] if i else None
        below = entries[i + 1] if i + 1 < len(entries) else None
        if above is not None and found[i - 1] is not None and found[i - 1][0] == '款' and _under(above[2], glyphs):
            found[i] = ('項', None, value)
        elif below is not None and below[0] is None and _bare(below[1], below[3]) and _under(glyphs, below[2]):
            found[i] = ('款', None, value)
    return found
