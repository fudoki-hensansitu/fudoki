"""Axis quirk: a 事業 is printed with its six-digit code glued to its name (東村山市の当初予算の特別会計の説明
`012311職員人件費等(介護保険課)`), the 節 under it with a four-digit number set apart (`0201 給料`), and the 細節 under
that with a seven-digit code glued to its name (`0201100職員給`). An item number has at most four digits (`tree.CODE`),
so without the quirk the 事業 and the 細節 are lines without a number, and the 節 takes the first level beside the
事業. With the quirk the six and seven digits are numbers, and a number of more than four digits is a numbering shape
of its own length (`tree.shape_of`), so 事業, 節 and 細節 take three levels."""
import re

SCOPE = 'axis'
OPTIONS = {'const': True}
GLUED = re.compile(r'([0-9]{6,7})\s*(?=[^0-9０-９\s])')


def split(raw_text: str) -> tuple[str, str] | None:
    """(code, name) of a line that begins with six or seven digits glued to its name; None for any other line."""
    found = GLUED.match(raw_text)
    return (found.group(1), raw_text[found.end():].strip()) if found and found.end() < len(raw_text) else None
