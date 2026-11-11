"""杉並区の予算案の概要（年度で様式が違う）を読む。

- R6: 横長のスライドで1頁1事業。上に大きな字（34pt 以上）の事業名、その下に同じ大きさで予算額（「9億8,230万3千円」）。額の無い頁は読まない。
- R7: 分野ごとの頁に、14pt 以上の見出しの行「災害備蓄品の充実・防災施設整備 1 億 6,311 万 9 千円」を並べ、下に小さな字で内訳の取組を書く。見出しの行だけを読む。
  額を見出しの次の行（「～西荻窪地域～」の副題の行）の右に置くことがある。
- R8: 基本構想の分野ごとに「● 新たなモビリティサービスの推進 拡 充 35,644 千円」の行を並べる（額は次の行に送ることがある）。
  事業名が長いと2行に折り返し、額は2行目の末尾に置く。「新規」「拡充」の札は事業名の行に小さな字（8pt）で添える（すぐ下の「・」の取組の行の札は取組のもの）。「・」で始まる内訳の取組は読まない。
  額を書かず「取組内容のみ掲載」とした事業は予算額を無しにする。
- R6 の予算総額の頁（「当初予算額」）は事業でないので読まない。
"""
from __future__ import annotations

import re

from ingestion.project.layouts.press import PressItem, amount_text, lines, norm, text, words

AMOUNT = re.compile(r'(?:[\d,]+億)?(?:[\d,]+万)?(?:[\d,]+千)?円$')


def _slide(rows, number):
    titles = [r for r in rows if r[0]['size'] >= 34 and not AMOUNT.search(text(r))]
    amounts = [r for r in rows if r[0]['size'] >= 34 and AMOUNT.search(text(r))]
    if not titles or not amounts or '当初予算額' in text(titles[0]):
        return []
    name = text(titles[0])
    return [PressItem(number, name, [name], False, amount_text(text(amounts[0])), [], 1)]


def _headings(items, number):
    """R7 の見出しの行。額は見出しと同じ行か、すぐ下の行（「～〇〇～」の副題の行）の右に置く。"""
    rows = [r for r in lines([w for w in items if w['size'] >= 13.5], tolerance=3)]
    out = []
    previous = None
    for row in rows:
        joined = text(row)
        if not AMOUNT.search(joined):
            previous = row if not joined.startswith('~') else previous
            continue
        name_words = list(row)
        while name_words and re.fullmatch(r'[\d,億万千円]+', norm(name_words[-1]['text'])):
            name_words.pop()
        name = text(name_words)
        if (not name or name.startswith('~')) and previous is not None and row[0]['top'] - previous[0]['top'] <= 30:
            name = text(previous)
        if not name:
            raise ValueError(f'p{number}: 事業名が読めない')
        out.append(PressItem(number, name, [name], False, amount_text(joined), [], len(out) + 1))
        previous = None
    return out


def _bullets(items, number):
    """R8 の「●」の行。札は 8pt の小さな字で行の下に添えるので、事業名の字（12pt）と分けて読む。"""
    rows = lines([w for w in items if w['size'] >= 9], tolerance=3)
    tags = [w for w in items if w['size'] < 9]
    out = []
    for index, row in enumerate(rows):
        joined = text(row)
        if not joined.startswith('●'):
            continue
        top = row[0]['top']
        if not AMOUNT.search(joined) and index + 1 < len(rows):
            following = rows[index + 1]
            if following[0]['size'] >= 11.5 and AMOUNT.search(text(following)):
                joined += text(following)
                top = following[0]['top']
        tag = ''.join(norm(w['text']) for w in tags if row[0]['top'] - 3 <= w['top'] <= top + 6)
        compact = joined.lstrip('●')
        amount = amount_text(compact) if AMOUNT.search(compact) else None
        name = re.sub(r'[\d,]+千円$', '', compact).strip()
        out.append(PressItem(number, name, [name], '新規' in tag, amount, [], len(out) + 1))
    return out


def read_page(page, number: int) -> list[PressItem]:
    items = words(page)
    rows = lines(items, tolerance=3)
    if any(text(r).startswith('●') for r in rows):
        return _bullets(items, number)
    if page.width > page.height:
        return _slide(rows, number)
    return _headings(items, number)


def read(path) -> list[PressItem]:
    import pdfplumber
    items: list[PressItem] = []
    with pdfplumber.open(path) as pdf:
        for number, page in enumerate(pdf.pages, start=1):
            items.extend(read_page(page, number))
            page.flush_cache()
    return items
