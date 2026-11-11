"""Document quirk: OCR misreads the opening bracket of a bracketed amount. It reads it as `一`, a word of its own or
before the figures (`一887)`, 132144), or drops it so that the figures run into the name (`使用料及び賃借料338)`,
`職員手当等C863)`, 132101). A closing bracket with no opening one still closes the amount."""
import re

from ingestion.generic.layout import normalize, text
from shared.amount import number

SCOPE = 'document'
OPTIONS = {'const': True}
LETTERS = 'CcＣ一'  # the letters OCR reads for the opening bracket
GLUED = re.compile(r'(.*[^0-9,△▲CcＣ一])([CcＣ一]?)([△▲]?[0-9]{1,3}(?:,[0-9]{3})*)[)）]')


def head(glyphs: list, letter: str) -> list:
    """The name before an unopened amount, without the opening bracket read as a word of its own `一`."""
    return glyphs[:-1] if glyphs and glyphs[-1].text == '一' and not letter else glyphs


def glued(glyphs: list):
    """(name, amount) of a line whose amount runs into its name and ends at a closing bracket with no opening one."""
    from ingestion.generic.tree import _cut
    shown = normalize(text(glyphs))
    found = GLUED.fullmatch(text(glyphs))
    if not found or shown.count('(') >= shown.count(')'):
        return None
    name, tail = _cut(glyphs, len(found.group(1)))
    tail = _cut(tail, len(found.group(2)))[1]
    tail = _cut(tail, len(found.group(3)))[0]
    return (name, [tail]) if name and number(normalize(text(tail))) is not None else None
