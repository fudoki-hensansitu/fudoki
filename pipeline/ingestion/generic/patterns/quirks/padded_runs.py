"""Document quirk: two grouped amounts run together across one rule, with another rule only clipping the box's padding
(`12,605,35811,404,052` 5pt past its second cell's right rule, 132080): a rule within a character of an end cuts no digit."""

SCOPE = 'document'
OPTIONS = {'const': True}


def inside(word, inside: list, width: float) -> list:
    inner = [x for x in inside if x - word.x0 >= 1.5 * width and word.x1 - x >= 1.5 * width]
    return inner if len(inner) == len(inside) - 1 else inside
