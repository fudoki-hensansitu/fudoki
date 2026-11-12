"""Document quirk: the opening bracket of a bracketed amount, printed apart from its figure, is read as a letter or digit
(132144: `C`, `L`, `7`, `（し` left of `22,517)`). A word of one such mark with an amount next right of it on its line
is the bracket and is dropped."""
from dataclasses import replace
import re

SCOPE = 'document'
OPTIONS = {'const': True}
BRACKET_MARK = re.compile(r'[CLr71(（一|l]|[（(][しレ~（(]+')


def drop(printed: list) -> list:
    result = []
    for page in printed:
        def bracket(w):
            if not BRACKET_MARK.fullmatch(w.text.strip()):
                return False
            right = [o for o in page.words if o is not w and w.y0 - 3 <= (o.y0 + o.y1) / 2 <= w.y1 + 3
                     and 0 <= o.x0 - w.x1 <= 50]
            if not right:
                return False
            # A digit mark (`7`, `1`) may be a figure of its own: only before a bracketed or thousands amount is it
            # the bracket.
            amount = r'[0-9]{1,3}(,[0-9]{3})+[)）]?|[0-9]+[)）]' if w.text.strip() in '71' else r'[0-9,]+[)）]?'
            nearest = min(right, key=lambda o: (abs((o.y0 + o.y1) / 2 - (w.y0 + w.y1) / 2) > 3, o.x0))
            return re.fullmatch(amount, nearest.text.strip()) is not None
        kept = [w for w in page.words if not bracket(w)]
        result.append(replace(page, words=kept) if len(kept) != len(page.words) else page)
    return result
