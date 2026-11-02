# A column's kind (`当初予算額`) printed under the header cell of the item axis that spans every column
# (`節／区分`), so the printed path ends with the axis words, not the kind.
AXIS_WORDS = ('区分', '節')


def kind(segments, known):
    trimmed = list(segments)
    while len(trimmed) > 1 and trimmed[-1] in AXIS_WORDS:
        trimmed.pop()
    if len(trimmed) == len(segments):
        return None
    path = '／'.join(trimmed)
    return path if path in known or trimmed[-1] in known else None
