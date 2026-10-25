from collections import Counter
from functools import lru_cache
from ingestion.generic.headers import by_characters, SEPARATOR



MIN_SUBSET_CHARS = 6  # a shorter reading says too little to name a heading
MIN_SUBSET_SHARE = .6


@lru_cache(maxsize=256)
def by_subset(segments: tuple[str, ...], known: frozenset[str]) -> str | None:
    """The known `group／kind` under the printed group whose kind has all the characters the printed kind
    has (counted) and the printed kind is most of it, the one it fills most; None when none or a tie."""
    group, printed = segments
    wanted = Counter(c for c in printed if not c.isspace())
    if sum(wanted.values()) < MIN_SUBSET_CHARS:
        return None
    found = []
    for heading in known:
        head, _, kind = heading.partition(SEPARATOR)
        if head != group or not kind or SEPARATOR in kind:
            continue
        have = Counter(kind)
        share = sum(wanted.values()) / len(kind)
        if all(have[c] >= n for c, n in wanted.items()) and share >= MIN_SUBSET_SHARE:
            found.append((share, heading))
    best = max(found, default=None)
    return best[1] if best and sum(1 for share, _ in found if share == best[0]) == 1 else None


def kind(segments, known):
    found = by_characters(segments[-1], frozenset(known)) if len(segments) > 1 else None
    if found is not None and SEPARATOR not in found:
        return found
    if len(segments) == 2:
        # The kind printed in three lines or in a narrow cell, read across and with a character or two lost
        # (`予算現額／費予及増び流出用減` for `予算現額／予備費支出及び流用増減`, Paddle): the heading under the same group
        # whose characters hold the path's, when it is the only one.
        found = by_subset(tuple(segments), frozenset(known))
        if found is not None:
            return found
    return None
