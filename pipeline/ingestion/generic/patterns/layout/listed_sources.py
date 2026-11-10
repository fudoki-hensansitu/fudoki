"""Ruled tables whose 説明 column lists the specific revenue of a line with its amounts (世田谷区の予算説明書).

`特財：国庫支出金 763、都支出金 382` prints each source and its amount, the next source after a `、`. Poppler sets the
amount and the next source as one word (`763、都支出金`): the amount is no number to the tree or to the coverage
check. The word is cut after the amount on the observed page itself (digit coverage reads the same words), then the
tables are read as `ruled` reads them.
"""
import re

from ingestion.generic import layout
from ingestion.generic.layout import is_amount, lines, normalize
from ingestion.generic.observe import Word
from ingestion.generic.patterns.layout.running_titles import Carried

LISTED = re.compile(r'^([△▲]?[0-9]{1,3}(?:,[0-9]{3})*)(、.+)$')


def split_listed(words: list[Word]) -> list[Word]:
    """An amount and the next source printed as one word (`60,852、都支出金`) are two words, cut where the `、` starts."""
    result = []
    for word in words:
        found = LISTED.match(word.text)
        if not found:
            result.append(word)
            continue
        width = (word.x1 - word.x0) / len(word.text)
        cut = word.x0 + len(found.group(1)) * width
        result.append(Word(found.group(1), word.x0, word.y0, cut, word.y1))
        result.append(Word(found.group(2), cut, word.y0, word.x1, word.y1))
    return result


STEP = 4  # how far under its printed line a source is read: past `layout.lines`' tolerance, short of the next line


def source_lines(words: list) -> list:
    """The words of a label column with each `、` source after an amount moved to a line of its own."""
    result = []
    for line in lines(words):
        moved = 0
        for index, word in enumerate(line):
            if index and normalize(word.text).startswith('、') and is_amount(normalize(line[index - 1].text)):
                moved += 1
            if moved:
                word = Carried(word.text, word.x0, word.y0 + STEP * moved, word.x1, word.y1 + STEP * moved,
                               word.page, word.offset, word.original)
            result.append(word)
    return result


def read(pages, **options):
    for page in pages:
        page.words = split_listed(page.words)
    logicals = layout.logical_pages(pages, **options)
    for logical in logicals:
        for band in logical.bands:
            if band.kind == 'label':
                band.words = source_lines(band.words)
    return logicals
