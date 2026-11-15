"""Document quirk: a 項・目 printed without its code (one the year drops, `傷病手当金 0 50 △50`, 131211; also 132063)
starts its name where the names of its level start, not where their codes do: its level is the one whose names
start nearest. An abolished 款 printed without its number (`諸支出金 0 24,232 △24,232`, 132047 R2) too. Read by the subject pattern `indent`."""
from collections import defaultdict

from ingestion.generic.layout import SUBJECT_LEVELS, normalize
from ingestion.generic.patterns import document_quirk

SCOPE = 'document'
OPTIONS = {'const': True}


def relevel(coded: list, nodes: list, centres: list[float], edge) -> None:
    names: dict[int, list[float]] = defaultdict(list)
    glued = document_quirk('glued_subject_codes')
    for item in coded:
        line = next((line for line in getattr(item, 'lines', ()) if line and normalize(line[0].text) == item.code), None)
        start = line[1].x0 if line is not None and len(line) > 1 else None
        # A code printed in one word with the name's first character (the quirk `glued_subject_codes`, `1.議`, 132047
        # R2): the name starts after the code's digits and its point, each a half-width character.
        if start is None and glued is not None and item.glyphs and glued.module.digits(item.glyphs[0]) == item.code \
                and len(item.glyphs[0].text) > len(item.code) + 1:
            start = item.glyphs[0].x0 + (len(item.code) + 1) * glued.module.digit_width(item.glyphs[0])
        if start is not None:
            names[item.level].append(start - item.indent + edge(item))  # the name's start, measured as `edge` is
    starts = {level: sorted(xs)[len(xs) // 2] for level, xs in names.items() if len(xs) >= 3}
    # Only where each level's names start a step right of the level above (not in one name column for all, 131229).
    ordered = [starts.get(level) for level in range(len(centres))]
    if len(centres) > 1 and None not in ordered and all(b - a > 3 for a, b in zip(ordered, ordered[1:])):
        for item in nodes:
            # A codeless line set where the codes start (`傷病手当金` at its 項's code, 131202) keeps its level.
            near = lambda xs: min(abs(x - edge(item)) for x in xs)
            # A tie is a name set where the next level's codes start (132063: 項's names at 目's codes): the name wins.
            if item.code is None and near(starts.values()) <= near(centres):
                item.level = min(starts, key=lambda level: abs(starts[level] - edge(item)))
                item.level_name = SUBJECT_LEVELS[item.level] if item.level < len(SUBJECT_LEVELS) else None
