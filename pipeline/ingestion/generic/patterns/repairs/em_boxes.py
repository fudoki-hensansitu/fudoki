"""Repair: where the words are built again from the glyphs (`repair.drop_invisible`), a character's box is its em
square, not the box of its ink. A narrow kana starts its ink well inside its square (`ト` 3 pt right of where `券`
starts, 福生市の予算書), and a name led by one would read half a level deeper than the names above it. Read in
`repair._glyphs` (pdfium's loose character box); the module only names the repair."""
