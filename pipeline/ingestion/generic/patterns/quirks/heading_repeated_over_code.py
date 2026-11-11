"""Axis quirk: a codeless line above a code in its ruled cell is the heading of the page before, repeated: not the
start of the code's name (`医療費` over `02市単独事業`, 132276)."""
SCOPE = 'axis'
OPTIONS = {'const': True}


def split(entries: list[tuple], single: dict) -> set[int]:
    """Take the lines above each cell's code out of its name (`single`: index → its cell's members); they are returned."""
    repeated: set[int] = set()
    for i, members in list(single.items()):
        number = next(m for m in members if entries[m][2] is not None)
        if i < number:
            del single[i]
            repeated.add(i)
        else:
            single[i] = tuple(m for m in members if m >= number)
    return repeated
