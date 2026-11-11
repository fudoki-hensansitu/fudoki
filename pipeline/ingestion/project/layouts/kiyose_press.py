"""清瀬市の一般会計予算説明資料の「予算のポイント・施策展開」を読む。

施策ごとに「新 ○子ども計画策定 12,500千円」（札は 新・レ、無いこともある。金額が無いこともある）を1行に印字し、
名前の続きを次の字下げした行に、説明を次の「( )」の行に印字する。「予算のポイント」の見出しから「財政指標」の見出しの前までを読む。
「(再掲)」は他の施策の再掲、「歳入」を含む施策は歳入なので読まない。
"""
from __future__ import annotations

import re

from ingestion.project.layouts.press import PressItem, norm

START = re.compile(r'^\d+ 予算のポイント')
END = re.compile(r'^\d+ 財 ?政 ?指 ?標')
ENTRY = re.compile(r'^(?:(新|レ) ?)?[○〇] ?(.+?)(?: ([\d,]+) ?千円)?$')
ACCOUNT = re.compile(r'^\(.+会計\)$')
OTHER = re.compile(r'^(?:[■●(]|新 |レ )')


def _open(text: str) -> bool:
    return text.count('(') > text.count(')')


def read(path) -> list[PressItem]:
    import pdfplumber
    items: list[PressItem] = []
    inside = False
    with pdfplumber.open(path) as pdf:
        for number, page in enumerate(pdf.pages, start=1):
            rows = [(norm(line['text']), line['x0']) for line in page.extract_text_lines()]
            page.flush_cache()
            position = 0
            current: PressItem | None = None
            state = None  # name → points
            for row, x0 in rows:
                if START.match(row):
                    inside = True
                    continue
                if END.match(row):
                    inside = False
                    break
                if not inside:
                    continue
                entry = ENTRY.match(row)
                if entry:
                    position += 1
                    amount = entry.group(3)
                    current = PressItem(number, entry.group(2), [], entry.group(1) == '新',
                                        int(amount.replace(',', '')) if amount else None, [], position)
                    items.append(current)
                    current_x0 = x0
                    state = 'name'
                    continue
                if current is None:
                    continue
                if state == 'name' and not OTHER.match(row) and x0 >= current_x0 + 6:
                    amount = re.search(r' ([\d,]+) ?千円$', row)
                    if amount and current.budget_thousand is None:
                        current.budget_thousand = int(amount.group(1).replace(',', ''))
                        row = row[:amount.start()]
                    current.title += row
                    continue
                if row.startswith('(') and not ACCOUNT.match(row) and state in ('name', 'points') and \
                        (state == 'name' or not current.points or not _open(''.join(current.points))):
                    current.points.append(row)
                    state = 'points'
                    continue
                if state == 'points' and current.points and _open(''.join(current.points)):
                    current.points.append(row)
                    continue
                state = None
    out = []
    for item in items:
        if '再掲' in item.title or '歳入' in item.title:
            continue
        item.title = item.title.strip()
        item.names = [item.title]
        item.points = [p.strip('()') for p in ''.join(item.points).replace(')(', ')\n(').split('\n')] if item.points else []
        out.append(item)
    for index, item in enumerate(out):  # 再掲を除いた後の頁の中の順
        item.position = sum(1 for other in out[:index + 1] if other.page == item.page)
    return out
