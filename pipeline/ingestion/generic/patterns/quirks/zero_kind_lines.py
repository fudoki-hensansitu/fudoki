"""Document quirk: an amount column prints a kind of the amount with a zero on its line (品川区の決算書 R5 の予算現額:
`継続 0` / `予備 0` under `計` / `当初` / `補正`). The line is a kind line as much as one with a grouped amount, so the
band is an amount band with inline kinds, not a label band. Without the quirk only a grouped amount makes a kind line:
a word with a lone zero is a label elsewhere."""
SCOPE = 'document'
OPTIONS = {'const': True}
