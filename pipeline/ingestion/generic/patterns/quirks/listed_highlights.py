"""Axis quirk: an unnumbered line that prints an amount under a numbered item of the axis is one of the item's main
expenses, listed in part (町田市の予算書 `1. 議員人件費 417,158` / `議員報酬 239,040` / `議員期末手当 113,734`, and
`3. 議会活動費 79,670` lists only `速記料 11,956` and `政務活動費 25,920`): the list does not add up to the item, so
its lines are notes of the item (kind `内訳`), not its children."""
SCOPE = 'axis'
OPTIONS = {'const': True}
KIND = '内訳'


def listed(item) -> bool:
    return item.role == 'node' and item.code is None and bool(item.amounts)
