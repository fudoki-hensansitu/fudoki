"""Document quirk: the subject column draws a box for each level, but the codes do not stay in their level's box: set
right, a 項's code ends past the rule where the 目's box begins (132063 当初予算 R6 の特別会計, scan: 項「5」 at x 22, the
目's box at 21.2). The column a code starts in is then no level (the staircase reading of the pattern `indent`). The
levels are learned from where the codes start, a two-digit code read where a one-digit code of its level would start:
the value (pt) is how far apart OCR starts the two (less than a printed digit, as OCR boxes the ink only). With the quirk
`digit_set_codes` too, that one reads the breakdown's codes only. Read by the subject pattern `indent`."""
import re

SCOPE = 'document'
OPTIONS = {'type': 'number', 'exclusiveMinimum': 0}


def align(item, digit: float, bands=()) -> None:
    """Move a two-digit code to where its level's one-digit codes start. A code that starts on a band's rule is one
    the quirk `two_digit_codes_over_rules` cut at that rule, and it already starts where its box opens."""
    from ingestion.generic.patterns import document_quirk
    cut = document_quirk('two_digit_codes_over_rules') is not None
    if item.code is not None and re.fullmatch(r'[0-9]{2,4}', item.code) \
            and not (cut and any(abs(item.indent - band.x0) <= .5 for band in bands)):
        item.indent += digit * (len(item.code) - 1)

