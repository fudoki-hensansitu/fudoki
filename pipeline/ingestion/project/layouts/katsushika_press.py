"""葛飾区の予算（案）の概要（横長のスライドで1頁1事業）を読む。

頁の上に大きな字の事業の見出し（「地震時の電気火災被害防止事業を実施します」）を置き、右上に「予算額 294百万円」と額を百万円単位で書く（「２１億６８百万円」のように億を添えることもある）。
R8 は見出しの行の末尾に「263百万円」と額を置く頁もある。見出しは2行に分けることがあり、一番大きな字の行をつなげる。見出しの上の小さめの惹句（「23区で葛飾区だけ！」）と、額の左端より右の担当課は読まない。
「事業名」の欄を持つ頁はその欄を名前にする（欄が「・」で始まる内訳の箇条書きのときは見出しを名前にする）。
額の無い頁（目次・総括・図だけの頁）は読まない。新規の印は無い。
"""
from __future__ import annotations

import re

from ingestion.project.layouts.press import PressItem, lines, text, words

# 見出しが絵の中にあり、規則で事業名が決まらない頁（PDF の sha256 の先頭8桁, 頁）→ 資料の表記の事業名
TITLES = {
    ('874454fd', 17): '業務効率化・生産性向上支援',
}
MILLION = re.compile(r'(?:([\d,]+)億)?([\d,]+)百万円')


def read_page(page, number: int, digest: str = '') -> PressItem | None:
    items = [w for w in words(page) if w['top'] < 130]
    rows = lines(items, tolerance=4)
    amounts = [r for r in rows if MILLION.search(text(r)) and max(w['size'] for w in r) >= 13]
    if not amounts:
        return None
    amount_row = amounts[0]
    found = MILLION.search(text(amount_row))
    budget = int((found.group(1) or '0').replace(',', '')) * 100_000 + int(found.group(2).replace(',', '')) * 1000
    left_edge = min(w['x0'] for w in amount_row if MILLION.search(w['text']) or w['text'] in ('予算額', '百万円') or re.fullmatch(r'[\d,.億]+', w['text']))
    same_row = MILLION.sub('', text(amount_row)).replace('予算額', '').replace('約', '').strip()
    labelled = [w for w in items if w['text'].startswith('事業名')]
    label_text = ''
    if labelled:
        label = labelled[0]
        label_text = text([w for w in items if abs(w['top'] - label['top']) <= 4 and w['x0'] >= label['x0']]).removeprefix('事業名').strip(':： ')
    if label_text and not label_text.startswith('・'):
        name = label_text
    elif same_row and max(w['size'] for w in amount_row) >= 15.5:
        name = same_row
    else:
        body = [w for w in items if w['x1'] < left_edge - 5 and w not in amount_row]
        if not body:
            return None
        biggest = max(w['size'] for w in body)
        name = ''.join(text(r) for r in lines([w for w in body if w['size'] >= biggest - 1], tolerance=4))
    name = TITLES.get((digest, number), name)
    if not name:
        return None
    return PressItem(number, name, [name], False, budget, [], 1)


def read(path) -> list[PressItem]:
    from pathlib import Path

    import pdfplumber

    from ingestion.fiscal.manifest import sha_file
    digest = sha_file(Path(path))[:8]
    items: list[PressItem] = []
    with pdfplumber.open(path) as pdf:
        for number, page in enumerate(pdf.pages, start=1):
            item = read_page(page, number, digest)
            page.flush_cache()
            if item is not None:
                items.append(item)
    return items
