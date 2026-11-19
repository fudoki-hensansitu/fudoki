"""Document quirk: a continuation page prints the open 款・項・目 codes again at its top, codes only, and the text layer
joins the 項's and the 目's code into one word-run (132021 当初予算 R7 介護保険事業特別会計 p131: `2` `3` `1` over the
財源内訳 of 目「審査支払手数料」 going on, read as a 項「31」 with no name). Before any subject opens on the page, a line
with no name and no amount whose code is the open headings' codes joined is the deepest of them printed again."""
import re

SCOPE = 'document'
OPTIONS = {'const': True}


def repeated(stack: list, item):
    """The open heading the line prints again, or None."""
    code = re.sub(r'\s', '', item.code or '')
    codes = [re.sub(r'\s', '', s.code) for s in stack if s.code]
    if not stack or not stack[-1].code:
        return None
    return stack[-1] if any(''.join(codes[-k:]) == code for k in range(2, len(codes) + 1)) else None
