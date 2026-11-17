"""Axis quirk: every line of the breakdown that prints no number of a declared mark is a note of the item above it
(積算), with its amounts (台東区 当初予算の歳入: the 節 are the numbered lines of the 節及び計上説明, and the lines
under them, `均等割 3,000`, `運用原資 15,000` and the rows of a table drawn in characters, `医療連携推進 1,345`,
reckon the 節's amount). The numbered lines are the breakdown's items. A numbered line that prints no amount sets
it on the line under its name (`5 避難所環境整備・…事業費` / `123,284 〔危機・災害対策課〕`): that line is the item's own."""
SCOPE = 'axis'
OPTIONS = {'const': True}
KIND = '積算'


def note(item, mark, before) -> bool:
    """Whether the line is a note: it prints no number and starts with no declared mark, and is not the amount line
    of the numbered line before it."""
    waiting = before is not None and before.role == 'node' and before.code is not None and not before.amounts
    return item.code is None and mark is None and not waiting
