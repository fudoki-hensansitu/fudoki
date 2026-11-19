"""Document quirk: a right page scanned a little higher or lower than its left page (大田区 R5〜R7 の予算説明書の歳入:
4pt higher) puts a 節 in the row above its 目. After the 歳入's left page (`redrawn_facing_pages`), the right page is
moved so that its frame's top meets the left page's. A book whose spreads are read as they lie (港区 R5〜R7 の歳入:
2〜3pt apart) takes no move: the words would leave the ink they were read from and the ink would read as unread."""
SCOPE = 'document'
OPTIONS = {'const': True}
