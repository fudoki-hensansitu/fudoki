"""Axis quirk: an item number set in full-width digits with a full-width stop (`９．納付案内センター事業経費`, 131164)
is a number wherever its line starts (the explanation of a 目 printed above the items starts where they do and
outvotes them)."""
import re

SCOPE = 'axis'
OPTIONS = {'const': True}
FULL_WIDTH_NUMBERED = re.compile(r'[０-９]{1,2}．(?![0-9０-９])')


def numbered(raw_text: str) -> bool:
    return FULL_WIDTH_NUMBERED.match(raw_text) is not None
