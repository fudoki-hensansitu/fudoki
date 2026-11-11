"""小平市の予算（案）の概要を読む。

「令和N年度主要事業の概要」の表に「26 新規 がん患者アピアランスケア費用の助成 800 400 400」と、
整理番号・区分（新規・継続・拡充）・事業名・事業費（千円）・特定財源・一般財源を1行に並べる。
事業名が長いと番号の行の上下に続きを組む（番号の行は名前の中ほど）ので、番号の無い名前だけの行を前後の件に足す（前の件の名前の括弧が閉じていなければ前の件、そうでなければ次の件）。
"""
from __future__ import annotations

import re

from ingestion.project.layouts.press import PressItem, norm

ENTRY = re.compile(r'^(\d+) (新規|継続|拡充) ?(.*?) ?([\d,]+)(?: [\d,]+)*$')
HEADER = re.compile(r'^(整理|区分|番号|○基本目標|小平市第|\(|合計|[\d,]+( [\d,]+)*$)')


def _open(name: str) -> bool:
    return any(name.count(a) > name.count(b) for a, b in ('()', '<>', '「」', '【】'))


def read(path) -> list[PressItem]:
    import pdfplumber
    items: list[PressItem] = []
    with pdfplumber.open(path) as pdf:
        for number, page in enumerate(pdf.pages, start=1):
            rows = [norm(r) for r in (page.extract_text() or '').split('\n')]
            page.flush_cache()
            if not any(r.startswith('区分 事業名 事業費') for r in rows):
                continue
            pending: list[str] = []
            position = 0
            last: PressItem | None = None
            for row in rows:
                entry = ENTRY.match(row)
                if entry:
                    position += 1
                    name = ''.join(pending) + entry.group(3)
                    pending = []
                    last = PressItem(number, name, [name], entry.group(2) == '新規',
                                     int(entry.group(4).replace(',', '')), [], position)
                    items.append(last)
                elif row and not HEADER.match(row):
                    if last is not None and not pending and _open(last.title):  # 番号の行の下に続く名前
                        last.title += row
                        last.names = [last.title]
                    else:
                        pending.append(row)
            if pending and last is not None:
                last.title += ''.join(pending)
                last.names = [last.title]
    return items
