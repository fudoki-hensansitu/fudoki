"""Axis quirk: an office printed with itself as its department (`日本橋特別出張所 2,332,236千円 [日本橋特別出張所]`,
131024) heads the items printed under it at its indentation, as a department in brackets does (`(財政課) 138,154,166`)."""
import re

SCOPE = 'axis'
OPTIONS = {'const': True}


def heading(name: str) -> bool:
    office = re.fullmatch(r'([^\[\]]+)\[([^\[\]]+)\]', name)
    return office is not None and office.group(1) == office.group(2)
