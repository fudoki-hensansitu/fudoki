"""国立市の予算（案）記者会見資料の「政策事業一覧」を読む。

表（施策名称・事業番号・個別事業名・分類（新規・継続など）・担当部・事業概要・事業費（千円））を1行1件で読む。
R8 の PDF は数字を cid で符号化している（「(cid:17468)」が 8）ので、数字だけ戻して読む。
"""
from __future__ import annotations

import re

from ingestion.project.layouts.press import PressItem, norm

CID_DIGIT = re.compile(r'\(cid:1746(\d)\)')


def _clean(cell) -> str:
    return norm(CID_DIGIT.sub(r'\1', cell or '')).replace('\n', '')


def read(path) -> list[PressItem]:
    import pdfplumber
    items: list[PressItem] = []
    with pdfplumber.open(path) as pdf:
        for number, page in enumerate(pdf.pages, start=1):
            head = _clean(page.extract_text() or '')[:60]
            if '政策事業一覧' not in head:
                page.flush_cache()
                continue
            position = 0
            for table in page.extract_tables():
                header = None
                for row in table:
                    cells = [_clean(c) for c in row]
                    if '個別事業名' in cells:
                        header = cells
                        continue
                    if header is None:
                        continue
                    get = lambda key: next((cells[i] for i, h in enumerate(header) if h.startswith(key) and i < len(cells)), '')
                    name, kind, amount = get('個別事業名'), get('分類'), get('事業費').replace(',', '')
                    if not name or not amount.isdigit():
                        continue
                    position += 1
                    items.append(PressItem(number, name, [name], kind == '新規', int(amount), [], position))
            page.flush_cache()
    return items
