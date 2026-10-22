"""A text PDF with a few pages OCR reads: those pages take the pinned OCR's words, the others keep the text layer.

Some printed documents have pages whose text layer is empty (a page scanned into an otherwise text volume). The
conversion declares them as an OCR input of its own (`ocr_inputs`, pages in the request, ADR 0019), and the
observation is read the way a scan's is (`scan.read_pages`, with the declared rereads of the options): the words of
those pages come from the OCR, their rules from the rendered page.

An OCR page teaches the builder nothing. Its bands are classified by what the text pages' headings teach
(`layout.logical_pages`, `tree.build`), and the narrow code columns that a rendered page draws as dotted lines (款・項・目,
which image rule detection does not see) are the columns the text pages draw in a frame of the same width
(`learn_frames`, `completing`). The columns are added before the OCR's words are cut at the rules, so that the codes
OCR reads one beside the other (`10` `35`) stay two words.
"""
from __future__ import annotations

from collections import Counter

from ingestion.generic.layout import _frames, is_amount
from ingestion.generic.observe import Page, Rule, Word
from ingestion.lib import pdf_rules

# How far a frame's edge may lie from a text page's (points), and how much wider the rendered frame may be (share).
EDGE_TOLERANCE = 4.0
WIDTH_TOLERANCE = .03


def numbers(source: dict, scope: list[int]) -> list[int]:
    """The pages of the scope that the conversion's OCR inputs read."""
    wanted = {page for item in source.get('ocr', ()) for page in item['request']['pages']}
    return sorted(wanted & set(scope))


def learn_frames(pages: list[Page], spread: dict | None = None, staircase: bool = False) -> Counter:
    """How often each column layout is printed: the edges from the frame's left, and where each inner rule runs
    (from the frame's top; `None` where the page draws none)."""
    found: Counter = Counter()
    for page in pages:
        verticals = [r for r in page.rules if r.vertical]
        for x0, _, top, _, edges in _frames(page, spread, staircase):
            spans = []
            for edge in edges[1:-1]:
                near = [r for r in verticals if abs(r.x0 - edge) <= 3]
                spans.append((round(min(r.y0 for r in near) - top, 1), round(max(r.y1 for r in near) - top, 1)) if near else None)
            found[tuple(round(e - x0) for e in edges), tuple(spans)] += 1
    return found


def learn_origins(pages: list[Page], spread: dict | None = None, staircase: bool = False) -> list[tuple[float, float]]:
    """Where the text pages' frames lie: (width, left edge) of each."""
    return [(x1 - x0, x0) for page in pages for x0, x1, *_ in _frames(page, spread, staircase)]


def shift(page: Page, origins: list[tuple[float, float]], spread: dict | None = None, staircase: bool = False) -> float:
    """How far to move the page sideways to where the text pages print a frame of its width (`aligned`).

    A page that is scanned apart from the volume lies a few points off (a left page of a printed frame at 38 where the
    text pages have it at 22), and the builder reads indentations and number positions by where they are on the page.
    The nearest frame of about the same width (`WIDTH_TOLERANCE`) is the place; a page without one stays (0)."""
    shifts = []
    for x0, x1, *_ in _frames(page, spread, staircase):
        fitting = [left for width, left in origins if abs(width / (x1 - x0) - 1) <= WIDTH_TOLERANCE]
        if not fitting:
            return 0.0
        shifts.append(min(fitting, key=lambda left: abs(left - x0)) - x0)
    if not shifts or max(shifts) - min(shifts) > EDGE_TOLERANCE or abs(shifts[0]) < EDGE_TOLERANCE:
        return 0.0
    return shifts[0]


def aligned(page: Page, origins: list[tuple[float, float]], spread: dict | None = None, staircase: bool = False) -> Page:
    """The page moved sideways by `shift`."""
    return moved(page, shift(page, origins, spread, staircase))


def moved(page: Page, dx: float) -> Page:
    if not dx:
        return page
    return Page(page.number, page.width, page.height,
                [Word(w.text, w.x0 + dx, w.y0, w.x1 + dx, w.y1) for w in page.words],
                [Rule(r.x0 + dx, r.y0, r.x1 + dx, r.y1) for r in page.rules])


def moved_unread(observation: dict, shifts: dict[int, float]) -> dict:
    """The observation's unread ink (ink no OCR box and no rule covers) and unread strip seams moved with their page
    (`shift`), so that the scan's gate (`scan.declared_unread`) finds them in the columns the page is read in."""
    def move(page: dict, key: str) -> list:
        dx = shifts.get(page['page_number'], 0.0)
        return [[x0 + dx, y0, x1 + dx, y1] for x0, y0, x1, y1 in page.get(key, [])]
    return {**observation, 'pages': [{**page, 'unread_ink': move(page, 'unread_ink'), 'unread_seams': move(page, 'unread_seams')}
                                     for page in observation.get('pages', [])]}


def gated(logicals: list) -> list:
    """The logical pages the gates of the OCR pages look at: every one OCR read, the ones the builder leaves out
    (`built.skipped`) too. An OCR page whose amount heading is misread has no amount column either, so it is left out as
    a list of its own, and only these gates see its amounts. A list that is no table declares its column `excluded`."""
    return [logical for logical in logicals if logical.ocr]


def unlearned_amounts(logicals: list, ocr_pages: frozenset, observation: dict | None = None) -> list[dict]:
    """Amounts OCR read, and ink it left unread (`unread_ink`, page coordinates), in a column of no kind: its heading is
    one the text pages do not print (OCR misread it), so nothing teaches whether it holds amounts, and the builder reads
    no amount there. A column the settings declare not read (`ignore`, `excluded`) is no such column."""
    unknown = [band for logical in logicals for band in logical.bands
               if band.kind is None and not band.ignored and not band.excluded and band.page in ocr_pages]
    found = [{'kind': 'amount in a column of no kind', 'page': glyph.page, 'box': glyph.original, 'header': '／'.join(band.header)}
             for band in unknown for glyph in band.words if is_amount(glyph.text)]
    for page in (observation or {}).get('pages', []):
        for box in page.get('unread_ink', []):
            cx, cy = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
            found += [{'kind': 'amount in a column of no kind', 'page': page['page_number'], 'box': box, 'header': '／'.join(band.header)}
                      for band in unknown if band.page == page['page_number']
                      and band.x0 - band.offset < cx < band.x1 - band.offset and band.body_top < cy < band.body_bottom]
    return found


def frame_rules(page: Page, layouts: Counter, spread: dict | None = None, staircase: bool = False) -> list[Rule]:
    """The inner rules of the most printed column layout that fits each frame of the page and that it lacks.

    A layout fits a frame when it is about as wide and every rule the page has lies on one of its edges, so a
    frame the text pages never print gets none."""
    added: list[Rule] = []
    for x0, x1, top, bottom, edges in _frames(page, spread, staircase):
        own = [e - x0 for e in edges]
        for (template, spans), _ in layouts.most_common():
            scale = (x1 - x0) / template[-1]
            if abs(scale - 1) > WIDTH_TOLERANCE:
                continue
            scaled = [e * scale for e in template]
            if not all(any(abs(o - t) <= EDGE_TOLERANCE for t in scaled) for o in own):
                continue
            for edge, span in zip(scaled[1:-1], spans):
                if span is not None and not any(abs(o - edge) <= EDGE_TOLERANCE for o in own):
                    added.append(Rule(x0 + edge, top + span[0], x0 + edge, min(bottom, top + span[1])))
            break
    return added


def completing(layouts: Counter, spread: dict | None = None, staircase: bool = False):
    """`scan.pages`' hook on the rules it detects on a rendered page: the page with the columns of the text pages' layout."""
    def complete(detected: pdf_rules.PageRules) -> pdf_rules.PageRules:
        from dataclasses import replace
        page = Page(detected.page, detected.width, detected.height, [],
                    [Rule(r.position, r.start, r.position, r.end) for r in detected.vertical]
                    + [Rule(r.start, r.position, r.end, r.position) for r in detected.horizontal])
        added = frame_rules(page, layouts, spread, staircase)
        thickness = max((r.thickness for r in detected.vertical), default=0.0)
        return replace(detected, vertical=tuple(sorted([*detected.vertical, *(pdf_rules.Rule(r.x0, r.y0, r.y1, thickness) for r in added)],
                                                       key=lambda r: (r.position, r.start)))) if added else detected
    return complete
