"""武蔵野市の当初予算案の概要を読む。1頁に1〜3件。

各件は「予算額 5125 万円」（億と万の数を別に印字することもある）と、その上の「新規」「レベルアップ」「継続」の札を持つ。
1頁に複数の件があるときは、件ごとに「①吉祥寺パークエリアまちの将来像の立案」のような丸数字の見出しを付け、
件が横に並ぶ頁は件ごとに段を分ける。丸数字の見出しが無いときは頁の見出し（いちばん大きい字）を名前にする。
"""
from __future__ import annotations

import re

from ingestion.project.layouts.press import PressItem, amount_text, lines, norm, text

CIRCLED = re.compile(r'^[①-⑳]')
AMOUNT_WORD = re.compile(r'^[\d,億万円]+$')
UNITS = ('億', '万円', '億万円', '円', '万')


def _amount(words: list[dict], label: dict, right: float) -> int | None:
    near = [w for w in words if label['x1'] - 2 <= w['x0'] < right and label['top'] - 12 <= w['top'] <= label['top'] + 24
            and AMOUNT_WORD.match(norm(w['text']))]
    near.sort(key=lambda w: (not norm(w['text']).replace(',', '').isdigit(), w['x0']))
    return amount_text(' '.join(norm(w['text']) for w in near))


def read_page(page, number: int) -> list[PressItem]:
    words = page.extract_words(extra_attrs=['size', 'fontname'])
    labels = sorted((w for w in words if norm(w['text']) == '予算額'), key=lambda w: (round(w['top']), w['x0']))
    if not labels:
        return []
    big = [w for w in words if w['size'] >= 18 and 'Semibold' in w['fontname']
           and not AMOUNT_WORD.match(norm(w['text'])) and norm(w['text']) not in ('予算額', '予')]
    biggest = max((w['size'] for w in big), default=0)
    title = ''.join(text(r) for r in lines([w for w in big if w['size'] > biggest - 0.5]))
    title = re.sub(r'\(\d+\)$', '', title)
    heads = [w for w in words if CIRCLED.match(w['text']) and w['size'] >= 15]
    items: list[PressItem] = []
    for label in labels:
        same_row = sorted(l['x0'] for l in labels if abs(l['top'] - label['top']) < 6)
        right = next((x - 20 for x in same_row if x > label['x0']), page.width)
        above = [h for h in heads if label['top'] - 150 < h['top'] < label['top'] and h['x0'] <= label['x0'] + 10]
        name, top = title, label['top']
        if above:
            head = max(above, key=lambda h: (h['x0'], h['top']))
            stop = min((h['x0'] - 5 for h in heads if abs(h['top'] - head['top']) < 10 and h['x0'] > head['x0']),
                       default=page.width)
            part = [w for w in words if abs(w['size'] - head['size']) < 0.5 and 'Semibold' in w['fontname']
                    and head['top'] - 2 <= w['top'] < label['top'] - 2 and head['x0'] - 25 <= w['x0'] < stop]
            name = re.sub(r'^\d+', '', ''.join(text(r) for r in lines(part)), count=1) if not norm(head['text'])[1:2].isdigit() \
                else ''.join(text(r) for r in lines(part))[1:]
            top = head['top']
            left = head['x0'] - 25
        else:
            left = max((x for x in same_row if x < label['x0']), default=-20) + 20 if len(same_row) > 1 else 0
        tags = [w for w in words if 13.5 <= w['size'] <= 14.5 and top - 60 <= w['top'] <= top + 2 and left <= w['x0'] < right]
        tag = ''.join(norm(w['text']) for w in tags)
        items.append(PressItem(number, name, [name], '新規' in tag, _amount(words, label, right), [], len(items) + 1))
    return items


def read(path) -> list[PressItem]:
    import pdfplumber
    out: list[PressItem] = []
    with pdfplumber.open(path) as pdf:
        for number, page in enumerate(pdf.pages, start=1):
            out.extend(read_page(page, number))
            page.flush_cache()
    return out
