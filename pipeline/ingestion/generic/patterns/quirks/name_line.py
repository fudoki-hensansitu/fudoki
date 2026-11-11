"""Axis quirk: the axis prints an item's number alone on the line above its name and its amount on the name's line
(八丈町 R6's 節: `1` / `報酬 30,240`), so the first 節 of a 目 prints its name and amount on the 目's own line.

The item opens on its name's line (it follows the 目 it belongs to), it stays an item of the 目's row even where its
number was read into its name (`10需用費`), and an amount in the axis's columns goes to the item one of whose lines it
is printed on before the first line of an item farther left (the 目)."""
SCOPE = 'axis'
OPTIONS = {'const': True}


def anchor(item, lone_number) -> float | None:
    """The centre of the name's line when the item's first line is its number alone."""
    if len(item.lines) > 1 and item.lines[0] and item.lines[1] and lone_number(item.lines[0]):
        return sum((g.y0 + g.y1) / 2 for g in item.lines[1]) / len(item.lines[1])
    return None


def owner(items: list, y: float, reach, roles: tuple[str, ...]):
    """The item of the nearest group with a line on the amount's line `y`, if any."""
    centre = lambda line: sum((g.y0 + g.y1) / 2 for g in line) / len(line)
    own = [i for i in items if i.role in roles and any(line and abs(centre(line) - y) <= reach(line) for line in i.lines)]
    return max(own, key=lambda i: (i.level or 0, -abs(i.anchor - y))) if own else None
