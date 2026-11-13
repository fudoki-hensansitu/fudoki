"""Document quirk: a reckoning may close with a deduction in yen (132128: `990,000円×12月－299,250円`). Such a
calculation is a reckoning like one without the deduction, and its digits are no amount of the table."""
import re

SCOPE = 'document'
OPTIONS = {'const': True}


def reckoning(joined: str, formula: re.Pattern, price: str) -> bool:
    """Whether the run is a reckoning followed by a deduction (`…×12月－299,250円`)."""
    match = re.fullmatch(rf'(.+?)[－-]{price}', joined)
    return match is not None and formula.fullmatch(match.group(1)) is not None
