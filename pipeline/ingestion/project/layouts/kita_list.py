"""北区の予算の概要の「主要事業」の章（会計・款・項ごとの事業の一覧）を読む。

bbox（`page_words`）の語を座標で拾う。章の見出し（全角の番号と題）で「主要事業」の章だけを読み、
会計の見出し・款の見出し・項の見出し（「項 合 計」）の下に、番号・印（新・補・レ）・事業名・本年度予算額（千円）の行が並ぶ。
「再掲」の節（職員給与費など）は他の行の写しなので読まない。

検査: 項（特別会計は会計）ごとに印字された「掲載事業小計」と、読んだ事業の和が合うこと。
番号の無い行（特別会計の予備費）は、資料によって小計に入ったり入らなかったりするので、入れても入れなくても合えばよい。
小計の無い項（公債費）は、和が項の合計を超えないこと。合わなければ止める。
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

from ingestion.generic import page_words

NUMBER = re.compile(r'^[\d,]+$')
CHAPTER = re.compile(r'^[０-９]+$')
MARKS = ('新', '補', 'レ')
# 頁の左右の帯（つめ見出し）を除く x の範囲
BODY = (30, 560)
# 本年度予算額の欄の左端
AMOUNT_X = 400


@dataclass
class Line:
    page: int
    position: int  # 頁の中の上からの順
    account: str
    kan: str | None
    kou: str | None
    moku: str | None
    name: str
    department: str | None
    amount_thousand: int
    is_new: bool  # 「新」の印（新規事業）


def _int(text: str) -> int:
    return int(text.replace(',', ''))


def read(path: Path) -> list[Line]:
    out: list[Line] = []
    groups: list[dict] = []
    active = False
    account = kan = None
    group: dict | None = None
    pending: tuple[str, int] | None = None

    def open_group(kou: str | None, total: int | None, page: int) -> dict:
        g = {'account': account, 'kan': kan, 'kou': kou, 'printed': None, 'total': total, 'sum': 0, 'extra': 0, 'page': page}
        groups.append(g)
        return g

    for page in page_words.pages(path):
        _, rows = page_words.rows(page.words)
        position = 0
        for row in rows:
            w = [x for x in row if BODY[0] <= x.x0 <= BODY[1]]
            if not w:
                continue
            t = [x.text for x in w]
            if len(w) >= 2 and CHAPTER.match(t[0]) and w[0].x0 < 55 and 60 < w[1].x0 < 85 and t[1] not in MARKS:
                active = t[1] == '主要事業'
                continue
            if not active:
                continue
            # 番号の無い行は、次が「掲載事業小計」なら項の見出し（項 合 計の印字の無い項）、そうでなければ小計の外かもしれない行
            if pending:
                if t[0] == '掲載事業小計':
                    group = open_group(pending[0], pending[1], page.number)
                elif group is not None:
                    group['extra'] += pending[1]
                pending = None
            if len(w) == 1 and w[0].x0 < 39 and (t[0].endswith('会計') or '再掲' in t[0]):
                account = None if '再掲' in t[0] else t[0]
                kan = None
                group = open_group(None, None, page.number) if account else None
                continue
            if account is None:
                continue
            if w[0].x0 < 39 and len(w) >= 2 and NUMBER.match(t[1]):
                pending = (t[0], _int(t[1]))
                continue
            if 39 <= w[0].x0 <= 45 and (len(w) == 1 or (len(w) == 2 and re.fullmatch(r'\d+事業', t[1]))):
                kan = t[0]
                continue
            if '項' in t and '合' in t and '計' in t:
                total = [x for x in w if NUMBER.match(x.text) and x.x0 > 420]
                group = open_group(t[0] if t[0] != '項' else None, _int(total[0].text) if total else None, page.number)
                continue
            if t[0] == '掲載事業小計':
                group['printed'] = _int(next(x for x in t[1:] if NUMBER.match(x)))
                continue
            if re.fullmatch(r'\d+', t[0]) and 40 <= w[0].x0 <= 72 and len(w) >= 2 and w[1].x0 >= 65:
                amounts = [x for x in w if NUMBER.match(x.text) and x.x0 > AMOUNT_X]
                if not amounts:
                    # 章の後ろの表（区民1人当たり予算額など）に入った
                    active = False
                    continue
                start = 2 if t[1] in MARKS else 1
                name = ''.join(x.text for x in w[start:] if x.x1 < amounts[0].x0)
                position += 1
                out.append(Line(page.number, position, account, kan, group['kou'] if group else None, None, name, None,
                                _int(amounts[0].text), t[1] == '新'))
                group['sum'] += _int(amounts[0].text)
    if not out:
        raise ValueError(f'{path.name}: 主要事業の章が見つからない')
    for g in groups:
        # 小計が印字された項は、事業を1行も読めなくても確かめる（読み落としを通さない）
        if not g['sum'] and g['printed'] is None:
            continue
        if g['printed'] is not None:
            ok = g['printed'] in (g['sum'], g['sum'] + g['extra'])
        else:
            ok = g['total'] is not None and g['sum'] <= g['total']
        if not ok:
            raise ValueError(f'{path.name} p{g["page"]} {g["account"]} {g["kan"]} {g["kou"]}: '
                             f'事業の和 {g["sum"]} が掲載事業小計 {g["printed"]}（項の合計 {g["total"]}）と合わない')
    return out
