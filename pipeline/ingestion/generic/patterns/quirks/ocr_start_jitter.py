"""Document quirk: in a scan, OCR boxes the start of a numbered line's name two ways, from the first character it read
(`01 消耗品費` → 597.7) or from the code's box and the usual gap (→ 592.4), and both are frequent: the breakdown's
learned levels hold two centres half a character apart for one printed level (奥多摩町 R8 当初 後期高齢者医療の説明,
579.9 592.4 598.0 606.7, where the page prints the coded items at one start and their unnumbered parts a character
right). A level is a character: centres closer than `INDENT_SPAN` are one level, at their middle."""
SCOPE = 'document'
OPTIONS = {'const': True}
INDENT_SPAN = 6.0  # pt: one indentation step is a character (about 10pt); a level is narrower than this


def merge(centres: list[float]) -> list[float]:
    merged: list[list[float]] = []
    for centre in sorted(centres):
        if merged and centre - merged[-1][-1] < INDENT_SPAN:
            merged[-1].append(centre)
        else:
            merged.append([centre])
    return [sum(group) / len(group) for group in merged]
