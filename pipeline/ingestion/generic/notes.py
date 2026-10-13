"""The kind of a printed note (注記), by the shared annotation dictionary.

`pipeline/shared/fiscal_annotation_map.csv` says which words make a printed line a note and what kind it is
(ADR 0024). The builder asks it twice: while reading lines (an amount printed above its label belongs to the
note below it) and when laying the 注記 axis (`convert.py`). Nothing here is declared per jurisdiction.
"""
from __future__ import annotations

from functools import cache
import re

from ingestion.generic.layout import normalize
from ingestion.lib.annotations import annotation_dictionary

# Dictionary rows that read a cell's own content (a monthly rate, a per-time price) rather than a note's label.
OWN_CELL_KEYWORDS = frozenset({'月額', '1回…円'})
# A transfer printed without the dictionary's words: the 款・項・目 the money moves within (`同款・同項・同目・
# 災害補償費へ`), a section number (`第3節へ`), or a printed account code. Its kind is the dictionary's own
# value (流用), never a new one; a reserve (予備費) is 充用.
TRANSFER_WORDS = re.compile(r'同[款項目]|第?[0-9]+[款項目節]|[款項目節]へ|[へか]ら?流用|から$|へ$')
RESERVE_WORDS = re.compile(r'予備費|充当')
# A line that is only the word of a note, printed under or over its amount (`12,409,365 円` / `流用`).
NOTE_WORD = re.compile(r'(?:予備費)?(?:充当|充用|流用|不用額)')


@cache
def dictionary() -> tuple[tuple[str, str], ...]:
    return tuple((normalize(row['keyword']), row['kind']) for row in annotation_dictionary()
                 if row['keyword'] not in OWN_CELL_KEYWORDS)


def kind_of(label: str, *, words: bool = False) -> str | None:
    """The dictionary kind of a note's printed label: the keyword that ends last, the longer on a tie (the
    way `annotations.py` reads a caption). With `words`, a transfer printed without a keyword still has a
    kind, because the line was already read as a transfer."""
    key = normalize(label)
    matches = [(found.end(), len(keyword), kind) for keyword, kind in dictionary()
               for found in re.finditer(re.escape(keyword), key)]
    if matches:
        return max(matches)[2]
    if words:
        if TRANSFER_WORDS.search(key):
            return '流用'
        if RESERVE_WORDS.search(key):
            return '充用'
    return None


def reads_as_note(label: str) -> bool:
    """A line of the dictionary's words, or only a bare note word (`流用`, `充当`)."""
    return kind_of(label) is not None or NOTE_WORD.fullmatch(normalize(label)) is not None
