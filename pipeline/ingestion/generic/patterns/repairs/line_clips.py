"""Repair: some pages clip their printed text with a path of no area (a line down the page's left edge, `0 0` to
`0 841.9`, 福生市の予算書 2024), and the render shows that text all the same. On the other pages of the document the
same clip hides a second copy of the text, set a few points aside, beside a printed copy that has no clip. So the
flat-clipped glyphs and rules are shown on a page where the glyphs are nearly all flat-clipped (the page has no
printed copy of its own), and the words of such a page are built again from the
visible glyphs (Poppler reads each of its characters as a word).
The shown text stands aside from the ink and the rules as the hidden copies do from the printed ones (15.6 pt to the
left in 福生市 2024): it is moved by the offset the document's pages with both copies teach (`offset`).
Such a page also draws its characters as outlines: their strokes, shorter than `STROKE`, are no rules."""
from collections import Counter
STROKE = 12.  # pt: longer than the stroke of a character, shorter than any rule of the tables
OWN_COPY = .1
SHOWN = type('Shown', (), {'__bool__': lambda self: True, '__repr__': lambda self: 'SHOWN'})()  # visible: a flat-clipped glyph shown  # a page whose visible glyphs are fewer than this share of its glyphs prints no copy of its own


def flat(clip) -> bool:
    """Whether a clip box (left, bottom, right, top) has no area."""
    return clip is not None and (clip[2] - clip[0] <= 0 or clip[3] - clip[1] <= 0)


def prints_own_copy(found: list, width: float) -> bool:
    """Whether the page's visible glyphs (box, character, visible) are a fair share of the glyphs on it."""
    on_page = [visible for box, _, visible in found if box[2] > 0 and box[0] < width]
    return sum(on_page) >= OWN_COPY * len(on_page)


def without_outlines(rules: list) -> list:
    """The rules longer than a character's stroke."""
    return [r for r in rules if max(r.x1 - r.x0, r.y1 - r.y0) >= STROKE]


def offset(pages: list[list]) -> float:
    """How far right of a hidden copy its printed twin stands (the same character on the same line, within 30 pt),
    the commonest over the first pages that print both copies; 0 when none does."""
    found: Counter = Counter()
    for glyphs in pages:
        shown = [g for g in glyphs if g[2]]
        hidden = [g for g in glyphs if not g[2]]
        if not shown or not hidden:
            continue
        by_line: dict = {}
        for box, char, _ in shown:
            by_line.setdefault((char, round(box[1])), []).append(box[0])
        for box, char, _ in hidden[:400]:
            for dy in (-1, 0, 1):
                for x in by_line.get((char, round(box[1]) + dy), ()):
                    if 0 < abs(x - box[0]) < 30:
                        found[round(x - box[0], 1)] += 1
        if sum(found.values()) > 1000:
            break
    return found.most_common(1)[0][0] if found else 0.0


def moved(glyphs: list, dx: float) -> list:
    """The shown flat-clipped glyphs (box, character, visible) moved `dx` to the right, onto their ink."""
    return [((box[0] + dx, box[1], box[2] + dx, box[3]), char, visible) if visible is SHOWN else (box, char, visible)
            for box, char, visible in glyphs]
