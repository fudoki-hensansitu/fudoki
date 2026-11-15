"""Axis quirk: a department in round brackets too long for its line prints its amount, in brackets too, alone on the
next line (`(新型コロナ感染症対策子育て世帯給付金担当)` / `(30,218,000)`, 132055). The bracketed line heads the items
under it, as `(こども育成課) (321,551,351)` does on one line; it is no remark on the item above."""
from ingestion.generic.layout import normalize, text

SCOPE = 'axis'
OPTIONS = {'const': True}


def heads(entries: list[tuple], index: int) -> bool:
    """The next line prints only one bracketed amount."""
    if index + 1 >= len(entries):
        return False
    label, money, _, _ = entries[index + 1]
    if label or len(money) != 1:
        return False
    shown = normalize(text(money[0]))
    return shown[:1] in ('(', '（') and shown[-1:] in (')', '）')
