"""Axis quirk: the 説明 prints a 事業 with a seven-digit code (`1000100 議会運営経費`) and the items under it with an
eight-digit code (`01100110 議員報酬`), each set apart from its name (日の出町の予算書). An item number has at most four
digits (`tree.CODE`); with the quirk the seven and eight digits are numbers, and a number of more than four digits is a
numbering shape of its own length (`tree.shape_of`), so the 事業 and its items take two levels. The name may begin with
a digit (`10101002 3R推進ダンボールコンポスト購入費`): the code is the digits before the space."""
import re

from ingestion.generic.layout import text

SCOPE = 'axis'
OPTIONS = {'const': True}
CODE = re.compile(r'[0-9]{7,8}')


def split_words(label) -> tuple[str, str] | None:
    """(code, name) of a line whose first word is seven or eight digits and has a name after it; None otherwise."""
    if len(label) < 2 or not CODE.fullmatch(label[0].text.strip()):
        return None
    return label[0].text.strip(), text(label[1:]).strip()
