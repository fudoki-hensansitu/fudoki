"""Document quirk: a remark's amount of up to three digits in yen printed alone on the line under its words
(`前年度繰越事業費不用額` / `400円`, 131229 R7 決算). A grouped amount (`49,600円`) is read as the remark's amount already;
an ungrouped one reads as an item numbered 400 named `円`. A line that is only such an amount is the amount of the remark."""
import re

SCOPE = 'document'
OPTIONS = {'const': True}

SHORT_YEN = re.compile(r'([△▲]?[0-9]{1,3})\s*円')


def digits(line: str) -> int | None:
    """The number of characters of the amount when ``line`` is only a short amount in yen, else None."""
    found = SHORT_YEN.fullmatch(line.strip())
    return len(found.group(1)) if found else None
