"""Document quirk: a character is clipped by more than one path, and it prints only where all of them meet (目黒区の決算書
R5: each page of the spread clips its text to its half and then to its cell; a copy of every line, set 14.3 pt to the
side, is clipped to the other half, so its two paths never meet and it prints nothing). Without the quirk the clip is
the box around all the paths, which the copy meets, and the copy is read with the printed line (`11需用費` twice, the
header `節節`)."""
SCOPE = 'document'
OPTIONS = {'const': True}

# A box that no character meets: its left edge is right of its right edge.
NOTHING = (1.0, 1.0, 0.0, 0.0)


def clip(boxes: list[tuple]) -> tuple:
    """The clip of `boxes` (left, bottom, right, top), each path's box: where all of them meet."""
    left, bottom = max(box[0] for box in boxes), max(box[1] for box in boxes)
    right, top = min(box[2] for box in boxes), min(box[3] for box in boxes)
    return (left, bottom, right, top) if left < right and bottom < top else NOTHING
