"""Document quirk: the document prints its item numbers in half-width digits only, so a line that begins with
full-width digits begins its name with them (`２１世紀職業財団賛助会員負担金` among the 節 of 町田市 R6), not with item `21`.
A name printed once at its start makes that start a code margin of its own, which the margins alone cannot tell."""
import re

SCOPE = 'document'
OPTIONS = {'const': True}

FULL_WIDTH = re.compile(r'[０-９]')


def names(raw_text: str) -> bool:
    return FULL_WIDTH.match(raw_text) is not None
