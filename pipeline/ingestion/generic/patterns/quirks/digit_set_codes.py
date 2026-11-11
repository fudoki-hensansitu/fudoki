"""Document quirk: the subject codes are set right and stopped (`1.議会費`, `10.教育費`, 小笠原村), each digit as wide as
the value (pt). The text layer joins the stop to the code or the name, so the code's own digits cannot be measured (the
pattern `indent` with `codes: right` measures a code printed as a word of its own). A two-digit code starts one digit
before a one-digit code of its level: it is read at the position the one-digit codes start. An item the year drops
prints `×` in place of its code (`×` `参議院議員選挙費`): it is read where a one-digit code would start before its
name, a digit and the stop. Read by the subject pattern `indent`.

The breakdown's names start a digit's width after their code (`1` `役場庁舎建設基金積立金`). Poppler sets a code apart as a
word of its own or joins it to the name (`10特定防衛…`), and a joined word's characters cannot be measured: an item
whose code is joined to its name starts its name the code's digits and a blank after the code starts, as an item whose
code is a word of its own does."""
import re

SCOPE = 'document'
OPTIONS = {'type': 'number', 'exclusiveMinimum': 0}
DROPPED = ('×', '✕')


def align(items: list, digit: float) -> None:
    for item in items:
        first = item.lines[0] if item.lines else []
        if item.code is not None and re.fullmatch(r'[0-9]{2,4}', item.code):
            item.indent += digit * (len(item.code) - 1)
        elif item.code is None and len(first) > 1 and first[0].text in DROPPED:
            item.indent = first[1].x0 - 2 * digit


def measure(items: list, digit: float) -> None:
    """The breakdown's items (see the module doc)."""
    for item in items:
        first = item.lines[0][0] if item.lines and item.lines[0] else None
        if (item.code is not None and first is not None and re.fullmatch(r'[0-9]{1,4}', item.code)
                and first.text.startswith(item.code) and len(first.text) > len(item.code)):
            item.indent = first.x0 + digit * (len(item.code) + 1)
