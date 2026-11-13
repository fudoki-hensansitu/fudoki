"""Document quirk: a row that reprints the codes of its 款・項 (`8` `1`) and prints a name in the 目's column with no code of
its own (`防災食育センター備品整備基金費`, a 目 dropped that year, 武蔵村山市 2024): the name is a codeless item of its
own column, not the name of the 項's code. The codes stay alone and read as the open 款・項 printed again.

The same print as `codeless_beside_repeated_code`, read by another subject pattern: that quirk splits a name off a bare code
on one line of `bands`, this one takes names out of a row whose codes and names `columns` has already read apart."""
SCOPE = 'document'
OPTIONS = {'const': True}


def apart(names: list, owner_of: dict, bands: list, band_index) -> list:
    """The names of the row in a column deeper than every code of the row, taken out of `owner_of`."""
    if not bands:
        return []
    taken = [position for position in list(owner_of) if band_index(names[position][0]) > max(bands)]
    for position in taken:
        del owner_of[position]
    return [names[position] for position in taken]
