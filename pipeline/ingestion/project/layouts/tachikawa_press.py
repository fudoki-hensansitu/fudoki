"""立川市の予算案の資料（当初予算案の説明）を読む。R6・R7 は1頁に1事業。

頁の上に事業名（24pt）、その下に取組の見出し（30pt 以上の太字）、右上に「新規」「充実」の札、
頁の下に「所管:… 事業費:5,491千円」を印字する。見出しを施策の名前、事業名を names にする。
R8 は字が cid で符号化されていて読めないので 0 件。
"""
from __future__ import annotations

import re
from pathlib import Path

from ingestion.fiscal.manifest import sha_file
from ingestion.project.layouts.press import PressItem, lines, norm, text

BUDGET = re.compile(r'所管:.*事業費:([\d,]+)千円')
TAG = re.compile(r'^(新規|充実|新規・充実)$')
TAG_SUFFIX = re.compile(r'(新規|充実)$')  # 事業名と同じ行に組んだ札
# 見出しの字を絵のように組んで読めない頁: (PDF の sha256 の先頭8桁, 頁) → 名前
TITLES = {('c89d4edd', 24): '『若者会議』の実施'}


def _page(page, number: int, digest: str) -> PressItem | None:
    items = page.extract_words(extra_attrs=['size', 'fontname'])
    rows = lines(items)
    budget = next((BUDGET.search(text(r)) for r in rows if BUDGET.search(text(r))), None)
    if not budget:
        return None
    big = [w for w in items if w['size'] >= 30 and 'Bold' in w['fontname'] and w['x0'] < 750]
    block = lines(big, tolerance=20)
    if not block:
        return None
    kept = [block[0]]  # 見出しは続けて組んだ行だけ（離れた所の飾りの字は入れない）
    for row in block[1:]:
        if row[0]['top'] - kept[-1][0]['bottom'] > row[0]['size'] * 0.8:
            break
        kept.append(row)
    top = block[0][0]['top']
    headline = TITLES.get((digest, number)) or ''.join(text(r) for r in kept)
    names = [TAG_SUFFIX.sub('', text(r)) for r in rows if r[0]['top'] < top and 23 <= r[0]['size'] <= 25
             and 'Bold' not in r[0]['fontname'] and r[0]['x0'] < 100]
    tags = [text(r) for r in rows if r[0]['top'] < top + 40 and (TAG.match(text(r)) or TAG_SUFFIX.search(text(r)))]
    return PressItem(number, headline, names or [headline], any('新規' in t for t in tags),
                     int(budget.group(1).replace(',', '')), [], 1)


def read(path) -> list[PressItem]:
    import pdfplumber
    out: list[PressItem] = []
    digest = sha_file(Path(path))[:8]
    with pdfplumber.open(path) as pdf:
        for number, page in enumerate(pdf.pages, start=1):
            item = _page(page, number, digest)
            if item:
                out.append(item)
            page.flush_cache()
    return out
