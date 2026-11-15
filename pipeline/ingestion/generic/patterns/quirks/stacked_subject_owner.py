"""Document quirk: a kind word stacked in a ruled amount cell (`繰越明許`) is printed on the first line of a 科目 whose
name wraps, and the amount under it beside the name's second, codeless line (132187 R5 決算書: `3 戸籍住民基本` /
`台帳費`). The first amount after the kind word, in the same ruled cell, is the item's on the kind word's line."""
SCOPE = 'document'
OPTIONS = {'const': True}
