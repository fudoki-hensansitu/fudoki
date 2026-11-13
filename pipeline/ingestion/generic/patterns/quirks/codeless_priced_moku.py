"""Document quirk: the subject column prints a 目 and, below it, its 事業 (`fourth_level_axis`), the 事業 a column
right of the 目's code and its amounts alone in the row under its name (奥多摩町の予算書: `(01)議会事務局費` / `13,622 …`).
A 目 the year drops prints no code, and its name stands in the 事業's column (`参議院議` / `員選挙費` with `0 11,311
△11,311`) over its 事業, whose code is left blank (`( )参議院議員選挙費`). Read by the subject pattern `bands` with the
quirk `bracketed_subjects`.

A codeless item of the deepest column that prints its amounts on its own line is no 事業 (a 事業 prints them on the row
below): it is a 目, one column up."""
SCOPE = 'document'
OPTIONS = {'const': True}


def shift(items: list, group, priced: set, bracketed) -> None:
    deepest = len(group.bands) - 1
    for item in items:
        if item.code is None and item.level == deepest and deepest > 0 and id(item) in priced and not bracketed(item):
            item.level = deepest - 1
