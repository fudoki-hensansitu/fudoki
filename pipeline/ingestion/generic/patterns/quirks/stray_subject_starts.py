"""Document quirk: a few subject codes are printed a step left of where their level's codes start (千代田区の決算書 2023:
`2 賦課徴収費` on the page 25 sets its `2` 5pt left of the other 目), and their starts gather between two levels as a
fourth one. 款・項・目 are three levels: while more than three are found, the start shared by the fewest codes is no
level, and its codes take the level whose codes start nearest. Read by the subject pattern `indent`."""
from ingestion.generic.layout import SUBJECT_LEVELS

SCOPE = 'document'
OPTIONS = {'const': True}


def fold(levels: list[list[float]]) -> list[list[float]]:
    levels = list(levels)
    while len(levels) > len(SUBJECT_LEVELS):
        levels.remove(min(levels, key=len))
    return levels
