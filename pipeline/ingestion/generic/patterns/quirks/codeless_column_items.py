"""Document quirk: a 節 printed with no code takes its amount from the 節 column's own amount band, in the row of
the 目 it goes under (`予備費` beside `100,000` under `1 予備費`, 杉並区の予算説明書 2026, p186). The line is a 節
of the 目, not a note on the 目's row, though it prints no amount on its own line. Read in `tree.build` (the lines
in a subject's row that annotate it)."""
SCOPE = 'document'
OPTIONS = {'const': True}
