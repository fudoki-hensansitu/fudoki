"""中野区の予算（案）の概要（「各部予算の概要・主な事業」の章。部ごとに「■主な事業 （ ）は前年度当初予算額」の下に事業を番号付きで並べる）を読む。

事業の見出しは「15 英語によるコミュニケーション能力等の向上(拡充) 1億3,149万5千円(1億1,622万4千円)」の1行で、
末尾の括弧は前年度の額。事業名が長いと額を次の行に送る。他の部の計上分を含む額には「※企画費計上分含む」と添える（事業名の後ろか、額の前）。札は新規・拡充・推進・見直し・廃止などで、札の無い事業もある。
廃止の事業は前年度の額だけを印字するので、予算額は無しにする。額の代わりに債務負担行為の限度額だけを書いた事業も予算額は無し。
"""
from __future__ import annotations

import re

from ingestion.project.layouts.press import PressItem, amount_text, norm

AMOUNT = r'(?:[\d,]+億)?(?:[\d,]+万)?(?:[\d,]+千)?円'
HEADING = re.compile(rf'^(\d{{1,2}}) (.+?)(?: ?\(([^()]*)\))? ?((?:{AMOUNT})?) ?(\({AMOUNT}\))?$')
AMOUNT_LINE = re.compile(rf'^({AMOUNT}) ?(\({AMOUNT}\))?$')
TAGS = ('新規', '拡充', '推進', '見直し', '見直し等', '廃止', '充実', '継続')


def read(path) -> list[PressItem]:
    import pdfplumber
    items: list[PressItem] = []
    with pdfplumber.open(path) as pdf:
        started = False
        for number, page in enumerate(pdf.pages, start=1):
            rows = [norm(line) for line in (page.extract_text() or '').split('\n')]
            page.flush_cache()
            position = 0
            for index, row in enumerate(rows):
                if row.startswith('■主な事業'):
                    started = True
                    continue
                if not started:
                    continue
                match = HEADING.match(row)
                if not match:
                    continue
                name, tag, amount_part, _previous = match.group(2), match.group(3), match.group(4), match.group(5)
                if tag is not None and tag not in TAGS:
                    name, tag = f'{name}({tag})', None
                if not amount_part and tag is None:
                    continue
                if not amount_part and not _previous and index + 1 < len(rows):
                    following = AMOUNT_LINE.match(re.sub(r'^※\S*含む ?', '', rows[index + 1]))
                    if following:
                        amount_part = following.group(1)
                budget = amount_text(amount_part) if amount_part and tag != '廃止' else None
                name = re.sub(r' ?※.*$', '', name)
                position += 1
                items.append(PressItem(number, name.strip(), [name.strip()], tag == '新規', budget, [], position))
    return items
