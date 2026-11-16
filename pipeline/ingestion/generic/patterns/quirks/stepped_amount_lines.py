"""Document quirk, for the breakdown pattern `amount_ends`: a line set one step in from the line above, its name a few
points right and its amount a few points left of that line's, is that line's breakdown even where its amount ends
within the edge of the outer level (小笠原村 R5 当初予算 p89: `1 減債基金積立金 438` over `1 減債基金積立金 438`, the
inner amount 4.4pt left of the outer one, while the inner level's amounts end 25pt left elsewhere)."""
SCOPE = 'document'
OPTIONS = {'const': True}
STEP = 3.0  # pt: both the name and the amount stand at least this far from the line above's


def deeper(item, above, end: float, above_end: float) -> bool:
    return above_end - end >= STEP and item.indent - above.indent >= STEP
