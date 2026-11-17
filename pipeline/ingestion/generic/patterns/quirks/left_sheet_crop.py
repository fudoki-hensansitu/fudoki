"""Document quirk: with `text_layer.crop_box`, the right half of a sheet is cut from the sheet of the page before it,
when that page shows the left half. 132284 R6 当初 後期高齢者医療 prints the sheet of the right page with one 説明 row
fewer (物理15頁 lacks the `01 講師等謝礼 (138)` that 物理14頁 holds), so the right half of its own sheet sits one row
above the left half of the page before. The page keeps its own number: the half it shows is the right page's."""
SCOPE = 'document'
OPTIONS = {'const': True}


def sheet_of(number: int, boxes: dict) -> int:
    """The page whose sheet page `number` is cut from: the page before when its CropBox ends where this one begins."""
    before = boxes.get(number - 1)
    return number - 1 if before is not None and before[2] == boxes[number][0] and before[0] < boxes[number][0] else number
