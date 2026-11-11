"""港区の予算案の資料（主な事業を1件ずつ、事業名・予算額・款・所管課・説明・財源内訳で並べた資料）を読む。

各事業の右に財源内訳（一般財源・国・都・その他を「一 〇千円」「国 〇千円」…と小さく印字）が付く。この「一 千円」の行を
事業の目印にし、その上の 12pt の行を事業名と予算額（「介護職魅力発信事業 4,675 千円」）にする。
予算額が事業名の行に無い（行の少し上に印字した）ときは同じ高さの近くの数を、それも無ければ財源内訳の合計を使う。
札（新規・継続・臨時・レベルアップ）は事業名の左に小さく印字する。

R6（2024）は表の形（区分・事業名［所管課］（款）・予算額・財源内訳・事業内容の列）。事業名の列の行を「（款）」の行までで
1件にし、予算額の列の最初の数を予算額にする。区分の列は札を1字ずつ縦に印字する（新／規）。
"""
from __future__ import annotations

import re

from ingestion.project.layouts.press import DIGITS, PressItem, lines, norm, text, words

NAME_SIZE = (11.5, 12.6)
FUNDS = ('一', '国', '都', '他')


def _funds(items: list[dict]) -> list[dict]:
    """財源内訳の見出しの語（一・国・都・他）。直後に「千円」が続く。"""
    out = []
    for w in items:
        label = norm(w['text'])
        if label in FUNDS and w['size'] < 8:
            if any(norm(u['text']) == '千円' and abs(u['top'] - w['top']) < 2 and 0 < u['x0'] - w['x1'] < 80 for u in items):
                out.append(w)
    return out


def _read_table(items: list[dict], number: int) -> list[PressItem]:
    header = {norm(w['text']): w for w in items if norm(w['text']) in ('予算額', '財源内訳', '[所管課]')}
    budget_x0, funds_x0 = header['予算額']['x0'] - 25, header['財源内訳']['x0']
    name_x0 = header['[所管課]']['x0'] - 20
    top = header['予算額']['top'] + 20
    body = [w for w in items if w['top'] > top]
    out: list[PressItem] = []
    block: list[dict] = []
    for row in lines(body, tolerance=2):
        block.extend(row)
        names = [w for w in row if name_x0 <= w['x0'] < budget_x0]
        if not any(re.fullmatch(r'（.+費）|\(.+費\)', norm(w['text'])) or re.fullmatch(r'（.+費）', w['text']) for w in names):
            continue
        name = ''.join(norm(w['text']) for w in block if name_x0 <= w['x0'] < budget_x0
                       and not norm(w['text']).startswith(('[', '(')))
        amounts = [w for w in block if budget_x0 <= w['x0'] < funds_x0 and DIGITS.match(norm(w['text']))]
        tag = ''.join(norm(w['text']) for w in block if w['x0'] < name_x0)
        if name and amounts:
            amount = min(amounts, key=lambda w: w['top'])
            out.append(PressItem(number, name, [name], '新規' in tag, int(norm(amount['text']).replace(',', '')), [],
                                 len(out) + 1))
        block = []
    return out


def read_page(page, number: int) -> list[PressItem]:
    items = words(page)
    if {'予算額', '財源内訳', '[所管課]'} <= {norm(w['text']) for w in items}:
        return _read_table(items, number)
    funds = _funds(items)
    anchors = sorted((w for w in funds if norm(w['text']) == '一'), key=lambda w: w['top'])
    out: list[PressItem] = []
    previous = 0.0
    for anchor in anchors:
        region = [w for w in items if previous < w['top'] < anchor['top'] - 3]
        named = [w for w in region if NAME_SIZE[0] <= w['size'] <= NAME_SIZE[1] and w['x0'] < anchor['x0'] - 5]
        rows = lines(named)
        if not rows:
            raise ValueError(f'p{number}: 財源内訳の上に事業名が無い')
        last = rows[-1][0]['top']
        rows = [r for r in rows if last - r[0]['top'] < 30]  # 事業名の折り返しまで。前の事業の説明は含めない
        tokens = [w for row in rows for w in row]
        numbers = [w for w in tokens if DIGITS.match(norm(w['text']))]
        name = ''.join(norm(w['text']) for w in tokens if w not in numbers and norm(w['text']) != '千円')
        if numbers:
            amount = int(norm(numbers[-1]['text']).replace(',', ''))
        else:
            near = [w for w in region if NAME_SIZE[0] <= w['size'] <= NAME_SIZE[1] and DIGITS.match(norm(w['text']))
                    and abs(w['top'] - last) < 12]
            if near:
                amount = int(norm(near[-1]['text']).replace(',', ''))
            else:
                parts = [w for w in items if w['size'] < 7 and DIGITS.match(norm(w['text']))
                         and anchor['top'] - 3 < w['top'] < anchor['top'] + 30 and w['x0'] > anchor['x0']]
                amount = sum(int(norm(w['text']).replace(',', '')) for w in parts) if parts else None
        tags = {norm(w['text']) for w in region if w['size'] < 8 and w['x1'] < 55 and w['top'] > rows[0][0]['top'] - 12}
        out.append(PressItem(number, name, [name], '新規' in tags, amount, [], len(out) + 1))
        previous = anchor['top'] + 30
    return out


def read(path) -> list[PressItem]:
    import pdfplumber
    items: list[PressItem] = []
    with pdfplumber.open(path) as pdf:
        for number, page in enumerate(pdf.pages, start=1):
            items.extend(read_page(page, number))
            page.flush_cache()
    return items
