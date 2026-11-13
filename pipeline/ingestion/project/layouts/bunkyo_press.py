"""文京区の当初予算案の概要（予算案の主な事業）を読む。年度ごとに様式が違う。

- R6（2024）: 「● 事業名 … 〇 百万円（〇 百万円）」の行が1件。予算額は百万円（括弧内は前年度との差）。
  札（新＝新規、レ＝レベルアップ、継＝継続）は事業名の右上に小さく印字する。
- R7（2025）: 1件1頁で、頁の上に「【番号】 事業名」、右に「予算額 〇千円」。番号の無い頁は、「（１）施設名 （２）施設名」の行と
  「予算額 〇千円 予算額 〇千円」の行を左から組にする（開設施設の頁）。施設整備の冊（資料第２号）は事業の一覧ではないので読まない。
- R8（2026）: 1件1頁で、「予算額」の札の下に「〇千円」、左に大きな字の事業名。
新規の印は R6 の「新」だけ。R7・R8 は事業ごとに印を付けない。
"""
from __future__ import annotations

import re

from ingestion.project.layouts.press import BboxPdf, PressItem, lines, norm, text, words

MILLION = re.compile(r'([\d,]+)百万円')
BUDGET = re.compile(r'予算額([\d,]+)千円')
NUMBERED = re.compile(r'^【\d+】')
FACILITY = re.compile(r'\(\d+\)')


def _r6(items: list[dict], rows: list[list[dict]], number: int) -> list[PressItem]:
    out = []
    for row in rows:
        if not text(row).startswith('●') or not MILLION.search(text(row)):
            continue
        size = row[0]['size']
        main = [w for w in row if abs(w['size'] - size) < 0.5]  # 札（新・重〇・○）は小さい字か大きい丸
        joined = text(main)
        before = joined.split('百万円')[0]
        amount = re.search(r'([\d,]+)$', before)
        name = before[:amount.start()].removeprefix('●').strip()
        tags = {norm(w['text']) for w in items if abs(w['top'] - row[0]['top']) < 4 and w['size'] < size - 0.5}
        mark = re.search(r'(レ|継|新)$', name)  # 札が事業名と同じ大きさの字のこともある
        if mark:
            tags.add(mark.group(1))
            name = name[:mark.start()]
        out.append(PressItem(number, name, [name], any('新' in t for t in tags),
                             int(amount.group(1).replace(',', '')) * 1000, [], len(out) + 1))
    return out


def _r7(items: list[dict], rows: list[list[dict]], number: int) -> list[PressItem]:
    heading = next((r for r in rows if NUMBERED.match(text(r))), None)
    budgets = [r for r in rows if BUDGET.search(text(r))]
    if heading is not None and budgets:
        title_words = [w for w in heading if w['size'] >= heading[0]['size'] - 0.5]
        name = NUMBERED.sub('', text(title_words)).strip()
        return [PressItem(number, name, [name], False, int(BUDGET.search(text(budgets[0])).group(1).replace(',', '')), [], 1)]
    out = []
    for budget in budgets:
        amounts = [int(a.replace(',', '')) for a in BUDGET.findall(text(budget))]
        above = [r for r in rows if r[0]['top'] < budget[0]['top'] and FACILITY.search(text(r))]
        if not above:
            continue
        names = [n.strip() for n in FACILITY.split(text(above[-1], ' ')) if n.strip()]
        if len(names) != len(amounts):
            raise ValueError(f'p{number}: 施設名と予算額の数が合わない')
        for name, amount in zip(names, amounts):
            name = name.replace(' ', '')
            out.append(PressItem(number, name, [name], False, amount, [], len(out) + 1))
    return out


def _r8(items: list[dict], rows: list[list[dict]], number: int) -> list[PressItem]:
    label = next((w for w in items if norm(w['text']) == '予算額'), None)
    if label is None:
        return []
    amount = next((w for w in items if re.fullmatch(r'[\d,]+千円', norm(w['text'])) and w['top'] > label['top']
                   and abs(w['x0'] - label['x0']) < 60), None)
    if amount is None:
        return []
    big = [w for w in items if w['size'] >= 30 and w['x1'] < label['x0'] - 20 and w['top'] < amount['top'] + 30]
    rows = [r for r in lines(big, tolerance=8) if not text(r).startswith('~')]  # 副題「～図書館のICT化推進～」は除く
    size = rows[0][0]['size'] if rows else 0
    name = ''.join(text(r) for r in rows if r[0]['size'] >= size - 1)
    if not name:
        raise ValueError(f'p{number}: 事業名が読めない')
    return [PressItem(number, name, [name], False, int(norm(amount['text']).removesuffix('千円').replace(',', '')), [], 1)]


def read(path) -> list[PressItem]:
    items: list[PressItem] = []
    with BboxPdf(path) as pdf:
        first = pdf.pages[0].extract_text() or ''
        if '施設整備' in first:  # 資料第２号（施設整備、組織・定数編）
            return []
        for number, page in enumerate(pdf.pages, start=1):
            found = words(page)
            rows = lines(found)
            joined = ''.join(text(r) for r in rows)
            if '百万円' in joined and '●' in joined:
                items.extend(_r6(found, rows, number))
            elif any(NUMBERED.match(text(r)) for r in rows) or (BUDGET.search(joined) and page.width < 1000):
                items.extend(_r7(found, rows, number))
            else:
                items.extend(_r8(found, rows, number))
            page.flush_cache()
    return items
