"""Axis quirk: an unnumbered line starts where the names of the numbered lines above it start, and is their sibling
(132021 当初予算 2024 の説明: `3 扶養手当 1,380` / `地域手当 5,053` / `時間外勤務手当 1,674`, all items of the 事業, each with its
own amount). By indentation alone it reads one level down. The value is how far right of the numbered line's start
(in pt) the unnumbered line may start and still be its sibling."""
SCOPE = 'axis'
OPTIONS = {'type': 'number', 'exclusiveMinimum': 0}
# A numbered line whose number starts where the numbered line above starts (within `tree.NUMBER_SLACK`) is its sibling
# too: OCR reading the number glued to the name (`4議員共済会負担金`) moves its indent to the name.
