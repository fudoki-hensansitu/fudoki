"""大田区の予算（案）の事業説明資料（1件1頁で、事業名・予算額・ポイント・事業概要を並べた資料。施策の分野ごとの分冊）を読む。

「予算額 2億4,849万1千円」の行の上に大きな字（14pt 以上、2行に折り返すことがある）で事業名を印字し（「～〇〇～」の副題は除く）、新規の事業は事業名の右に「新規」の札を付ける（「拡充」の札もある）。事業名の行の中に線で囲んだ「実施計画」の札を挟むことがあり、囲みの字は読まない。
頁の下の方に小さな字で「◆〇〇 予算額 …」と内訳の事業を並べることがあるが、頁の事業の内訳なので読まない。
予算額は千円の位まで読む（「95万9千円」）。概要の冊（目次・総括）は「予算額」の行を持たないので何も読まない。
"""
from __future__ import annotations

import re

from ingestion.project.layouts.press import PressItem, amount_text, lines, norm, text, words


TAGS = ('新規', '拡充')


def boxed(page):
    """細い線で囲んだ札（「実施計画」など）の字を除いた頁を返す。札は事業名の行の中にも印字する。"""
    edges = [r for r in page.rects if r['bottom'] - r['top'] < 2 and r['x1'] - r['x0'] > 20]

    def inside(obj) -> bool:
        if obj.get('object_type') != 'char':
            return True
        middle = (obj['x0'] + obj['x1']) / 2
        cover = [r for r in edges if r['x0'] <= middle <= r['x1']]
        above = any(obj['top'] - 8 <= r['top'] <= obj['top'] for r in cover)
        below = any(obj['bottom'] <= r['top'] <= obj['bottom'] + 8 for r in cover)
        return not (above and below)
    return page.filter(inside)


def read_page(page, number: int) -> list[PressItem]:
    every = words(page)
    items = words(boxed(page))
    rows = lines(items, tolerance=3)
    out: list[PressItem] = []
    for index, row in enumerate(rows):
        joined = text(row)
        if not joined.startswith('予算額') or row[0]['size'] < 13.5:
            continue
        amount = amount_text(joined)
        if amount is None:
            raise ValueError(f'p{number}: 予算額が読めない: {joined}')
        top = row[0]['top']
        floor = max((r[0]['top'] for r in rows[:index] if text(r).startswith('予算額') and r[0]['size'] >= 13.5), default=0)
        big = [w for w in items if floor < w['top'] < top - 2 and w['size'] >= 13.5]
        tags = {norm(w['text']) for w in every if floor < w['top'] < top - 2 and w['size'] >= 13.5}
        name_rows = lines([w for w in big if norm(w['text']) not in TAGS], tolerance=4)
        name = ''.join(text(r) for r in name_rows if r[0]['top'] > top - 90 and not text(r).startswith('~'))
        name = re.sub(r'^\d+(?=\D)', '', name)
        if not name:
            raise ValueError(f'p{number}: 事業名が読めない')
        out.append(PressItem(number, name, [name], '新規' in tags, amount, [], len(out) + 1))
    return out


def read(path) -> list[PressItem]:
    import pdfplumber
    items: list[PressItem] = []
    with pdfplumber.open(path) as pdf:
        for number, page in enumerate(pdf.pages, start=1):
            items.extend(read_page(page, number))
            page.flush_cache()
    return items
