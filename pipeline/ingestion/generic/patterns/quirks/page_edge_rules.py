"""Document quirk: the scan of a sheet prints the edges of the paper and the fold of a spread as rules (大田区 R5 決算:
an A3 sheet holds the facing pages side by side, and the paper's edges and its middle fold read as rules from the top
of the page to its foot). They bound no table: with them, the two frames of the sheet run together into one whose top
and foot are the paper's, and no header is found. A horizontal rule along the top or the foot of the page and a
vertical rule from the top to the foot are left out.

The sheet also prints an index tab in its outer margin (`8 環境清掃費`, a box right of the frame, p68), whose top
rule a row rule of the frame runs on into: the frame would reach the tab's edge, and no rule would cross it whole.
The tab's rules (short vertical rules outside the outermost column rules that run half the page's height) are left out, and
a row rule that runs on to one of them is cut at those column rules."""
from dataclasses import replace

SCOPE = 'document'
OPTIONS = {'const': True}
EDGE = 2.0  # pt: a rule this close to the page's top or foot lies on the paper's edge
SLACK = 2.0  # pt: how far outside the outermost column rule a rule of the frame may end
TAB = 100.0  # pt: an index tab is no taller (a frame's side the scan reads short is longer: 大田区 R5 p72, 370pt)


def dropped(found):
    vertical = [r for r in found.vertical if not (r.start < EDGE and r.end > found.height - EDGE)]
    horizontal = [r for r in found.horizontal if EDGE < r.position < found.height - EDGE]
    long = [r.position for r in vertical if r.end - r.start >= .5 * found.height]
    if long:
        left, right = min(long) - SLACK, max(long) + SLACK
        tab = [r for r in vertical if not left <= r.position <= right and r.end - r.start <= TAB]
        vertical = [r for r in vertical if r not in tab]
        # (only a row rule that runs on to a rule of the tab is cut: a frame whose side reads short keeps its rules)
        reaches = lambda h: any(h.start - SLACK <= t.position <= h.end + SLACK and t.start - SLACK <= h.position <= t.end + SLACK
                                for t in tab)
        horizontal = [replace(r, start=max(r.start, left), end=min(r.end, right)) if reaches(r) else r
                      for r in horizontal if not (reaches(r) and (r.end <= left or r.start >= right))]
    return replace(found, horizontal=tuple(horizontal), vertical=tuple(vertical))
