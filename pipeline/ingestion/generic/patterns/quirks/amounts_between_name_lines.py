"""Document quirk: a subject whose name wraps prints its amounts between the name's two lines, not on the first line
(`短期貸付金元利` / `収入` beside `0 139,200 △139,200`, a 目 the year drops, printed without its number at the top of a
page, 131211 R5 当初予算説明書 p8). Without the quirk the row of the name's first line holds no amount, so the line is
read as the open 目 `1 長期貸付金元利収入` printed again (one character apart) and its amounts conflict with that 目's.
With the quirk, whether the subject's row prints amounts (`tree.prints_row_amounts`) is read over the name's height."""
SCOPE = 'document'
OPTIONS = {'const': True}
