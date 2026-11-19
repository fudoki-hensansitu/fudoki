"""Document quirk: the text layer gives some printed characters as other marks (131156 R7 決算書の特別会計): the minus
of a figure as the bullet `•` (U+2022, `• 8,100,000` where the page shows `△8,100,000`), the digit `0` as the
semi-voiced mark `゜` (U+309C), and `合` of `歳入合計` as `^` over `ロ`. The marks are drawn with boxes far taller than
the printed line (`゜` runs 32pt down from the top of its row, over the row below), and the words are placed in rows by
their middle. As with `delta_minus`, the amount readers know only `△`/`▲` and digits, so these figures would be read as
no amount at all, and the total row's name as two rows.

A bullet that starts a number, or stands alone in front of one, is read as `△`; a `゜` in a word of figures only is read
as `0`; a `ロ` inside the box of a `^` is read with it as `合`. A figure, or that `合`, whose box is more than `RATIO`
times the usual height of the page's figures keeps that usual height from its top, where the glyph is drawn. A bullet
or a mark elsewhere (a list mark before a name, `゜` in a name) is kept."""
import re
from statistics import median

from ingestion.generic.observe import Page, Word

SCOPE = 'document'
OPTIONS = {'const': True}

RATIO = 2.0
BULLET = re.compile(r'•(?=[0-9,゜]|$)')
FIGURE = re.compile(r'△?[0-9,゜]+|△')


def _joined(words: list[Word]) -> list[Word]:
    """`^` and the `ロ` drawn inside its box as one `合`, boxed from the `ロ`'s top."""
    hats = [w for w in words if w.text == '^']
    used: set[int] = set()
    out = []
    for word in words:
        if word.text == 'ロ':
            hat = next((h for h in hats if id(h) not in used and h.x0 <= word.x0 and word.x1 <= h.x1
                        and h.y0 <= word.y0 and word.y1 <= h.y1), None)
            if hat is not None:
                used.add(id(hat))
                out.append(Word('合', hat.x0, word.y0, hat.x1, word.y1))
                continue
        out.append(word)
    return [w for w in out if id(w) not in used]


def replace(page: Page) -> None:
    words = []
    for word in _joined(page.words):
        text = BULLET.sub('△', word.text)
        if FIGURE.fullmatch(text):
            text = text.replace('゜', '0')
        words.append(Word(text, word.x0, word.y0, word.x1, word.y1))
    heights = [w.y1 - w.y0 for w in words if FIGURE.fullmatch(w.text)]
    usual = median(heights) if heights else 0
    page.words = [Word(w.text, w.x0, w.y0, w.x1, w.y0 + usual)
                  if usual and (FIGURE.fullmatch(w.text) or w.text == '合') and w.y1 - w.y0 > RATIO * usual else w
                  for w in words]
