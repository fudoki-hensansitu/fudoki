"""北区の予算（案）の主な事業（分野ごとの頁。大きな字の取組の見出しの下に「事業名 予算額」の表を置く）を読む。

表の左の欄に「(1) 地域共生社会の実現に向けた啓発イベントの開催【新】」のように番号付きで事業名を並べ（長いと折り返す）、右の欄に「（1） 3,600 千円」と番号付きで額を置く。
番号の無い額が1つだけのとき（「（1）」「（2）」の事業の間に「11,769千円」だけを置く）は、表の事業を合わせた額なので、取組の見出しを名前にした1件にまとめる。
表の頭に番号の無い事業名を置き、その下に番号付きの事業を並べることもある。
複数の事業を合わせた額は「（1）～（3）合計」「(1)(2)合計」「(4)(5)」と添えて置き（額は同じ行か次の行）、その事業をまとめた1件にする（表の事業を全部まとめたときは、頭の事業名を名前にする）。
表は「ここがポイント！」の行の前で終わる。【新】は新規事業の印。
"""
from __future__ import annotations

import re

from ingestion.project.layouts.press import BboxPdf, PressItem, amount_text, lines, merge_close, norm, text, words

NUMBER = re.compile(r'^[(（](\d+)[)）]')
KEYS = re.compile(r'[(（](\d+)[)）]')
AMOUNT_WORD = re.compile(r'((\(\d+\))+(~(\(\d+\)))?(合計|の合計)?)?[\d,]*(千円)?')


def _blocks(items):
    headers = [w for w in items if norm(w['text']) == '予算額']
    ends = sorted(w['top'] for w in items if norm(w['text']).startswith('ここがポイント'))
    for header in sorted(headers, key=lambda w: w['top']):
        label = [w for w in items if norm(w['text']) == '事業名' and abs(w['top'] - header['top']) <= 3]
        if not label:
            continue
        end = next((top for top in ends if top > header['top']), None)
        if end is None:
            continue
        title_words = [w for w in items if w['size'] >= 18 and header['top'] - 60 < w['top'] < header['top']]
        yield header, end, text(sorted(title_words, key=lambda w: w['x0']))


def read_page(page, number: int) -> list[PressItem]:
    items = merge_close(words(page))
    out: list[PressItem] = []
    for header, end, title in _blocks(items):
        inside = [w for w in items if header['top'] + 3 < w['top'] < end - 2]
        right = [w for w in inside if w['x0'] >= header['x0'] - 100 and AMOUNT_WORD.fullmatch(norm(w['text']))]
        left = [w for w in inside if w not in right]
        names: list[tuple[str | None, str]] = []
        for row in lines(left, tolerance=3):
            joined = text(row)
            match = NUMBER.match(joined)
            if match or not names:
                names.append((match.group(1) if match else None, NUMBER.sub('', joined)))
            else:
                key, name = names[-1]
                names[-1] = (key, name + joined)
        groups: list[tuple[list[str], int | None]] = []
        pending: list[str] | None = None
        for row in lines(right, tolerance=3):
            joined = text(row)
            keys = KEYS.findall(joined)
            if '~' in joined:
                first, last = (int(k) for k in KEYS.findall(joined)[:2])
                keys = [str(k) for k in range(first, last + 1)]
            amount = amount_text(joined)
            if keys and amount is None:
                pending = keys
                continue
            groups.append((keys or pending or [], amount))
            pending = None
        if not names:
            continue
        parent = None
        if len(names) > 1 and names[0][0] is None and all(k is not None for k, _ in names[1:]):
            parent = names.pop(0)[1].replace('【新】', '').strip()
        keyed = {key: (group, amount) for group, amount in groups for key in group}
        if len(groups) == 1 and not groups[0][0] and len(names) > 1:
            clean = [n.replace('【新】', '').strip() for _, n in names]
            out.append(PressItem(number, title or '、'.join(clean), clean, all('【新】' in n for _, n in names), groups[0][1], [], len(out) + 1))
            continue
        done: set[str] = set()
        for key, name in names:
            if key in done:
                continue
            group, budget = keyed.get(key, ([key], groups[0][1] if len(names) == 1 and groups else None))
            members = [(k, n) for k, n in names if k in group] if len(group) > 1 else [(key, name)]
            done.update(k for k, _ in members if k is not None)
            clean = [n.replace('【新】', '').strip() for _, n in members]
            whole = parent if parent and len(members) == len(names) else None
            out.append(PressItem(number, whole or '、'.join(clean), clean, all('【新】' in n for _, n in members), budget, [], len(out) + 1))
    return out


def read(path) -> list[PressItem]:
    items: list[PressItem] = []
    with BboxPdf(path) as pdf:
        for number, page in enumerate(pdf.pages, start=1):
            items.extend(read_page(page, number))
            page.flush_cache()
    return items
