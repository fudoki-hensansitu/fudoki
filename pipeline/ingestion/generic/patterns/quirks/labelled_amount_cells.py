"""Document quirk: an amount column prints a kind's label over its amount in one ruled cell (葛飾区の決算書 2023 p114,
翌年度繰越額: `繰越明許費` / `113,333,000`), so the amount sits on the second line of the row. Where the subject's name
wraps there too (`1 都市整備管理` / `費`), the name's second line has an amount on its line as well as the first, and
without the quirk it stays an item of its own that takes the row's amounts. With the quirk, a codeless line in the same
amount cell as the coded line above it continues that line's name even when both print amounts (`tree.build`)."""
SCOPE = 'document'
OPTIONS = {'const': True}
