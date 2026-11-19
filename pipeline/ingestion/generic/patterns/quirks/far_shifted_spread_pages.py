"""Document quirk: the right page of a spread is printed further off the left page than the shared joining looks
(清瀬市の決算書 R7 の歳入 p25-26: the right page's row rules sit 11.3pt below the left page's, all by the same
shift). `layout.same_rows` tries shifts up to `SPREAD_MAX_SHIFT` (8pt), so the halves stayed two logical pages
and the right page's 収入済額 had no row. With the quirk the shift may be up to `MAX_SHIFT` (the rows must still
line up within 1pt after the one shift), and the joined right page's row rules move by that shift onto the left
page's, so an amount's ruled cell holds the item printed on its row. The words keep their printed place."""

SCOPE = 'document'
OPTIONS = {'const': True}

MAX_SHIFT = 16.0
