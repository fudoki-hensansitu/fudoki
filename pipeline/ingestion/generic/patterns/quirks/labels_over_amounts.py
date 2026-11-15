"""Axis quirk: notes printed as a small table, each label set right over its amount and the pairs side by side
(栃木県の決算書の備考: `継続費繰越  繰越明許費  継続費繰越不用額` / `668,218,800  519,459,000  1,727,000`). Read
line by line, the labels make one name and the amounts one line under it, and only the first amount stays. Each
label with the amount right under it (their right ends aligned) is a note of its own."""
from ingestion.generic.layout import is_amount, normalize, text
from ingestion.generic.notes import reads_as_note

SCOPE = 'axis'
OPTIONS = {'const': True}


def _labels(label: list) -> list[list]:
    """The label's words grouped into the labels the gaps part (a gap of a character's height or more)."""
    groups: list[list] = []
    for word in sorted(label, key=lambda g: g.x0):
        height = word.y1 - word.y0
        if groups and word.x0 - groups[-1][-1].x1 < height:
            groups[-1].append(word)
        else:
            groups.append([word])
    return groups


def _below(labels: list[list], words: list) -> list | None:
    """The amount right under each label, its right end aligned with the label's, on one line; None unless every
    label has one and the line prints no other amount."""
    bottom = max(g.y1 for group in labels for g in group)
    height = max(g.y1 - g.y0 for group in labels for g in group)
    page = labels[0][0].page
    under = [w for w in words if w.page == page and 0 <= w.y0 - bottom <= height and is_amount(normalize(w.text))]
    if len(under) != len(labels):
        return None
    pairs = []
    for group in labels:
        right = max(g.x1 for g in group)
        found = [w for w in under if abs(w.x1 - right) <= height]
        if len(found) != 1:
            return None
        pairs.append(found[0])
    return pairs if len({id(w) for w in pairs}) == len(pairs) else None


def split(entries: list[tuple], words: list) -> tuple[list[tuple], set[int]]:
    """The entries with each such table read as one entry a pair (label, amount), and the indices of those entries.
    `words`: the group's printed words (a line of amounts alone keeps only its first amount as an entry)."""
    result: list[tuple] = []
    notes: set[int] = set()
    skip: set[int] = set()
    for index, (label, money, code, name) in enumerate(entries):
        if index in skip:
            continue
        labels = _labels(label) if label and not money and code is None else []
        amounts = _below(labels, words) if len(labels) > 1 and all(reads_as_note(text(g)) for g in labels) else None
        if amounts is None:
            result.append(entries[index])  # the same entry, so a role judged for it stays with it
            continue
        used = {id(w) for w in amounts}
        following = entries[index + 1] if index + 1 < len(entries) else None
        if following is not None and not following[0] and all(id(g) in used for run in following[1] for g in run):
            skip.add(index + 1)  # the line of amounts, read as the amount of the joined labels
        for group, amount in zip(labels, amounts):
            notes.add(len(result))
            result.append((group, [[amount]], None, normalize(text(group))))
    return result, notes
