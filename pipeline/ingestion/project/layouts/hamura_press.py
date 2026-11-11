"""羽村市の予算の資料を読む。年度で様式が違う。

R6 は「実施計画・予算(概要説明)」の実施計画事業。「No.2 物忘れセルフチェック・認知症検診の実施」の見出し、説明の文、
新規なら「〔新規事業〕」、「認知症検診事業に要する経費」の後の「歳」に続く数行に「678 千円」（歳出の事業費）を印字する。

R7・R8 は「予算の概要」の主要事業の頁。太字の大きな見出しと「事業費 13,425千円」「事業費 1億7,943万円」を印字し、
1頁に2件を左右に並べることもある（左右に分けて組にする）。物価高騰対策の頁は他の頁と同じ事業を再び載せるので、
同じ名前は最初の1件だけにする。
"""
from __future__ import annotations

import re

from ingestion.project.layouts.press import PressItem, amount_text, norm

ENTRY = re.compile(r'^No\.(\d+) (.+)$')
EXPENSE = re.compile(r'^(.+?)に要する経費$')
COST = re.compile(r'^(―|[\d,]+ 千円)')
COST_LABEL = re.compile(r'^事業費')


def _plan(pdf) -> list[PressItem]:
    items: list[PressItem] = []
    for number, page in enumerate(pdf.pages, start=1):
        rows = [norm(r) for r in (page.extract_text() or '').split('\n')]
        page.flush_cache()
        position = 0
        current: PressItem | None = None
        state = None
        for index, row in enumerate(rows):
            entry = ENTRY.match(row)
            if entry:
                position += 1
                current = PressItem(number, entry.group(2), [entry.group(2)], False, None, [], position)
                items.append(current)
                state = 'summary'
                continue
            if current is None:
                continue
            if row.startswith('〔新規事業〕'):
                current.is_new = True
            if state == 'summary':
                if row.startswith(('〔', '○', '令和')):
                    state = None
                else:
                    current.points = [(current.points[0] if current.points else '') + row]
                    continue
            expense = EXPENSE.match(row)
            if expense and expense.group(1) not in current.names:
                current.names.append(expense.group(1))
            if (row == '歳' or row.startswith('歳 ')) and current.budget_thousand is None:
                for following in rows[index + 1:index + 4]:  # 「歳」の後の数行に事業費（間に積算の行が入ることがある）
                    cost = COST.match(following)
                    if cost:
                        if cost.group(1) != '―':
                            current.budget_thousand = int(cost.group(1).split()[0].replace(',', ''))
                        break
    return items


def _posters(pdf) -> list[PressItem]:
    items: list[PressItem] = []
    seen: set[str] = set()
    for number, page in enumerate(pdf.pages, start=1):
        words = page.extract_words(extra_attrs=['fontname', 'size'])
        page.flush_cache()
        if not words or not norm(min(words, key=lambda w: (round(w['top']), w['x0']))['text']).startswith('【'):
            continue
        heads = [w for w in words if w['size'] >= 24 and '-B' in w['fontname']]
        labels = sorted((w for w in words if COST_LABEL.match(norm(w['text']))), key=lambda w: w['x0'])
        if not heads:
            continue
        middle = page.width / 2
        split = len(labels) == 2 or (heads and min(w['x0'] for w in heads) < middle - 100
                                    and any(w['x0'] > middle - 20 for w in heads)
                                    and not any(w['x0'] < middle - 20 < w['x1'] - 40 for w in heads))
        columns = [(0, middle), (middle, page.width)] if split else [(0, page.width)]
        position = 0
        for left, right in columns:
            title = ''.join(norm(w['text']) for w in sorted(
                (w for w in heads if left <= (w['x0'] + w['x1']) / 2 < right), key=lambda w: (round(w['top']), w['x0'])))
            if not title:
                continue
            amount = None
            for label in labels:
                if left <= label['x0'] < right:
                    row = sorted((w for w in words if abs(w['top'] - label['top']) < 4 and label['x0'] <= w['x0'] < right),
                                 key=lambda w: w['x0'])
                    amount = amount_text(' '.join(norm(w['text']) for w in row))
                    break
            if title in seen:
                continue
            seen.add(title)
            position += 1
            items.append(PressItem(number, title, [title], False, amount, [], position))
    return items


def read(path) -> list[PressItem]:
    import pdfplumber
    with pdfplumber.open(path) as pdf:
        first = norm(pdf.pages[0].extract_text() or '')
        return _plan(pdf) if '実施計画・予算' in first else _posters(pdf)
