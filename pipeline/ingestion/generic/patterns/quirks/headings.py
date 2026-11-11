"""Axis quirk: the axis prints headings of its own. A line without an amount, followed by a deeper line that prints one,
is a heading: the lines under it are its items, and a line indented past the name above is under it, not its second
line."""
SCOPE = 'axis'
OPTIONS = {'const': True}


def indented_under(label, previous) -> bool:
    from ingestion.generic.tree import HEADING_INDENT, _name_start
    return label[0].x0 > _name_start(previous) + HEADING_INDENT


def heads(layout: dict | None, items_: list, position: int) -> bool:
    from ingestion.generic.notes import kind_of
    from ingestion.generic.tree import HEADING_INDENT, PAREN_TAIL, _name_start, is_plain_name
    if position + 1 >= len(items_):
        return False
    item, following = items_[position], items_[position + 1]
    return (following.code is None and bool(following.amounts) and following.page == item.page
            and following.lines[0][0].x0 > _name_start(item) + HEADING_INDENT
            and (kind_of(PAREN_TAIL.sub('', following.name)) is None or is_plain_name(layout, following)))
