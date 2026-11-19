"""Document quirk: Paddle boxes a short amount read alone with a line's padding that reaches over the cell's right rule
(`64` boxed 243.7–260.8pt over the 節 金額 cell's rule at 256.4, its digits 247.1–254.1, 132233 R5 当初). Cut at the
rule by a share of the box, the amount loses its last digit to the next cell (`6` | `4`, and the `4` joins the 説明's
item number `2` into `42`). A line that is one number, read as one word whose box stays inside a cell, is that word."""
import re

SCOPE = 'document'
OPTIONS = {'const': True}


def inside(item: dict, children: list, cuts: list[float]):
    """The one word of a one-number line when the line's box crosses a rule and the word's does not, else None."""
    if len(children) != 1 or not re.fullmatch(r'[0-9,]+', item['raw_text'].strip()) \
            or children[0].text.strip() != item['raw_text'].strip():
        return None
    x0, _, x1, _ = item['bbox_pdf_pt']
    word = children[0]
    if any(x0 + 1 < x < x1 - 1 for x in cuts) and not any(word.x0 < x < word.x1 for x in cuts):
        return word
    return None
