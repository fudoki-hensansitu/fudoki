"""Document quirk: OCR reads a code set right in its column run into its name as one word (`45△市議会議員選挙` of a
目 that ended, 132080): the code, not the first word, says whether the code is one digit or two."""
import re

SCOPE = 'document'
OPTIONS = {'const': True}


def set_right(item) -> bool:
    return re.fullmatch(r'[0-9]{1,2}', item.code) is not None and item.glyphs[0].text.startswith(item.code)
