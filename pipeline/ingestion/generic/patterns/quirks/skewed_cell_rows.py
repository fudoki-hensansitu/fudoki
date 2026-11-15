"""Document quirk: a skewed scan draws a short row rule between two column rules a pixel row higher at one end than at
the other (`skewed_cell_rows`, 134015 R5 p18: the header's bottom rule over the 目 column, 87–170, while the rule over
the other columns is read as one). No pixel row is ink across the whole cell, so the cell has no bottom and its column
is lost. Ink in any of `DRIFT` pixel rows around a row, at every pixel column of the cell, is a row rule
(`scan.short_rows`). A column rule read in two pieces a little apart (86.8 down to 393, 88.5 from 426) bounds the cell
with the piece beside it: each rule pairs with the nearest rule to its right whose length overlaps it."""
import numpy as np

SCOPE = 'document'
OPTIONS = {'const': True}

DRIFT = 2  # pixel rows above and below a row that the rule may run off to


def joined(cell: np.ndarray) -> np.ndarray:
    """For each pixel row of the cell's ink (rows × columns), whether every column has ink within `DRIFT` rows of it."""
    spread = cell.copy()
    for shift in range(1, DRIFT + 1):
        spread[shift:] |= cell[:-shift]
        spread[:-shift] |= cell[shift:]
    return np.all(spread, axis=1)


def pairs(vertical: list) -> list[tuple]:
    """Each column rule with the nearest rule more than 3pt to its right that runs beside it for some length."""
    return [(left, right) for left in vertical
            if (right := next((r for r in vertical if r.position > left.position + 3
                               and max(left.start, r.start) < min(left.end, r.end)), None)) is not None]
