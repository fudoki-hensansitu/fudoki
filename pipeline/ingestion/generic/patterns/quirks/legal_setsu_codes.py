"""Axis quirk: OCR reads the last digit of the 財源内訳 column left of the 節 column into the 節's number (`5728旅` for
財源 572 and `8 旅費`, 132021 R6 当初予算). The 節 are the legal ones, so a number of two digits or more that is not
the legal number of the name, and ends in the digits of that number, holds the legal number; the digits before it
are the 財源's. The legal 節 are the shared master (`dbt/seeds/fiscal/setsu_master.csv`, those in force now)."""
import csv
import re
from functools import cache
from pathlib import Path

SCOPE = 'axis'
OPTIONS = {'const': True}

FINGERPRINT_RESOURCES = ['dbt/seeds/fiscal/setsu_master.csv']
MASTER = Path(__file__).resolve().parents[4] / FINGERPRINT_RESOURCES[0]


@cache
def _legal() -> dict[str, int]:
    with MASTER.open(encoding='utf-8') as f:
        return {row['label']: int(row['code']) for row in csv.DictReader(f) if not row['valid_to_fiscal_year']}


def number(code: str, name: str) -> str:
    """The legal number the read number holds for this name, or the number as read."""
    stripped = re.sub(r'[^一-龥ぁ-んァ-ヶ]', '', name)
    legal = {n for label, n in _legal().items() if stripped and (label.startswith(stripped) or stripped.startswith(label))}
    if len(code) < 2 or len(legal) != 1 or int(code) in legal:
        return code
    wanted = legal.pop()
    return next((code[cut:] for cut in range(1, len(code)) if int(code[cut:]) == wanted), code)
