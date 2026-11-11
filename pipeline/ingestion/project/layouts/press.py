"""予算案のプレス発表の様式が共通に使う道具（語を行にまとめる、金額を千円で読む）。

書式の型ごとの共通の読み方は `press_lines.py`（一覧）・`press_table.py`（表）・`press_card.py`（カード）で、自治体ごとの宣言（origins.json の `rules`）で読む。
型に収まらない自治体だけ `<自治体>_press.py` に置く。ここには様式に依らない処理だけを置く。
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field

NUMBERED = re.compile(r'^[①-⑳]')
DIGITS = re.compile(r'^[\d,]+$')


@dataclass
class PressItem:
    """施策1件。page は PDF の頁（1始まり）、position は同じ頁の中の順（1始まり）。"""
    page: int
    title: str
    names: list[str]
    is_new: bool
    budget_thousand: int | None
    points: list[str] = field(default_factory=list)
    position: int = 1


def norm(text: str) -> str:
    return unicodedata.normalize('NFKC', text).strip()


def words(page) -> list[dict]:
    return page.extract_words(keep_blank_chars=False, use_text_flow=False, extra_attrs=['size'])


def lines(items: list[dict], tolerance: float = 3) -> list[list[dict]]:
    """上端が tolerance 以内の語を1行にまとめ、行の中は左から並べる。"""
    rows: list[list[dict]] = []
    for word in sorted(items, key=lambda w: (w['top'], w['x0'])):
        if rows and abs(rows[-1][0]['top'] - word['top']) <= tolerance:
            rows[-1].append(word)
        else:
            rows.append([word])
    return [sorted(row, key=lambda w: w['x0']) for row in rows]


def text(row: list[dict], sep: str = '') -> str:
    return sep.join(norm(w['text']) for w in row)


def thousand(number: str, unit: str) -> int:
    """印字の数と単位を千円にする。単位は 千円・万円・億円・億万円（「8 2,279 億 万円」のように億と万を別に印字した形）。"""
    unit = norm(unit).replace(' ', '')
    parts = [int(p.replace(',', '')) for p in norm(number).split()]
    if unit == '千円' and len(parts) == 1:
        return parts[0]
    if unit == '万円' and len(parts) == 1:
        return parts[0] * 10
    if unit == '億円' and len(parts) == 1:
        return parts[0] * 100_000
    if unit == '億万円' and len(parts) == 2:
        return parts[0] * 100_000 + parts[1] * 10
    raise ValueError(f'金額の単位が読めない: {number!r} {unit!r}')


@dataclass
class Amount:
    top: float
    x0: float
    thousand: int


def big_amounts(items: list[dict], min_size: float, units: tuple[str, ...] = ('万円', '億万円', '千円', '億円')) -> list[Amount]:
    """大きな字の数（min_size 以上）と、その右か下に小さく印字した単位を組にした金額。

    「8 2,279」と「億 万円」のように億と万の数を別の語で印字した形も1つの金額にする。
    """
    numbers = [w for w in items if w['size'] >= min_size and DIGITS.match(norm(w['text']))]
    unit_words = [w for w in items if w['size'] < min_size and norm(w['text']).replace(' ', '') in ('万円', '億', '千円', '億円')]
    out: list[Amount] = []
    for row in lines(numbers, tolerance=4):
        groups: list[list[dict]] = []
        for word in row:  # 間が字の大きさの3倍を超えたら別の金額
            if groups and word['x0'] - groups[-1][-1]['x1'] <= word['size'] * 3:
                groups[-1].append(word)
            else:
                groups.append([word])
        for group in groups:
            top, x0, x1 = group[0]['top'], group[0]['x0'], group[-1]['x1']
            near = [u for u in unit_words if top - 4 <= u['top'] <= top + group[0]['size'] + 4 and x0 - 4 <= u['x0'] <= x1 + 40]
            unit = ''.join(norm(u['text']).replace(' ', '') for u in sorted(near, key=lambda u: u['x0']))
            if unit not in units:
                continue
            out.append(Amount(top, x0, thousand(' '.join(norm(w['text']) for w in group), unit)))
    return out


_SPLIT_OKU_MAN = re.compile(r'([\d,]+)\s+([\d,]+)\s*億\s*万円')  # 「16 3,694 億 万円」（億と万の数を別に印字）
_YEN = re.compile(r'(?:([\d,]+)\s*億\s*)?(?:([\d,]+)\s*万\s*)?(?:([\d,]+)\s*千\s*)?円')


def amount_text(value: str) -> int | None:
    """「1億4,270万円」「95万9千円」「16 3,694 億 万円」「1,846万円」「23,108千円」のような印字を千円にする。

    最初に当たった金額を読む。千円未満の端数は持たない（「〇円」だけの印字は読まない）。
    """
    value = norm(value)
    found = []
    split = _SPLIT_OKU_MAN.search(value)
    if split:
        found.append((split.start(), int(split[1].replace(',', '')) * 100_000 + int(split[2].replace(',', '')) * 10))
    for match in _YEN.finditer(value):
        oku, man, sen = (int(g.replace(',', '')) if g else 0 for g in match.groups())
        if match.group(1) or match.group(2) or match.group(3):
            found.append((match.start(), oku * 100_000 + man * 10 + sen))
            break
    return min(found)[1] if found else None


UNITS = {'千円': 1, '百万円': 1000}


def amount(value: str | None, unit: str = '千円') -> int | None:
    """宣言で読む金額。億・万・千・円を含む印字は amount_text で、数だけの印字は unit（千円・百万円）で千円にする。"""
    if not value:
        return None
    if re.search(r'[億万千円]', value):
        return amount_text(value if '円' in value else value + '円')
    return int(re.sub(r'[,\s]', '', value)) * UNITS[unit]
