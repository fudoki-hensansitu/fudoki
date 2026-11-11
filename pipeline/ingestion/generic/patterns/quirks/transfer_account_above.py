"""Document quirk: the account a transfer came from, printed by its code on the line above the words and amount
(`０１項０２土木技術支援・人材育成センター費` / `から流用 13,281,000円`, 130001): one note, not an item numbered 01."""
import re

from ingestion.generic.layout import normalize

SCOPE = 'document'
OPTIONS = {'const': True}
TRANSFER_TAIL = re.compile(r'^[へか]ら?(?:流用|充用)')


def joins(previous, item) -> bool:
    return (abs(item.lines[0][0].x0 - previous.lines[0][0].x0) <= 2
            and 0 < item.lines[0][0].y0 - previous.lines[-1][0].y0 <= 2.5 * (previous.lines[-1][0].y1 - previous.lines[-1][0].y0)
            and TRANSFER_TAIL.match(normalize(item.name)) is not None)
