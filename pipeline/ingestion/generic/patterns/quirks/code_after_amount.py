"""Document quirk: OCR reads an amount set flush right against a column rule and the item number just past the rule
as one word (`445,6791` for the 節 amount `445,679` and the 説明's `1 職員人件費`, 132209 R8 当初予算). An even share of
the box puts the cut a digit or two early, as the gap before the number widens the box. Where one rule cuts such a word,
the amount's groups of three say where it ends; the digits after it are the number's. A two-digit amount's box runs
past the rule into the number (`15` boxed 11pt past it beside `1 市民協働事業費`): a rule within its last character's
width cuts the padding, not a digit."""
import re

SCOPE = 'document'
OPTIONS = {'const': True}

AMOUNT_THEN_CODE = re.compile(r'(△?[0-9]{1,3}(?:,[0-9]{3})+)([0-9]{1,3})')


def pieces(text: str) -> tuple[str, str] | None:
    """The amount and the number of a word read across one rule, or None."""
    found = AMOUNT_THEN_CODE.fullmatch(text)
    return (found.group(1), found.group(2)) if found else None


def overrun(text: str, sliver: float, width: float) -> bool:
    """Whether a two-digit amount cut by one rule only overruns it, so the whole reading is the amount's."""
    return re.fullmatch(r'[0-9]{2}', text) is not None and sliver < width
