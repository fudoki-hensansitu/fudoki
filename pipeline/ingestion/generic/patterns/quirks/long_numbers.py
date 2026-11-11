"""Axis quirk: the axis's long codes (東村山市の予算書の7桁の事業コード `1801109`) are no item numbers, also where the
name after one begins with full-width digits (`1801109 １１時間開所保育対策加算補助金`, `1401102 ２号井戸流水計更新工事`).
An item number has at most four digits (`tree.CODE`); without the quirk, half-width digits followed by full-width ones
are read as the number and the start of the name (`11３歳児健康診査事業`) however many they are, and the 事業 becomes a
numbered item at the level of the 節 above it."""
SCOPE = 'axis'
OPTIONS = {'const': True}


def too_long(digits: str) -> bool:
    return len(digits) > 4
