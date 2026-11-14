"""Document quirk: a name set up to its amount column runs into a short amount (`全国自治体病院経営都市議会協議会負担金18`,
`…委員報償金81`, 132055 R8 当初予算), and OCR reads the two as one line, or the two sit so close they read as one run.
A number of up to three digits is no amount on its own (`2人`, `第1`), but one that ends the line right after the
name's characters is the line's amount."""
import re

SCOPE = 'document'
OPTIONS = {'const': True}


def ends_line(before: str, number: str) -> bool:
    """Whether ``number``, the last piece of a line, is that line's amount rather than part of the name before it."""
    return re.fullmatch(r'[0-9]{1,3}', number.strip()) is not None and re.search(r'[^\W\d_]$', before.strip()) is not None
