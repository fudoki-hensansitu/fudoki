"""Document quirk: a count in brackets under a name without an amount ends that name (`…任用職員報酬(` / `1人) 1,301`,
`…任用職員報酬` / `(1人) 764`, 132101): no item `1`."""
import re

from ingestion.generic.layout import normalize, text

SCOPE = 'document'
OPTIONS = {'const': True}


def ends_name(line_text: str, before: list) -> bool:
    if not re.fullmatch(r'([(（]?)[0-9]+[^0-9(（)）]{1,3}[)）]', line_text):
        return False
    shown = normalize(text(before))
    return line_text[0] in '(（' or shown.count('(') > shown.count(')')
