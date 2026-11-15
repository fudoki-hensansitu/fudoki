"""Axis quirk: the axis prints headings of its own. A line without an amount, followed by a deeper line that prints one,
is a heading: the lines under it are its items, and a line indented past the name above is under it, not its second
line. A heading that ends a page heads the first line of the axis's next page (昭島 R5 決算 p76:
`庁舎外壁等改修工事監理委託` at the foot, `継続費逓次繰越分` and `本年度分` at the top of p77): `heads_over_page`."""
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


def heads_over_page(layout: dict | None, previous, first) -> bool:
    """`previous`, a name-only line read as a note at the foot of a page, heads `first`, the next page's first line."""
    from ingestion.generic.notes import kind_of
    from ingestion.generic.tree import HEADING_INDENT, PAREN_TAIL, _name_start, is_plain_name
    return (previous.role == 'note' and previous.code is None and not previous.amounts and bool(previous.name)
            and previous.lines and kind_of(PAREN_TAIL.sub('', previous.name)) is None
            and first.code is None and bool(first.amounts) and first.page == previous.page + 1
            and first.lines[0][0].x0 > _name_start(previous) + HEADING_INDENT
            and (kind_of(PAREN_TAIL.sub('', first.name)) is None or is_plain_name(layout, first)))
