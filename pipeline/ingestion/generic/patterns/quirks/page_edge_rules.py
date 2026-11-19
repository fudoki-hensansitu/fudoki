"""Document quirk: the scan of a sheet prints the edges of the paper and the fold of a spread as rules (大田区 R5 決算:
an A3 sheet holds the facing pages side by side, and the paper's edges and its middle fold read as rules from the top
of the page to its foot). They bound no table: with them, the two frames of the sheet run together into one whose top
and foot are the paper's, and no header is found. A horizontal rule along the top or the foot of the page and a
vertical rule from the top to the foot are left out.

The sheet also prints an index tab in its outer margin (`8 環境清掃費`, a box right of the frame, p68), whose top
rule a row rule of the frame runs on into: the frame would reach the tab's edge, and no rule would cross it whole.
The tab's rules (short vertical rules outside the outermost column rules that run half the page's height) are left out, and
a row rule that runs on to one of them is cut at those column rules.

The tab prints its number and name white on black (`3 利子割交付金`, read down the margin), and OCR reads them on the
revenue pages of the same book (p25–p40): the words wholly outside the outermost column rules are the tab's, not the
table's, and are left out too (with them, the tab's name read as a column of its own: `与`)."""
from dataclasses import replace

SCOPE = 'document'
OPTIONS = {'oneOf': [{'const': True}, {'type': 'number', 'exclusiveMinimum': 0}]}
EDGE = 2.0  # pt: a rule this close to the page's top or foot lies on the paper's edge
SLACK = 2.0  # pt: how far outside the outermost column rule a rule of the frame may end
TAB = 100.0  # pt: an index tab is no taller (a frame's side the scan reads short is longer: 大田区 R5 p72, 370pt). A number
# value of the quirk raises it for a book whose tabs stack (the revenue pages of 大田区 R5: two tabs, 205pt at p27)


def dropped(found, tall=TAB):
    vertical = [r for r in found.vertical if not (r.start < EDGE and r.end > found.height - EDGE)]
    horizontal = [r for r in found.horizontal if EDGE < r.position < found.height - EDGE]
    long = [r.position for r in vertical if r.end - r.start >= .5 * found.height]
    if long:
        left, right = min(long) - SLACK, max(long) + SLACK
        tab = [r for r in vertical if not left <= r.position <= right and r.end - r.start <= tall]
        vertical = [r for r in vertical if r not in tab]
        # (only a row rule that runs on to a rule of the tab is cut: a frame whose side reads short keeps its rules)
        reaches = lambda h: any(h.start - SLACK <= t.position <= h.end + SLACK and t.start - SLACK <= h.position <= t.end + SLACK
                                for t in tab)
        horizontal = [replace(r, start=max(r.start, left), end=min(r.end, right)) if reaches(r) else r
                      for r in horizontal if not (reaches(r) and (r.end <= left or r.start >= right))]
    return replace(found, horizontal=tuple(horizontal), vertical=tuple(vertical))


def inside(words, found):
    """The words of the page but those of an index tab: a word wholly outside every column rule the page keeps (the
    tab's own rules are left out by `dropped`; a frame's side the scan reads short still bounds the table)."""
    if not found.vertical:
        return words
    left = min(r.position for r in found.vertical) - SLACK
    right = max(r.position for r in found.vertical) + SLACK
    return [w for w in words if not (w.x1 <= left or w.x0 >= right)]
