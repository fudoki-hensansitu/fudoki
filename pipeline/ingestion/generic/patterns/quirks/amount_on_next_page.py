"""Axis quirk: the amount of an item whose name ends a page is printed alone on the first line of the next page
(`1 管理運営業務委託料（債務負担行為解消分）` at the foot of one page, `155,353` at the top of the next, 132063 当初予算).
The line stays a nameless item and joins the name-only item that ended the page before, as the layout option
`wrap: amount_on_last_line` does for that line, without the rest of that option (its wrapped names and notes)."""
SCOPE = 'axis'
OPTIONS = {'const': True}
