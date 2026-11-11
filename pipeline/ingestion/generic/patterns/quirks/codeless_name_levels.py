"""Document quirk: a 項・目 printed without its code (one the year drops, `傷病手当金 0 50 △50`, 131211; also 132063)
starts its name where the names of its level start, not where their codes do: its level is the one whose names
start nearest. Read by the subject pattern `indent`."""
from collections import defaultdict

from ingestion.generic.layout import SUBJECT_LEVELS, normalize

SCOPE = 'document'
OPTIONS = {'const': True}


def relevel(coded: list, nodes: list, centres: list[float], edge) -> None:
    names: dict[int, list[float]] = defaultdict(list)
    for item in coded:
        line = next((line for line in getattr(item, 'lines', ()) if line and normalize(line[0].text) == item.code), None)
        if line is not None and len(line) > 1:
            names[item.level].append(line[1].x0 - item.indent + edge(item))  # the name's start, measured as `edge` is
    starts = {level: sorted(xs)[len(xs) // 2] for level, xs in names.items() if len(xs) >= 3}
    # Only where each level's names start a step right of the level above (not in one name column for all, 131229).
    ordered = [starts.get(level) for level in range(len(centres))]
    if len(centres) > 1 and None not in ordered and all(b - a > 3 for a, b in zip(ordered, ordered[1:])):
        for item in nodes:
            # A codeless line set where the codes start (`傷病手当金` at its 項's code, 131202) keeps its level.
            near = lambda xs: min(abs(x - edge(item)) for x in xs)
            if item.code is None and near(starts.values()) < near(centres):
                item.level = min(starts, key=lambda level: abs(starts[level] - edge(item)))
                item.level_name = SUBJECT_LEVELS[item.level] if item.level < len(SUBJECT_LEVELS) else None
