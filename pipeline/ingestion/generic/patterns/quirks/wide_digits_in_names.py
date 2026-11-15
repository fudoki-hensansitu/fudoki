"""Document quirk: the document prints its amounts in half-width digits, and a run of full-width digits that ends a
line is the end of a word of the text, not an amount (文京区の決算書 R5 p127 備考: `…議案第１２号、議案第３１` / `号、令和６年…`,
the `１` set a justified gap after `３`). Without the quirk the run reads as the line's amount and splits the note."""
SCOPE = 'document'
OPTIONS = {'const': True}
