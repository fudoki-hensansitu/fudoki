"""Document quirk: a list cut by the end of a line (`使用料（1・2・3` / `月）`, 132101): a one- or two-digit number
right after a `・` at the end of the line is the last of the list, not an amount."""
import re

from ingestion.generic.layout import normalize, text

SCOPE = 'document'
OPTIONS = {'const': True}


def cut(parts: list) -> bool:
    return (text(parts[-2])[-1:] in '・·･' and re.fullmatch(r'[0-9]{1,2}', normalize(text(parts[-1]))) is not None
            and parts[-1][0].x0 - parts[-2][-1].x1 < parts[-1][0].y1 - parts[-1][0].y0)
