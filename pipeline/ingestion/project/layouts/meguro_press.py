"""目黒区の当初予算案プレス発表資料（資料編）の重点化対象事業・物価高騰対策・その他主な事業の表を読む。

プレス発表資料は本編（施策を図で紹介する冊）と資料編の2冊。資料編の表が本編の施策を含めて事業を網羅するので、資料編だけを読む。
表の列は「整理番号・新規・担当課・事業名・事業内容・予算額・うち一般財源」（単位千円）。予算額の行を1件の目印にし、
前後の事業との中間までを1件の範囲にして、事業名の列の語をつなぐ。新規の列に「○」（または縦書きの「新規」）があれば新規。
見出しの列の位置は頁の見出し（「担当課」「事業名」「事業内容」「予算額」「新」）から取る。重要課題ごとの合計の行は読まない。
"""
from __future__ import annotations

from ingestion.project.layouts.press import DIGITS, PressItem, lines, norm, text, words

HEADERS = ('担当課', '事業名', '事業内容', '予算額', '新')


def read_page(page, number: int) -> list[PressItem]:
    items = words(page)
    header = {}
    for w in items:
        label = norm(w['text'])
        if label in HEADERS and label not in header:
            header[label] = w
    if set(HEADERS) - set(header) or '見直し額' in {norm(w['text']) for w in items}:
        return []
    top = header['予算額']['top'] + 8
    name_from = header['担当課']['x1'] + 8
    name_to = header['事業名']['x1'] + 55  # 事業内容の列は事業名の見出しの右から始まる
    new_from, new_to = header['新']['x0'] - 4, header['新']['x1'] + 4
    numbers = [w for w in items if w['top'] > top and w['x0'] >= header['予算額']['x0'] - 50
               and w['x1'] <= header['予算額']['x1'] + 30 and DIGITS.match(norm(w['text']))]
    anchors = sorted((r[0] for r in lines(numbers)), key=lambda w: w['top'])
    out: list[PressItem] = []
    for index, anchor in enumerate(anchors):
        upper = (anchors[index - 1]['top'] + anchor['top']) / 2 if index else top
        lower = (anchor['top'] + anchors[index + 1]['top']) / 2 if index + 1 < len(anchors) else page.height
        block = [w for w in items if upper < w['top'] <= lower]
        if any(norm(w['text']).endswith('合計') for w in items if abs(w['top'] - anchor['top']) < 6):
            continue  # 重要課題ごとの合計の行
        name = ''.join(text(r) for r in lines([w for w in block if name_from <= w['x0'] < name_to]))
        name = name.removeprefix('事業名').removeprefix('★')  # ★はピックアップ事業（本編に載せた事業）の印
        if not name:
            raise ValueError(f'p{number}: 事業名が読めない（予算額 {anchor["text"]}）')
        marks = {norm(w['text']) for w in block if new_from <= w['x0'] and w['x1'] <= new_to}
        out.append(PressItem(number, name, [name], bool(marks & {'○', '〇', '新', '規', '新規'}),
                             int(norm(anchor['text']).replace(',', '')), [], len(out) + 1))
    return out


def read(path) -> list[PressItem]:
    import pdfplumber
    items: list[PressItem] = []
    with pdfplumber.open(path) as pdf:
        if '資料編' not in (pdf.pages[0].extract_text() or '') + (pdf.pages[1].extract_text() or ''):
            return []
        for number, page in enumerate(pdf.pages, start=1):
            items.extend(read_page(page, number))
            page.flush_cache()
    return items
