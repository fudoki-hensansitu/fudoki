"""Document quirk: an item number printed in brackets closes them right after its digits (`(2)  ７歳以上６９歳以下`,
北区 当初予算の説明). The name begins after the closing bracket, also when it begins with a digit (not `)7歳…`), and a
bracket whose digits run on into words is a note in brackets, not a number (`(26所 児童定員2,928人)`,
`(54,300円×91,000人)`)."""
import re

SCOPE = 'document'
OPTIONS = {'const': True}

OPENED = re.compile(r'^[(（]([0-9０-９]{1,4})(.?)')


def split(line_text: str) -> tuple[str | None, str] | None:
    """The number and the name of a line that opens with a bracket and digits, or None for any other line."""
    found = OPENED.match(line_text)
    if found is None:
        return None
    if found.group(2) in (')', '）'):
        return found.group(1), line_text[found.end():].strip()
    return None, line_text
