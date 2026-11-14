"""Document quirk: a scan breaks a column rule of a staircase for a pixel (`gapped_column_rules`, 132021 R6 p156: the
項 column's left rule under `3 民生費`, 507–538 and 539– apart). The piece above the break is too short for the page's
rule detector, so a code printed beside it reads one level up (`1 社会福祉費` as a 款). Between two row rules at the
place of a column rule the page draws elsewhere, ink broken by no more than `GAP` pixel rows is a column rule
(`scan.short_rows`)."""
import numpy as np

SCOPE = 'document'
OPTIONS = {'const': True}

GAP = 2  # pixel rows of white a stroke may break for


def inked(strip: np.ndarray) -> bool:
    """Whether one of the strip's pixel columns is ink from top to bottom but for breaks of at most `GAP` rows."""
    for column in strip.T:
        white = np.flatnonzero(np.diff(np.concatenate(([1], column.astype(int), [1]))))
        if all(end - start <= GAP for start, end in zip(white[::2], white[1::2])):
            return True
    return False
