"""世田谷区の当初予算概要（新規・拡充事業説明の頁。横長で1事業1〜2頁）を読む。

頁の上の枠に「事業区分 新規・拡充」の行と「事業名 〇〇 予算額 1億9,992万円」の行を印字する。予算額の数と単位は別の語で、上下に少しずれる。
事業名は枠の中で2段に分けて印字することがある（「せたがや」と「Pay」）。1つの枠に事業を2つ並べ、上に引用符で囲んだ標語（“ずっと、世田谷。”）を置くことがあり、標語は読まず事業を名前に並べる。括弧書きの副題（「（世田谷区児童養護施設退所者等支援事業）」）は読まない。
新規・拡充事業の一覧の頁も「事業名」「予算額」の見出しを持つが、見出しの行に事業名も額も無いので読まない。前年度比と補正予算込みの額は予算額の下の行なので読まない。
枠の見出しを描き直し、古い見出し（額も違う）を下に残した頁がある。字の並びで後に描いた方だけを読む。
R6 は字を持たない画像の PDF なので何も読まない。
"""
from __future__ import annotations

import re

from ingestion.project.layouts.press import PressItem, amount_text, lines, norm, text, words


def latest(page):
    """枠の見出しを描き直した頁から、古い方（「事業区分」から次の「事業区分」の前まで）の字を除く。"""
    chars = page.chars
    stream = ''.join(c['text'] for c in chars)
    starts = [m.start() for m in re.finditer('事業区分', stream)]
    hidden = {id(chars[i]) for a, b in zip(starts, starts[1:]) for i in range(a, b)}
    if not hidden:
        return page
    return page.filter(lambda obj: id(obj) not in hidden)


def read_page(page, number: int) -> list[PressItem]:
    items = words(latest(page))
    labels = [w for w in items if norm(w['text']) == '事業名']
    budgets = [w for w in items if norm(w['text']) == '予算額' and w['size'] >= 13]
    if not labels or not budgets:
        return []
    label = labels[0]
    budget = min(budgets, key=lambda w: abs(w['top'] - label['top']))
    if abs(budget['top'] - label['top']) > 12:
        return []
    name_words = [w for w in items if w['x0'] >= label['x1'] and w['x1'] <= budget['x0'] - 10
                  and abs(w['top'] - label['top']) <= 20 and w['size'] >= 10.5
                  and not re.fullmatch(r'\(.*\)', norm(w['text']))]
    names = [text(row) for row in lines(name_words, tolerance=4)]
    if len(names) > 1:
        names = [n for n in names if not re.fullmatch(r'[“"].*[”"]', n)]
    name = '、'.join(names)
    amount_words = sorted((w for w in items if w['x0'] > budget['x1'] + 20 and budget['top'] - 10 <= w['top'] <= budget['top'] + 6
                           and re.fullmatch(r'[\d,億万千円]+', norm(w['text']))), key=lambda w: w['x0'])
    if not name and not amount_words:
        return []
    if not name:
        raise ValueError(f'p{number}: 事業名が読めない')
    amount = amount_text(' '.join(norm(w['text']) for w in amount_words))
    if amount is None:
        raise ValueError(f'p{number}: 予算額が読めない: {[w["text"] for w in amount_words]}')
    kind = [w for w in items if norm(w['text']) == '事業区分']
    row = [norm(w['text']) for w in items if kind and abs(w['top'] - kind[0]['top']) <= 3 and w['x0'] > kind[0]['x1']]
    is_new = any('新規' in t for t in row[:1])
    return [PressItem(number, name, names, is_new, amount, [], 1)]


def read(path) -> list[PressItem]:
    import pdfplumber
    items: list[PressItem] = []
    with pdfplumber.open(path) as pdf:
        for number, page in enumerate(pdf.pages, start=1):
            items.extend(read_page(page, number))
            page.flush_cache()
    return items
