"""Document quirk: the 款・項・目 a page goes on with are printed again at its top, on the line of the 節 amount that
goes on there (`１ ２農業総務費` beside `25` of `18 負担金補助及び` / `交付金`, 稲城市の予算説明書, the amount at the
height between the two lines of the 節's name). The heading printed again takes no amount of its line: the amount is
the item's whose lines span it. Read in `tree.build` (the roles that may own an amount)."""
SCOPE = 'document'
OPTIONS = {'const': True}
