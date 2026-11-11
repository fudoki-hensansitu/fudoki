"""Document quirk: an account code printed with the amount of a transfer (`・020601【010261】 △28,800`, 132136) and the
words that say where it went on the line below (`020000へ予算流用減`) are one note. At the foot of a page the words
are on the first line of the next table page (a page of headings only may lie between): the kind is the next page's.
(Joining the two lines would put one item's glyphs on two pages.)"""
from ingestion.generic.notes import kind_of

SCOPE = 'document'
OPTIONS = {'const': True}


def below(previous, label_text: str) -> bool:
    from ingestion.generic.tree import is_account_code
    return is_account_code(previous.name) and kind_of(label_text, words=True) is not None
