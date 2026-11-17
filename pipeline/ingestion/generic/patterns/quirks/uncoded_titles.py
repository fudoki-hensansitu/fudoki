"""Document quirk: a 款 the year drops prints its title row without its numbers (`特別区債` `特別区債` in place of
`第20款 特別区債` `第1項 特別区債`, 131237 R5 当初 歳入), over a header printed again inside the page. A row above such a
header that prints no figure is that title, as a `第N款` row is: it stays outside the bands, no item of the table."""

SCOPE = 'document'
OPTIONS = {'const': True}
