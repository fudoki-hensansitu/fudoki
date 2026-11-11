"""Axis quirk: a subtotal printed in brackets (`通信運搬費 (1,568)`, 132195) heads the items that follow it when they add
up to it exactly; those items are one level down and everything else is level one. Indentation cannot say it: the
subtotal's items and the items of a 節 with no subtotal start at the same place."""
from ingestion.generic.layout import normalize, text
from shared.amount import number

SCOPE = 'axis'
OPTIONS = {'const': True}


def apply(items: list) -> None:
    """`items` is the whole axis in reading order: the items may go on on the next page."""
    value = lambda item: number(normalize(text(item.amounts[0][1])).strip('()（）')) if item.amounts else None
    bracketed = lambda item: bool(item.amounts) and text(item.amounts[0][1]).strip().startswith(('(', '（'))
    nodes = [item for item in items if item.role == 'node' and item.level is None]
    for item in nodes:
        item.level = 0
    for index, item in enumerate(nodes):
        total = value(item) if bracketed(item) else None
        if not total:
            continue
        taken, running = [], 0
        for follower in nodes[index + 1:]:
            if bracketed(follower) or value(follower) is None or running + value(follower) > total:
                break
            if follower.amounts:
                taken.append(follower)
                running += value(follower)
            if running == total:
                break
        if running == total:
            for follower in taken:
                follower.level = 1
