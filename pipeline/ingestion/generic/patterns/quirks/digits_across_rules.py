"""Document quirk: a short amount and the number of the next column's first item sit on either side of a column rule
with no space, and the text layer gives them as one word (131121 当初予算の歳入: `7` in 節の金額 and the item number
`2` of 説明 come out as `72`). The layout splits a body word of digits only at a rule between two 款・項・目 columns, so
the 節 would read 72. With the quirk a word of digits only is split, before the page is read, at any column rule on a
character boundary (within 1pt), as `layout.split_digits_at_rules` does for the code columns; a rule that crosses a
character leaves the word whole."""
from ingestion.generic.observe import Page

SCOPE = 'document'
OPTIONS = {'const': True}


def split(page: Page) -> None:
    from ingestion.generic.layout import split_digits_at_rules
    verticals = [r for r in page.rules if r.vertical]
    page.words = [piece for word in page.words for piece in split_digits_at_rules(word, verticals)]
