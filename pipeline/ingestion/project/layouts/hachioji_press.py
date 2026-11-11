"""八王子市の予算の資料を読む。年度で様式が違う。

- R6: 予算説明書の「重点」の頁（1事業1〜2頁、分野ごとの分冊）。「事 務 事 業 名 健診・検診の推進 健康医療部成人健診課」の行の事業名と、
  「令和6年度」の次の行の事業費（千円、行の最初の数）を読む。事業名の前の（新）（充）は新規・拡充の印。
- R7・R8: 市長記者会見の報道発表資料。資料ごとに取組を「1 【新規】崖・擁壁実態調査の実施・マップの作成」と番号付きで並べ、
  取組の説明の後に「新年度予算額 28,921千円」と書く。予算額の行ごとに1件にし、名前はその前の【新規】などの印の付いた取組（無ければ資料の題）にする。
  予算額の無い資料（議案・職員体制・条例・補正予算など）は読まない。R7 の「予算のポイント」の頁は資料の額の再掲なので読まない。
"""
from __future__ import annotations

import re

from ingestion.project.layouts.press import PressItem, lines, norm, text

SHEET_NAME = re.compile(r'^事 ?務 ?事 ?業 ?名 (.+)$')
BUDGET = re.compile(r'新年度予算額 ?([\d,]+)千円')
HEADING = re.compile(r'^\d+ ?(?:【(新規|充実|拡充)】)? ?(.+)$')
RELEASE = re.compile(r'報道発表資?料')


def _sheet(rows: list[str], number: int) -> PressItem | None:
    for index, row in enumerate(rows):
        match = SHEET_NAME.match(row)
        if not match:
            continue
        parts = match.group(1).split(' ')
        if len(parts) > 1 and re.search(r'(課|部|室|所)$', parts[-1]):
            parts = parts[:-1]
        name = ' '.join(parts)
        if name.startswith('令和'):  # 扶助事業一覧表の欄の見出し（一覧表は読まない）
            return None
        is_new = name.startswith('(新)')
        name = re.sub(r'^\((新|充)\)', '', name).strip()
        amount = None
        for at, following in enumerate(rows[index:index + 8]):
            if following.startswith('令和6年度') and index + at + 1 < len(rows):
                first = re.match(r'^([\d,]+)', rows[index + at + 1])
                amount = int(first.group(1).replace(',', '')) if first else None
                break
        return PressItem(number, name, [name], is_new, amount, [], 1)
    return None


def _release(page, number: int, state: dict) -> list[PressItem]:
    """報道発表資料の頁。題は 18pt の太字（「~…~」の副題は除く）、取組は太字の「1 【新規】…」の行。"""
    items: list[PressItem] = []
    for row in lines(page.extract_words(extra_attrs=['size', 'fontname'])):
        first, value = row[0], text(row, ' ')
        if RELEASE.search(value):
            state.update(title=None, heading=None, is_new=False, title_open=True)
            continue
        bold = 'Bold' in first['fontname']
        if bold and first['size'] >= 16:
            if not value.startswith('~') and state['title_open']:
                state['title'] = (state['title'] or '') + value.replace(' ', '')
            else:
                state['title_open'] = False
            continue
        if state['title']:
            state['title_open'] = False
        match = HEADING.match(value)
        if bold and match:
            # 新規・充実・拡充の印の無い番号付きの見出しは説明の小見出し（「設置工事のスケジュール」など）が多いので名前にしない
            state['heading'] = match.group(2).replace(' ', '').rstrip('※') if match.group(1) else None
            state['is_new'] = match.group(1) == '新規'
            continue
        found = BUDGET.search(value.replace(' ', ''))
        if found and state['title']:
            name = state['heading'] or state['title']
            items.append(PressItem(number, name, [name], state['is_new'] and bool(state['heading']),
                                   int(found.group(1).replace(',', '')), [], len(items) + 1))
            state['heading'] = None
    return items


def read(path) -> list[PressItem]:
    import pdfplumber
    items: list[PressItem] = []
    state = {'title': None, 'heading': None, 'is_new': False, 'title_open': False}
    with pdfplumber.open(path) as pdf:
        for number, page in enumerate(pdf.pages, start=1):
            rows = [norm(line) for line in (page.extract_text() or '').split('\n')]
            if any(SHEET_NAME.match(r) for r in rows):
                item = _sheet(rows, number)
                if item:
                    items.append(item)
            else:
                items.extend(_release(page, number, state))
            page.flush_cache()
    return items
