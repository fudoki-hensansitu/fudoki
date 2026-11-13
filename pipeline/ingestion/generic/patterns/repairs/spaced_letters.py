"""Repair: a name letter-spaced wider than the stack test reaches (132128 R8, `平　和　と　人　権` with `推　進　費` on
the next line, each character under one of the line above). A character with another lone character on its line
within a few of its widths is a letter of that name, not one of a vertically printed word."""

REACH = 3.0


def letter_neighbor(word, other) -> bool:
    width = word.x1 - word.x0
    return len(other.text) == 1 and (abs(other.x0 - word.x1) < REACH * width or abs(word.x0 - other.x1) < REACH * width)
