"""Document quirk: a number before `市` or `×` that does not follow the item before it is part of the name
(`5市共同事業実行委員会負担金` among names without numbers; `3×3バスケットボール`), not item `5`. An item
`5市町村総合体育大会…` that follows item `4` keeps its number."""
import re

SCOPE = 'document'
OPTIONS = {'const': True}


def counted(first_word: str, raw: str) -> bool:
    return (re.match(r'[0-9]+市(?![民長立役議内外政営有史街場道域制況販部])', first_word) is not None
            or re.match(r'[0-9]+[×✕]', raw) is not None)
