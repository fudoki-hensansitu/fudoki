"""Axis quirk: an item whose name fills its line prints its amount at the end of the funding line under it
(世田谷区の予算説明書 2023 p79: `10 会計年度任用職員の人件費（子ども・若者部）（子ども・若者部）` / `特財：国庫支出金 17,519、
都支出金 7,254 220,985`). The funding line is a note (`note_kinds`), so the item would print no amount. With the quirk, a
node with no amount followed on its page by such notes (the funding line is read as one note per `、`) takes the first
of their amounts that ends where the amounts of the axis's items on the page end (within `EDGE`), and the notes keep
the rest. Read in `tree.apply_layout`."""
SCOPE = 'axis'
OPTIONS = {'const': True}

EDGE = 3.  # pt


def move(items: list) -> None:
    right = lambda run: max(g.x1 for g in run[1])
    edges: dict[int, list[float]] = {}
    for item in items:
        if item.role == 'node' and item.amounts:
            edges.setdefault(item.page, []).extend(right(run) for run in item.amounts)
    for index, item in enumerate(items):
        if item.role != 'node' or item.amounts:
            continue
        for after in items[index + 1:]:
            if after.role != 'annotation' or after.page != item.page:
                break
            found = [run for run in after.amounts if any(abs(right(run) - edge) <= EDGE for edge in edges.get(item.page, []))]
            if found:
                after.amounts.remove(found[-1])
                item.amounts.append(found[-1])
                break
