"""瑞穂町の予算の概要の、長期総合計画のまちの姿ごとの頁を読む。

R7 は頁の見出し（「誰もが健康ですこやかに暮らせるまち(2)」「総合計画の実現に向けて」）の下に、説明の箇条（•）と
「新 第5次地域保健福祉計画策定業務委託料 493万9千円」（新規は「新」を付ける）の行を印字する。名前が長いと
金額の無い行に折り返す。R6 は文字の無い画像なので0件になる。
R8 は2段組みの頁に、記号（U+F0A7 か •）で始まる施策の説明の文だけを印字し、事業名と金額を印字しない。
文を施策の名前にし、金額は空にする。記号の右で行頭が揃う語を、その上で一番近い記号の文として読み、行の途中の語は同じ行の行頭の文に入れる。
"""
from __future__ import annotations

import re

from ingestion.project.layouts.press import PressItem, amount_text, norm

ENTRY = re.compile(r'^(?:(新) )?(.+?) ((?:[\d,]+億)?(?:[\d,]+万)?(?:[\d,]+千)?円)$')
HEADING = re.compile(r'(?:まち(?:\(\d\))?|実現に向けて)$')


BULLETS = ('\uf0a7', '•')


def _sentences(page) -> list[str]:
    """記号で始まる説明の文を、左の段・右の段の順に、上から返す。文は「。」で終わるものだけ。"""
    words = page.extract_words()
    bullets = sorted((w for w in words if w['text'] in BULLETS), key=lambda w: (w['x0'] > page.width / 2, w['top']))
    starts = []  # 記号の右の、文の行頭の位置
    for bullet in bullets:
        right = [w['x0'] for w in words if abs(w['top'] - bullet['top']) < 4 and bullet['x1'] < w['x0'] < bullet['x0'] + 30]
        starts.append(min(right) if right else None)
    owner: dict[int, int] = {}  # 語の番号 → 記号の番号
    for index, word in enumerate(words):
        if word['text'] in BULLETS:
            continue
        above = [i for i, b in enumerate(bullets)
                 if starts[i] is not None and abs(word['x0'] - starts[i]) < 4 and b['top'] - 4 <= word['top']]
        if above:
            owner[index] = max(above, key=lambda i: bullets[i]['top'])
    for index, word in enumerate(words):  # 行の途中の語は、同じ行の左の行頭の語の文に入れる
        if index in owner or word['text'] in BULLETS:
            continue
        left = [j for j in owner if abs(words[j]['top'] - word['top']) < 4 and words[j]['x0'] < word['x0']]
        if left:
            owner[index] = owner[max(left, key=lambda j: words[j]['x0'])]
    texts: dict[int, list[dict]] = {}
    for index, i in owner.items():
        texts.setdefault(i, []).append(words[index])
    sentences = [norm(''.join(w['text'] for w in sorted(texts[i], key=lambda w: (round(w['top']), w['x0']))))
                 for i in range(len(bullets)) if i in texts]
    return [s for s in sentences if s.endswith('。')]


def read(path) -> list[PressItem]:
    import pdfplumber
    items: list[PressItem] = []
    sentences: dict[int, list[str]] = {}
    with pdfplumber.open(path) as pdf:
        for number, page in enumerate(pdf.pages, start=1):
            rows = [norm(r) for r in (page.extract_text() or '').split('\n')]
            sentences[number] = _sentences(page)
            page.flush_cache()
            if not rows or not HEADING.search(rows[0]):
                continue
            position = 0
            pending = ''
            for row in rows[1:]:
                entry = ENTRY.match(row)
                if entry and amount_text(entry.group(3)) is not None:
                    new = entry.group(1) == '新' or pending.startswith('新 ')
                    if pending.startswith('新 '):  # 名前の途中で折り返した行
                        name = pending[2:] + entry.group(2)
                    elif pending:  # 名前の行と、括弧の補足と金額の行
                        name = f'{pending} {entry.group(2)}'
                    else:
                        name = entry.group(2)
                    position += 1
                    items.append(PressItem(number, name, [name], new, amount_text(entry.group(3)), [], position))
                    pending = ''
                elif row.startswith('•') or row.endswith('。') or re.fullmatch(r'\d+', row):
                    pending = ''
                else:
                    pending = row
    if not items:  # 金額の行が1つも無い資料（R8）は説明の文を読む
        items = [PressItem(number, sentence, [sentence], False, None, [], position)
                 for number, texts in sentences.items() for position, sentence in enumerate(texts, start=1)]
    return items
