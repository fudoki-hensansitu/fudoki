"""予算案のプレス発表のうち、1頁に施策1件を「事業名」「予算額」の札と並べたカードの資料を、宣言（rules）で読む。

頁の中で札の語を探し、札の右に印字した字を事業名・予算額にする。宣言のキー:

- `name`（必須）: 事業名の札の語。札の右の、札と同じ高さ（上下 `name_height`、既定 14pt）の語を事業名にする。札の語が「事業名：〇〇」のように名前を続けて持つときは札を除いた残りも名前にする
- `amount`（必須）: 予算額の札の語。札の右の、札と同じ高さ（上下 `amount_height`、既定 14pt）の語を予算額にする
- `strip`: 名前から除く部分
- `new`: 頁の語に当たれば新規にする
- `unit`: 数だけの金額の単位（`千円` 既定）
"""
from __future__ import annotations

import re

from ingestion.project.layouts.press import PressItem, amount, lines, norm, text, words


def read_page(page, number: int, rules: dict) -> PressItem | None:
    items = words(page)
    name_label = re.compile(rules['name'])
    amount_label = re.compile(rules['amount'])
    label = next((w for w in items if name_label.match(norm(w['text']))), None)
    budget = next((w for w in items if amount_label.match(norm(w['text']))), None)
    if label is None or budget is None:
        return None
    reach = rules.get('name_height', 14)
    limit = budget['x0'] - 5 if abs(budget['top'] - label['top']) < reach and budget['x0'] > label['x1'] else page.width
    head = name_label.sub('', norm(label['text']))
    region = [w for w in items if w is not label and label['x1'] <= w['x0'] and w['x1'] <= limit
              and abs(w['top'] - label['top']) < reach]
    name = head + ''.join(text(r) for r in lines(region))
    if 'strip' in rules:
        name = re.sub(rules['strip'], '', name)
    if not name:
        raise ValueError(f'p{number}: 事業名が読めない')
    reach = rules.get('amount_height', 14)
    value = text([w for row in lines([w for w in items if w is not budget and w['x0'] >= budget['x1'] - 2
                                       and abs(w['top'] - budget['top']) < reach]) for w in row])
    value = re.sub(r'\s', '', value)
    found = re.search(r'[\d,]+(?:億[\d,]*)?(?:万[\d,]*)?(?:千)?円?', value)
    new = re.compile(rules['new']) if 'new' in rules else None
    is_new = bool(new) and any(new.fullmatch(norm(w['text'])) for w in items)
    return PressItem(number, name, [name], is_new, amount(found.group(0), rules.get('unit', '千円')) if found else None, [], 1)


def read(path, rules: dict) -> list[PressItem]:
    import pdfplumber
    items: list[PressItem] = []
    with pdfplumber.open(path) as pdf:
        for number, page in enumerate(pdf.pages, start=1):
            item = read_page(page, number, rules)
            page.flush_cache()
            if item is not None:
                items.append(item)
    return items
