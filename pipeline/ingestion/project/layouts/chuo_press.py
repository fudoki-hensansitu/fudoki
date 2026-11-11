"""中央区の「予算(案)の概要」（主要事業を「新規」「充実」の札・事業名・予算額（千円）・説明で並べた資料）を読む。

事業名の行は本文より1pt大きい字（R6・R7 は 11pt、R8 は 10pt）で、行末に「〇〇千円」を印字する。事業名が長いと次の行に折り返し、
予算額は折り返した行の末尾に付く。札（新規・充実）は事業名の左に小さく印字する。札の無い事業もある。

内訳の行（「1) 本庁舎 538,957千円」「ア 土地・建物貸付」）と、主要事業の件数の表は事業ではないので読まない。
「６ 健全財政維持への対応」（歳入の確保・事務事業の見直し・基金）の見出しから後は読まない。
R6 の PDF は見開きの片側を切り出した頁で、頁の外（x が負）にもう片側の語が残るので、頁の内側の語だけを読む。
"""
from __future__ import annotations

import re
from collections import Counter

from ingestion.project.layouts.press import PressItem, lines, norm, text, words

AMOUNT = re.compile(r'([\d,]+)千円$')
TAGS = ('新規', '充実')
SUBITEM = re.compile(r'^(\d+\)|[アイウエオカキクケコ](?=[\s一-龥])|[①-⑳]|△)')
SUMMARY = re.compile(r'^(新規|充実|継続|計)\d+事業$')  # 主要事業の件数の表
STOP = '健全財政維持への対応'  # ここから後は歳入の確保・事業の見直し・基金で、主要事業ではない


def read_page(page, number: int) -> tuple[list[PressItem], bool]:
    """頁の事業と、STOP の見出しに達したか。"""
    items = [w for w in words(page) if 0 <= w['x0'] and w['x1'] <= page.width]
    if not items:
        return [], False
    stop = next((w['top'] for w in items if norm(w['text']) == STOP), None)
    if stop is not None:
        items = [w for w in items if w['top'] < stop - 30]  # 見出しの番号「６」は少し上に印字する
        if not items:
            return [], True
    body = Counter(round(w['size']) for w in items).most_common(1)[0][0]
    rows = [row for row in lines(items, tolerance=2)]
    out: list[PressItem] = []
    pending: list[dict] | None = None  # 予算額の無い事業名の行（次の行に折り返す）
    for row in rows:
        named = [w for w in row if abs(w['size'] - (body + 1)) < 0.6]
        if not named:
            pending = None
            continue
        tags = [norm(w['text']) for w in row if norm(w['text']) in TAGS and w['x1'] <= named[0]['x0'] + 1]
        raw = ''.join(w['text'] for w in named)
        joined = text(named, ' ')
        if pending is not None:
            joined = pending['name'] + joined.lstrip()
            tags = tags or pending['tags']
        elif SUBITEM.match(raw) or SUBITEM.match(norm(raw)):
            continue
        match = AMOUNT.search(joined.replace(' ', ''))
        if not match:
            pending = {'name': joined, 'tags': tags} if pending is None else None
            continue
        pending = None
        name = AMOUNT.sub('', joined.replace(' ', '')).strip()
        if not name or SUMMARY.match(name):
            continue
        out.append(PressItem(number, name, [name], '新規' in tags, int(match.group(1).replace(',', '')), [], len(out) + 1))
    return out, stop is not None


def read(path) -> list[PressItem]:
    import pdfplumber
    items: list[PressItem] = []
    with pdfplumber.open(path) as pdf:
        for number, page in enumerate(pdf.pages, start=1):
            found, stopped = read_page(page, number)
            items.extend(found)
            page.flush_cache()
            if stopped and items:  # 目次にも同じ見出しがある
                break
    return items
