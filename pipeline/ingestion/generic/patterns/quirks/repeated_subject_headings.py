"""Document quirk: a continuation page prints the open 項・目 again at the top of the subject column, names only
(`総務管理費` over `30 企画費` in one ruled cell, 132063 当初予算). The lines above the first code of a cell are those
headings repeated, not the start of the code's name: the subject column takes them out as the axis quirk
`heading_repeated_over_code` does for a breakdown, and the subject's continuation-page reading then finds them to be
the open headings. Read by the subject pattern `indent`."""
from ingestion.generic.patterns.quirks.heading_repeated_over_code import split

SCOPE = 'document'
OPTIONS = {'const': True}

__all__ = ['split']
