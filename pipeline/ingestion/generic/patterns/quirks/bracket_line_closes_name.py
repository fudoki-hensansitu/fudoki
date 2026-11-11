"""Axis quirk: a line in brackets ends the name above it; the line under it is the next item
(`(翌年度へ繰越明許費 7,326,000)` closes the name above it, 132021)."""
from ingestion.generic.layout import normalize, text

SCOPE = 'axis'
OPTIONS = {'const': True}


def closes(previous) -> bool:
    return bool(previous.lines) and normalize(text(previous.lines[-1]))[-1:] in (')', '）')
