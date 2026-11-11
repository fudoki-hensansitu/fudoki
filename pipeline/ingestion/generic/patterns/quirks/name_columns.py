"""Axis quirk: a name set in columns (`給　料` | `市長　１人`, 132128). The next lines start at the second column and
carry no first part (`副市長　１人`): they are siblings of the line that opened the columns."""
SCOPE = 'axis'
OPTIONS = {'const': True}


def columned(items: list) -> list[tuple]:
    """(item, the line that opened its columns) for each line that goes on in the columns."""
    found, base = [], None
    for item in items:
        if item.code is not None or item.role != 'node':
            base = None
            continue
        if base is not None and any(abs(item.lines[0][0].x0 - word.x0) <= 1.5 for word in base.lines[0][1:]):
            found.append((item, base))
        elif len(item.lines[0]) > 2:
            base = item
        else:
            base = None
    return found
