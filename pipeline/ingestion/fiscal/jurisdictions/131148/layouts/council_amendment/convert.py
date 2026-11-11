"""Nakano's council amendment of the initial budget (修正案): the amended 事務事業 lines, as printed.

The amendment prints two tables. Page 1 is the 款・項 of 第1表 with the amended amount (修正金額) and the
proposed one (原案金額). Page 2 lists only the amended lines: 款・項・目 on one row, the 事務事業 above it
(`1 …`) and its child below (`(1) …`), with 修正金額・原案金額・差 on the row. The amounts belong to the
child (the deepest 事務事業), which the budget book prints with the proposed amount.

The table is page 2's lines: 款・項・目 and the 事務事業 without amounts, the deepest 事務事業 with its three
amounts. Page 1 is read only to check that, for each 款 and 項, its difference is the sum of its lines'
differences; a page 1 total that page 2 does not explain stops the conversion. The headings are renamed by
`options.headings` (修正金額 is the approved amount, 原案金額 the proposed one); nothing else is changed but
the parentheses of the child's number, which the budget book prints without them.

dbt applies the lines to the initial budget (seeds/fiscal/fiscal_budget_amendment.csv).
"""
from __future__ import annotations

from pathlib import Path
import re

from ingestion.generic.observe import Word, words
from ingestion.lib.node_tables import NodeTables
from shared.amount import number

AMOUNT = re.compile(r'^[▲△]?[0-9]{1,3}(?:,[0-9]{3})*$')
CODE = re.compile(r'^\(?([0-9]+)\)?$')
LINE = 3.0   # points: words of one printed line share a top within this


def rows(items: list[Word]) -> list[list[Word]]:
    lines: list[list[Word]] = []
    for word in sorted(items, key=lambda w: (w.y0, w.x0)):
        if lines and abs(lines[-1][0].y0 - word.y0) <= LINE:
            lines[-1].append(word)
        else:
            lines.append([word])
    return [sorted(line, key=lambda w: w.x0) for line in lines]


def joined(line: list[Word]) -> list[Word]:
    """A sign printed apart from its number (`▲ 850`) joins it."""
    out: list[Word] = []
    for word in line:
        if out and out[-1].text in ('▲', '△') and AMOUNT.match(word.text):
            sign = out.pop()
            word = Word(sign.text + word.text, sign.x0, min(sign.y0, word.y0), word.x1, max(sign.y1, word.y1))
        out.append(word)
    return out


def heading(line: list[Word], labels: tuple[str, ...]) -> dict[str, tuple[float, float]] | None:
    """Spans of the headings of one header line; a heading may be printed one character per word."""
    text = ''.join(w.text for w in line)
    if not all(label in text for label in labels):
        return None
    spans, rest = {}, list(line)
    for label in labels:
        built, start = '', None
        for index, word in enumerate(rest):
            if start is None and not label.startswith(word.text):
                continue
            start = index if start is None else start
            built += word.text
            if built == label:
                spans[label] = (rest[start].x0, word.x1)
                rest = rest[index + 1:]
                break
            if not label.startswith(built):
                built, start = '', None
        if label not in spans:
            return None
    return spans


def column(word: Word, spans: dict[str, tuple[float, float]]) -> str:
    return min(spans, key=lambda label: abs(spans[label][1] - word.x1))


def unit(items: list[Word]) -> str:
    found = {m[1] for w in items if (m := re.search(r'単位[:：](千円|円)', w.text))}
    if len(found) != 1:
        raise ValueError(f'Amendment page needs one printed unit: {sorted(found)}')
    return found.pop()


def box(items: list[Word]) -> dict:
    return {'x0': min(w.x0 for w in items), 'y0': min(w.y0 for w in items),
            'x1': max(w.x1 for w in items), 'y1': max(w.y1 for w in items)}


def subjects(line: list[Word], spans: dict[str, tuple[float, float]], levels: tuple[str, ...]) -> list[tuple[str, str, str, list[Word]]]:
    """(level, code, name, words) of the subject cells of a row: a code word then its name, under a level heading."""
    cells, current = [], None
    starts = sorted((spans[level][0], level) for level in levels)
    for word in line:
        if AMOUNT.match(word.text) and ',' in word.text or word.x0 >= max(spans[l][1] for l in levels) + 40:
            break
        code = CODE.match(word.text)
        if code and not word.text.startswith('('):
            # A code is printed left of its heading: it belongs to the first heading starting right of it.
            level = next((level for x, level in starts if x > word.x0), None)
            if level is None:
                break
            current = [level, code[1], '', [word]]
            cells.append(current)
        elif current is not None:
            current[2] += word.text
            current[3].append(word)
    return [tuple(cell) for cell in cells]


def totals(page: list[Word]) -> dict[tuple[str, ...], tuple[int, int]]:
    """Page 1: the 款・項 rows of 第1表 and their (修正金額, 原案金額)."""
    lines = [joined(line) for line in rows(page)]
    index, spans = next((i, s) for i, line in enumerate(lines) if (s := heading(line, ('款', '項', '修正金額', '原案金額'))))
    result, kan = {}, None
    for line in lines[index + 1:]:
        amounts = {column(w, spans): number(w.text) for w in line if AMOUNT.match(w.text) and ',' in w.text}
        cells = subjects(line, spans, ('款', '項'))
        if not cells or set(amounts) != {'修正金額', '原案金額'}:
            continue
        level, code = cells[0][0], cells[0][1]
        kan = code if level == '款' else kan
        key = (code,) if level == '款' else (kan, code)
        result[key] = (amounts['修正金額'], amounts['原案金額'])
    return result


def convert(inputs, destination, options):
    item = inputs[0]
    pdf = Path(item['path'])
    pages = words(pdf, 1, 2)
    first, second = pages[1][2], pages[2][2]
    printed_unit = unit(second)
    lines = [joined(line) for line in rows(second)]
    index, spans = next((i, s) for i, line in enumerate(lines)
                        if (s := heading(line, ('款', '項', '目', '事務事業', '修正金額', '原案金額', '差'))))
    business = spans['事務事業'][0] - 60
    body = lines[index + 1:]
    subject_rows = [line for line in body if subjects(line, spans, ('款', '項', '目'))
                    and subjects(line, spans, ('款', '項', '目'))[0][0] == '款']
    if not subject_rows:
        raise ValueError('Amendment page 2 prints no 款・項・目 row')
    nodes, amounts, made = [], [], {}
    headings = options['headings']

    def node(key, parent, axis, depth, level, code, name, cell):
        if key in made:
            if (made[key]['code_text'], made[key]['name_text']) != (code, name):
                raise ValueError(f'Amendment prints {key} with two names')
            return
        made[key] = {'node_key': key, 'parent_node_key': parent, 'axis_header': axis, 'depth': depth,
                     'level_header': level, 'code_text': code, 'name_text': name, 'physical_page': 2, **box(cell)}
        nodes.append(made[key])

    tops = [line[0].y0 for line in subject_rows]
    lines_of = {i: [] for i in range(len(subject_rows))}
    for line in body:
        if line in subject_rows:
            continue
        cell = [w for w in line if w.x0 >= business and not (AMOUNT.match(w.text) and ',' in w.text)]
        if not cell or not CODE.match(cell[0].text):
            raise ValueError(f'Unread line on amendment page 2: {"".join(w.text for w in line)}')
        nearest = min(range(len(tops)), key=lambda i: abs(tops[i] - line[0].y0))
        lines_of[nearest].append(cell)
    deltas: dict[tuple[str, ...], int] = {}
    for i, row in enumerate(subject_rows):
        cells = subjects(row, spans, ('款', '項', '目'))
        if [c[0] for c in cells] != ['款', '項', '目']:
            raise ValueError(f'Amendment row needs 款・項・目: {"".join(w.text for w in row)}')
        (_, kan, kan_name, kan_words), (_, kou, kou_name, kou_words), (_, moku, moku_name, moku_words) = cells
        node(f'k{kan}', None, '科目', 1, '款', kan, kan_name, kan_words)
        node(f'k{kan}-{kou}', f'k{kan}', '科目', 2, '項', kou, kou_name, kou_words)
        node(f'k{kan}-{kou}-{moku}', f'k{kan}-{kou}', '科目', 3, '目', moku, moku_name, moku_words)
        parent, depth = f'k{kan}-{kou}-{moku}', 0
        business_lines = sorted(lines_of[i], key=lambda cell: cell[0].y0)
        if not business_lines:
            raise ValueError(f'Amendment row prints no 事務事業: {kan}-{kou}-{moku}')
        for cell in business_lines:
            depth += 1
            nested = cell[0].text.startswith('(')
            if nested != (depth > 1):
                raise ValueError(f'事務事業 numbering out of order under {kan}-{kou}-{moku}')
            code = CODE.match(cell[0].text)[1]
            key = f'{parent}-{code}'
            node(key, parent, options['business_axis'], depth, None, code, ''.join(w.text for w in cell[1:]), cell)
            parent = key
        printed = {column(w, spans): w for w in row if AMOUNT.match(w.text) and w.x0 >= spans['修正金額'][0] - 40}
        if set(printed) != {'修正金額', '原案金額', '差'}:
            raise ValueError(f'Amendment row needs 修正金額・原案金額・差: {kan}-{kou}-{moku}')
        values = {label: number(word.text) for label, word in printed.items()}
        if values['修正金額'] - values['原案金額'] != values['差']:
            raise ValueError(f'Amendment row does not close: {kan}-{kou}-{moku} {values}')
        for label, word in printed.items():
            amounts.append({'node_key': parent, 'header_path': headings.get(label, label), 'amount_text': word.text,
                            'unit_text': printed_unit, 'physical_page': 2,
                            'x0': word.x0, 'y0': word.y0, 'x1': word.x1, 'y1': word.y1})
        for key in ((kan,), (kan, kou)):
            deltas[key] = deltas.get(key, 0) + values['差']
    if unit(first) != printed_unit:
        raise ValueError('Amendment pages print different units')
    printed_totals = totals(first)
    explained = {key: amended - proposed for key, (amended, proposed) in printed_totals.items()}
    if explained != deltas:
        raise ValueError(f'Page 1 differences are not the sum of page 2 lines: {explained} != {deltas}')
    notes = [f'議会の修正案（{options["bill"]}）の歳出増減分の説明。修正した事務事業だけを載せる。'
             f'修正金額を「{headings["修正金額"]}」、原案金額を「{headings["原案金額"]}」として読む。',
             '第1表の款・項の修正額と原案額の差は、事務事業の差の和と一致することを確かめた。',
             '事務事業の子の番号の括弧（(1)）は、予算説明書の印字に合わせて外した。']
    return {options['table_id']: {'node_tables': NodeTables(nodes, amounts), 'notes': notes}}
