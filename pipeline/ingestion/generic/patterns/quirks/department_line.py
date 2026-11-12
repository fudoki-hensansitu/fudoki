"""Axis quirk: a 事業 name that does not fit on its line goes on the next one with its department, its number and its
amount (`1. 旧国立駅舎管理運営事業費` / `【まちの振興課】 <0140570> 37,554`, 国立市の予算説明書). The line in brackets is
the end of the numbered name above, which prints no amount, not an item of its own.

The 説明 prints every amount in one right-aligned column, so the amount's column does not tell the 事業 from its parts
(`join_last_lines`), and the parts (`( 7.報償費) (372)`) start left of the 事業's number, so they do not add up to the
line's amount at their own margin (`closes_parts`)."""
import re

from ingestion.generic.layout import normalize, text

SCOPE = 'axis'
OPTIONS = {'const': True}

DEPARTMENT = re.compile(r'^【[^【】]+】(?:<[0-9]+>)?$')


def continues(previous, label, money, code, left_slack: float) -> bool:
    """The codeless line `【課】 <番号> 金額` ends the numbered name above, which has no amount yet."""
    return (previous is not None and code is None and bool(label) and bool(money)
            and previous.code is not None and not previous.amounts and bool(previous.lines)
            and label[0].x0 >= previous.lines[0][0].x0 - left_slack
            and DEPARTMENT.match(normalize(text(label))) is not None)
