"""Document quirk: an item's kind lines stack seven deep in its cell (`計` / `当初` / `補正` / `継続費及び繰越事業費繰越額`
over two lines / `流用増減`, 132063 決算書 R5 p94 `25 財産管理費`), further under its name than the six heights the
amounts of a cell's lines are read within. With the quirk the stack runs to eight heights (`tree._owner`)."""

SCOPE = 'document'
OPTIONS = {'const': True}
