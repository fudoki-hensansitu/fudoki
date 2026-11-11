"""Axis quirk: a katakana numbering set a whole character apart from a name that begins with katakana
(`ス ソフトウェア…`, 131211; also 131024, 131237). The item's numbering shape is `kana`."""
import re

from ingestion.generic.layout import normalize

SCOPE = 'axis'
OPTIONS = {'const': True}


def apart(line: list) -> bool:
    height = line[0].y1 - line[0].y0 if line else 0
    gap = line[1].x0 - line[0].x1 if len(line) > 1 else 0
    # A name printed letter-spaced (`ガ ス 代`, 132128) sets every character apart alike: no kana there.
    spaced = len(line) > 2 and abs((line[2].x0 - line[1].x1) - gap) <= height / 4
    # The kana stands a whole character apart; a name's first letter kerned off its rest (`テ` `レビ受信料`, 132055) is nearer.
    return len(line) > 1 and re.fullmatch(r'[ア-ン]', normalize(line[0].text)) is not None and gap >= .9 * height and not spaced
