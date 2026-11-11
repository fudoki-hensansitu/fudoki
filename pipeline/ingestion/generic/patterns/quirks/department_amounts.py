"""Axis quirk: a department's share of a 事業 printed inside its tortoise-shell brackets (`〔秘書広報室 13,040〕`,
132195). The amount is the department's and the line heads the items printed under it at its indentation, as a
department in round brackets with its amount beside them does (`(財政課) 138,154,166`). Its parts end at the next
numbered line (the next 事業), and run on over a page that prints the 目 again by its number alone (`１.`)."""
import re

from ingestion.generic.layout import normalize

SCOPE = 'axis'
OPTIONS = {'const': True}
SHARE = re.compile(r'〔([^〔〕]+?)([0-9]{1,3}(?:,[0-9]{3})*)〕')


def split(label: list, cut) -> tuple[list, list] | None:
    """(the label without its amount, the amount's glyphs) of a department line with its share; None for any other.
    `cut`: `tree._cut`, the glyphs before and after a character position."""
    joined = ''.join(g.text for g in label)
    found = SHARE.fullmatch(normalize(joined))
    if found is None or len(joined) != len(normalize(joined)):
        return None  # (a line whose spaces or widths NFKC changes would cut at the wrong place)
    head, rest = cut(label, found.start(2))
    amount, closing = cut(rest, found.end(2) - found.start(2))
    return head + closing, amount


def heading(name: str) -> bool:
    return re.fullmatch(r'〔[^〔〕]+〕', normalize(name)) is not None
