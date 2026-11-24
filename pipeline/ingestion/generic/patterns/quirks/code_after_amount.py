"""Document quirk: OCR reads an amount set flush right against a column rule and the item number just past the rule
as one word (`445,6791` for the 節 amount `445,679` and the 説明's `1 職員人件費`, 132209 R8 当初予算). An even share of
the box puts the cut a digit or two early, as the gap before the number widens the box. Where one rule cuts such a word,
the amount's groups of three say where it ends; the digits after it are the number's. A two-digit amount's box runs
past the rule into the number (`15` boxed 11pt past it beside `1 市民協働事業費`): a rule within its last character's
width cuts the padding, not a digit.

The option `code_digits` gives the number's digit count where every 説明 number has the same count (132136 R5 当初予算: a
six-digit 事業 code after the 節 amount). A short amount has no groups to say where it ends (`70131317一般…` for the
amount `70` and the 事業 `131317 一般…`): the digits before the last `code_digits` of the run are the amount's.

The option `cut_after_group` cuts a grouped amount's number run (`23,` `9500900400`: the amount `23,950`, the 事業 code
`0900400`, 132276 R5 当初) after its group of three whenever a rule crosses the run. The cut by a share of the whole
line's box counts the comma as a digit and lands a digit late (`239,500`). It also counts a rule that a page of stacked
tables draws once per table as one rule, so the cut by `code_digits` applies there too. A grouped amount that reaches a rule is never trimmed by `read_twice`."""
import re

SCOPE = 'document'
OPTIONS = {'oneOf': [{'const': True}, {
    'type': 'object', 'additionalProperties': False,
    'properties': {'code_digits': {'type': 'integer', 'minimum': 1}, 'cut_after_group': {'const': True}}}]}

AMOUNT_THEN_CODE = re.compile(r'(△?[0-9]{1,3}(?:,[0-9]{3})+)([0-9]{1,3})')


def pieces(text: str, value: object = True) -> tuple[str, str] | None:
    """The amount and the number (with the text after it) of a word read across one rule, or None."""
    found = AMOUNT_THEN_CODE.fullmatch(text)
    if found:
        return found.group(1), found.group(2)
    digits = value.get('code_digits') if isinstance(value, dict) else None
    run = re.match(r'(△?)([0-9]+)', text)  # a minus sign before the digits stays the amount's (`△3151雑入`, 131199)
    if digits and run and 0 < len(run.group(2)) - digits <= 3:
        return text[:len(run.group()) - digits], text[len(run.group()) - digits:]
    return None


def overrun(text: str, sliver: float, width: float) -> bool:
    """Whether a two-digit amount cut by one rule only overruns it, so the whole reading is the amount's."""
    return re.fullmatch(r'[0-9]{2}', text) is not None and sliver < width


def read_twice(readings: list[dict], cuts: list[float], keep_grouped: bool = False) -> dict[str, tuple[str, list[float]]]:
    """Amount lines that end with the first digits of the number past the rule, which OCR also read on that number's own
    line (`11` over the rule, then `133443一般会計繰出金` from the rule: the amount `1`, 132136). The digits past the rule
    are the number's: each such line gets its text without them and a box that ends at the rule (id → text, box).
    `keep_grouped` (`cut_after_group`): an amount already grouped by threes to its end (`6,791,191` over a rule, then the
    `1介護予防…` of the next number) is whole; its last digit is its own, not a digit read twice."""
    trimmed = {}
    for o in readings:
        raw, (x0, y0, x1, y1) = o['raw_text'].strip(), o['bbox_pdf_pt']
        inside = [x for x in cuts if x0 + 1 < x < x1 - 1]
        if len(inside) != 1 or not re.fullmatch(r'△?[0-9][0-9,]*', raw):
            continue
        if keep_grouped and re.fullmatch(r'△?[0-9]{1,3}(,[0-9]{3})+', raw):
            continue
        rule, width = inside[0], (x1 - x0) / len(raw)
        past = round((x1 - rule) / width)
        if not 0 < past < len(raw):
            continue
        tail = raw[-past:]
        if any(n is not o and abs(n['bbox_pdf_pt'][0] - rule) <= 2 and n['raw_text'].strip().startswith(tail)
               and min(y1, n['bbox_pdf_pt'][3]) - max(y0, n['bbox_pdf_pt'][1]) >= .6 * (y1 - y0) for n in readings):
            trimmed[o['id']] = (raw[:-past], [x0, y0, rule, y1])
    return trimmed


def cuts_after_group(value: object) -> bool:
    """Whether the document declares `cut_after_group`: a run a rule crosses is cut after its group of three."""
    return isinstance(value, dict) and bool(value.get('cut_after_group'))
