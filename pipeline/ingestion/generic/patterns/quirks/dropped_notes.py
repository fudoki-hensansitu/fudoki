"""Document quirk: notes that are no note (132021). A note of one of these hints is laid on no 注記 axis; its digits
are a coverage exclusion of that kind with this reason. 財源内訳 comes from `note_kinds` (`（特定財源 9,533
一般財源 3,016,275）`, the funding of the item above), 職員 from the axis quirk `head_counts` (`２６人`)."""
SCOPE = 'document'
OPTIONS = {'const': True}

REASONS = {
    '財源内訳': '事業の金額の財源の内訳（（特定財源 X 一般財源 Y））。歳出の金額ではない。',
    '職員': '上の行の人数（２６人）。歳出の金額ではない。',
}
