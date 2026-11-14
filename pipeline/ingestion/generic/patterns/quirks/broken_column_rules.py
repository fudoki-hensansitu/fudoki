"""Document quirk: the column rules of a scan break at the header's bottom rule (133035 当初予算).

- The first body row of a page runs across the columns with no column rule in it (a 事業 heading `(1)車両費` ruled
  above and below), so the rules of the header's lower cells (`国都支出金`・`地方債`, `区分`・`金額`) are read only below
  that row and the header's cells run together. A column rule that starts on the rule closing that first row, with
  no rule at its x in the header, is drawn up to the lowest rule of the header that crosses it.
- The body's rows print the names of the 財源 across the amount columns (`(都)子供・子育て支援交付金` over 本年度 and
  前年度), so on such a page a column rule shows only in the header and in pieces too short to be read. A column rule
  that ends at the header's bottom, with no rule at its x below it, runs down to the frame's bottom."""

SCOPE = 'document'
OPTIONS = {'const': True}

ROW = 20  # the most a first body row stands between the header's bottom and the rule under it, in points


def repaired(page, spread: dict | None, header: dict | None):
    """The page with its broken column rules drawn on, frame by frame."""
    from dataclasses import replace
    from ingestion.generic.layout import _frames, _header_bottom, _joined
    from ingestion.generic.patterns import document_quirk
    horizontals = _joined([r for r in page.rules if not r.vertical])
    verticals = [r for r in page.rules if r.vertical]
    one_row = document_quirk('one_row_header') is not None
    for frame in _frames(page, spread, bool((header or {}).get('staircase')), bool((header or {}).get('open_frame'))):
        verticals = extend(verticals, horizontals, frame, _header_bottom(page, frame, one_row))
    return replace(page, rules=[r for r in page.rules if not r.vertical] + verticals)


def extend(verticals: list, horizontals: list, frame, header_bottom: float) -> list:
    from dataclasses import replace
    x0, x1, top, bottom, _ = frame
    crossing = lambda h, x: h.x0 < x - 2 and h.x1 > x + 2
    inside = lambda r: x0 + 3 < r.x0 < x1 - 3
    at = lambda r: [v for v in verticals if abs(v.x0 - r.x0) <= 2 and v is not r]
    added = []
    for rule in verticals:
        if not inside(rule):
            continue
        if header_bottom + 3 < rule.y0 <= header_bottom + ROW:
            if any(v.y0 < header_bottom and v.y1 > header_bottom - 3 for v in at(rule)):
                continue
            if not any(abs(h.y0 - rule.y0) <= 2 and crossing(h, rule.x0) for h in horizontals):
                continue
            above = [h.y0 for h in horizontals if top + 1 < h.y0 < header_bottom - 3 and crossing(h, rule.x0)]
            if above:
                added.append(replace(rule, y0=max(above), y1=header_bottom))
        elif rule.y0 < header_bottom - 3 and abs(rule.y1 - header_bottom) <= 3 and bottom - header_bottom > 2 * ROW:
            if not any(v.y1 > header_bottom + 3 for v in at(rule)):
                added.append(replace(rule, y0=header_bottom, y1=bottom))
    return verticals + added
