"""件の見つけ方: 1頁に1件を「事業名」「予算額」の札と並べたカードの頁を1件にする。札の右に印字した字を事業名・予算額にする。

- `name`（必須）: 事業名の札の語。札の右の、札と同じ高さ（上下 `name_height`、既定 14pt）の語を事業名にする。
  札の語が「事業名：〇〇」のように名前を続けて持つときは札を除いた残りも名前にする
- `amount`（必須）: 予算額の札の語。事業名の札に一番近い札を使い、その右の、同じ高さ（上下 `amount_height`、既定 14pt）の語を予算額にする
- `pair_height`: 予算額の札と事業名の札の上下がこの pt を超えて離れていれば、その頁は読まない
- `new`: 頁の語に当たれば新規にする
"""
from __future__ import annotations

import re

from ingestion.project.layouts.press import lines, norm, text, words
from ingestion.project.press import Candidate, Page


def find(page: Page, options: dict, state=None) -> list[Candidate]:
    items = words(page.page)
    name_label, amount_label = re.compile(options['name']), re.compile(options['amount'])
    label = next((w for w in items if name_label.match(norm(w['text']))), None)
    budgets = [w for w in items if amount_label.match(norm(w['text']))]
    if label is None or not budgets:
        return []
    budget = min(budgets, key=lambda w: abs(w['top'] - label['top']))
    if 'pair_height' in options and abs(budget['top'] - label['top']) > options['pair_height']:
        return []
    reach = options.get('name_height', 14)
    limit = budget['x0'] - 5 if abs(budget['top'] - label['top']) < reach and budget['x0'] > label['x1'] else page.page.width
    head = name_label.sub('', norm(label['text']))
    region = [w for w in items if w is not label and label['x1'] <= w['x0'] and w['x1'] <= limit
              and abs(w['top'] - label['top']) < reach]
    name = head + ''.join(text(r) for r in lines(region))
    if not name:
        raise ValueError(f'p{page.number}: 事業名が読めない')
    reach = options.get('amount_height', 14)
    printed = re.sub(r'\s', '', text([w for row in lines([w for w in items if w is not budget and w['x0'] >= budget['x1'] - 2
                                                          and abs(w['top'] - budget['top']) < reach]) for w in row]))
    found = re.search(r'[\d,]+(?:億[\d,]*)?(?:万[\d,]*)?(?:千)?円?', printed)
    is_new = 'new' in options and any(re.fullmatch(options['new'], norm(w['text'])) for w in items)
    return [Candidate(page.number, name, found.group(0) if found else None, is_new=is_new)]
