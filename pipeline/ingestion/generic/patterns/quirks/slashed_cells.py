"""Document quirk: a cell with no figure is struck through with one diagonal from its left rule to its right rule (奥多摩町
R8 当初 後期高齢者医療・介護保険: the 財源内訳 cells of every 合計 row). OCR leaves the stroke as unread ink as wide as the
cell and no taller than a row: ink that starts at a column rule and ends at the next, a line high, is the slash. A
figure stands right of its left rule and never reaches it."""
SCOPE = 'document'
OPTIONS = {'const': True}
SLACK = 3.0  # pt: how far the stroke's ends may stand off the rules
ROW = 18.0  # pt: the most a stroke across one row is tall


def slashed(box: list, page_: dict, logicals_: list) -> bool:
    if box[3] - box[1] > ROW:
        return False
    return any(b.page == page_['page_number'] and abs(box[0] - (b.x0 - b.offset)) <= SLACK
               and abs(box[2] - (b.x1 - b.offset)) <= SLACK for logical in logicals_ for b in logical.bands)
