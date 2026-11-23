"""Document quirk: a name ends with a bracketed number that wraps alone onto the next line (世田谷区の決算書 R6 歳入の節:
`52 返還金・戻入金 1,000` / `（２）`, the second 節 of that name). The bracketed number has no name and no amount of its
own and starts where the names start, which is also where the numbers of a deeper level start, so the margins read it
as item `2` with no name. Under a line with a name, such a line is the end of that name."""
import re

SCOPE = 'document'
OPTIONS = {'const': True}

ALONE = re.compile(r'[(（][0-9０-９]{1,2}[)）]')


def wraps(raw_text: str) -> bool:
    return ALONE.fullmatch(raw_text.strip()) is not None
