"""Read ruled enterprise statements; preserve printed strings and parent context."""
from __future__ import annotations

from dataclasses import asdict, replace
import json
from pathlib import Path
import re
import subprocess
import tempfile
import xml.etree.ElementTree as ET

from ingestion.lib.conversion import ConversionContext, write_conversion
from ingestion.lib.parquet import ParquetColumn
from ingestion.lib.pdf_table import (Box, Column, Placement, RowBand, TableLayout,
                                    assemble_table, place_tokens, tokens_from_bbox_layout)

AMOUNT = re.compile(r'[0-9][0-9,]*')
RECTANGLE = re.compile(r'M ([0-9.]+) ([0-9.]+) L ([0-9.]+) ([0-9.]+) L ([0-9.]+) ([0-9.]+) L ([0-9.]+) ([0-9.]+) Z')
POSITION_COLUMNS = ('物理頁', '印刷頁', '原典位置_上端', '原典位置_下端')


def text(tokens):
    """Restore line order within wrapped cells without inserting inferred spaces."""
    rows = []
    for token in sorted(tokens, key=lambda t: (t.bbox.top, t.bbox.left)):
        if not rows or token.bbox.top - rows[-1][0].bbox.top > 1:
            rows.append([])
        rows[-1].append(token)
    return ''.join(t.raw_text for row in rows for t in sorted(row, key=lambda t: t.bbox.left)) or None


def observe(pdf, page, origin, directory):
    xml = subprocess.check_output(['pdftotext', '-bbox-layout', '-f', str(page), '-l', str(page), str(pdf), '-'])
    (directory / f'p{page}.bbox.xml').write_bytes(xml)
    tokens = tokens_from_bbox_layout(xml, origin_id=origin, first_page=page)
    with tempfile.TemporaryDirectory() as tmp:
        svg_path = Path(tmp) / 'page.svg'
        subprocess.run(['pdftocairo', '-svg', '-f', str(page), '-l', str(page), str(pdf), str(svg_path)], check=True)
        svg = svg_path.read_text()
    (directory / f'p{page}.svg').write_text(svg)
    # Glyph outlines are in <defs>; only direct page paths are table rules.
    rectangles = []
    for node in ET.fromstring(svg):
        if node.tag.rsplit('}', 1)[-1] != 'path':
            continue
        for match in RECTANGLE.finditer(node.get('d', '')):
            pairs = list(zip(*[iter(map(float, match.groups()))] * 2))
            xs, ys = zip(*pairs)
            rectangles.append((min(xs), min(ys), max(xs), max(ys)))
    horizontal = [b for b in rectangles if b[3] - b[1] < 3 and b[2] - b[0] > 10]
    (directory / f'p{page}.words.json').write_text(json.dumps([asdict(t) for t in tokens], ensure_ascii=False, indent=2) + '\n')
    return tokens, horizontal


def bands_at(rules, x, top, bottom):
    edges = sorted({round((a[1] + a[3]) / 2, 4) for a in rules if a[0] < x < a[2] and top < a[1] < bottom})
    if len(edges) < 2:
        raise ValueError('No complete ruled table at the measured amount column')
    return tuple(RowBand(a, b) for a, b in zip(edges, edges[1:]))


def cells(tokens, page, columns, bands):
    placed = place_tokens(tokens, {(t.origin_id, page): Placement(str(page)) for t in tokens})
    result = assemble_table(placed, TableLayout(tuple(columns), row_bands=bands))
    records = []
    for band, row in zip(bands, result.rows, strict=True):
        record = {c.column: text([w.token for w in c.tokens]) for c in row.cells}
        record['_tokens'] = {c.column: [w.token for w in c.tokens] for c in row.cells}
        record['_band'] = band
        records.append(record)
    return records


def printed_page(tokens):
    value = text([t for t in tokens if t.bbox.top > 800])
    if not value or not re.fullmatch(r'-[0-9]+-', value):
        raise ValueError('Printed page footer differs')
    return value


def position(page, footer, band):
    return {'物理頁': page, '印刷頁': footer, '原典位置_上端': band.top, '原典位置_下端': band.bottom}


def printed_position(page, tokens):
    """Enclose the observed print, retaining the first printed ancestor on repeats."""
    return {'物理頁': page, '左端': min(t.bbox.left for t in tokens),
            '上端': min(t.bbox.top for t in tokens),
            '右端': max(t.bbox.right for t in tokens),
            '下端': max(t.bbox.bottom for t in tokens)}


def detail(pdf, pages, origin, directory):
    output, observations = [], []
    context, positions = {}, {}
    for index, page in enumerate(pages):
        tokens, rules = observe(pdf, page, origin, directory)
        if text([t for t in tokens if '消費税' in t.raw_text]) != '（消費税抜き）':
            raise ValueError('Expense detail tax heading differs')
        header = [t for t in tokens if 90 < t.bbox.top < 145 and t.raw_text in ('款項', '目', '節', '金', '額（円）', '備', '考')]
        if set(t.raw_text for t in header) != {'款項', '目', '節', '金', '額（円）', '備', '考'}:
            raise ValueError('Missing expense detail headers')
        offset = next(t.bbox.left for t in tokens if t.raw_text == '額（円）') - 302.302121
        border = 177.4 + offset
        split = []
        for token in tokens:
            if token.bbox.left < border < token.bbox.right and token.bbox.top > 115:
                # Poppler merges the final moku glyph with the first section glyph
                # on continuation pages. Split only this two-glyph boundary case.
                if len(token.raw_text) != 2 or token.raw_text[0] != '費':
                    raise ValueError(f'Unmeasured word crossing name/section rule: {token.id}')
                width = token.bbox.bottom - token.bbox.top
                split.extend((replace(token, id=token.id + ':left', raw_text=token.raw_text[0],
                                      bbox=Box(token.bbox.left, token.bbox.top, token.bbox.left + width, token.bbox.bottom), parent_id=token.id),
                              replace(token, id=token.id + ':right', raw_text=token.raw_text[1],
                                      bbox=Box(token.bbox.right - width, token.bbox.top, token.bbox.right, token.bbox.bottom), parent_id=token.id)))
            else:
                split.append(token)
        tokens = split
        bands = bands_at(rules, 300 + offset, 140 if index == 0 else 110, 795)
        columns = [Column('名称', 50, border, anchor='left'), Column('節', border, 260.1 + offset, anchor='left'),
                   Column('金額（円）', 260.1 + offset, 343 + offset, anchor='left'), Column('備考', 343 + offset, 550, anchor='left')]
        for record in cells(tokens, page, columns, bands):
            label, section, amount = record['名称'], record['節'], record['金額（円）']
            if label:
                names = record['_tokens']['名称']
                numbering = [t for t in names if t.bbox.left < 95 + offset and re.fullmatch('[０-９]+', t.raw_text)]
                if numbering:
                    label = (text(numbering) or '') + (text([t for t in names if t not in numbering]) or '')
            if amount is None or not AMOUNT.fullmatch(amount):
                raise ValueError(f'Missing/unrecognized detail amount on p{page}: {record}')
            band = record['_band']
            if label and not section:
                left = min(t.bbox.left for t in record['_tokens']['名称']) - offset
                level = '款' if left < 62 else '項' if left < 76 else '目'
                lower = ('款', '項', '目')
                for key in lower[lower.index(level):]:
                    context.pop(key, None)
                    context.pop(key + '_金額', None)
                    positions.pop(key, None)
                context.update({level: label, level + '_金額': amount})
                positions[level] = printed_position(page, record['_tokens']['名称'] + record['_tokens']['金額（円）'])
                observations.append({'page': page, 'kind': level, 'name': label, 'amount': amount, 'top': band.top, 'bottom': band.bottom})
                continue
            if not section or not all(key in context for key in ('款', '項', '目')):
                raise ValueError(f'Expense section lacks full source hierarchy on p{page}')
            if label and label != context['目']:
                raise ValueError(f'Continuation moku differs on p{page}: {label}')
            remarks = record['_tokens']['備考']
            remark_lines = []
            for t in sorted(remarks, key=lambda t: (t.bbox.top, t.bbox.left)):
                if not remark_lines or t.bbox.top - remark_lines[-1][0].bbox.top > 1:
                    remark_lines.append([])
                remark_lines[-1].append(t)
            budget, budget_position, leaves, leaf_positions = None, None, [], []
            for line in remark_lines:
                amounts = [t for t in line if AMOUNT.fullmatch(t.raw_text)]
                names = [t for t in line if t not in amounts]
                if len(amounts) != 1 or not names:
                    raise ValueError(f'Unmeasured expense remark line on p{page}')
                name, value = text(names), text(amounts)
                if name == '予算額':
                    if budget is not None:
                        raise ValueError('Repeated remark budget')
                    budget = value
                    budget_position = printed_position(page, line)
                else:
                    leaves.append((name, value))
                    leaf_positions.append(printed_position(page, line))
            observations.append({'page': page, 'kind': '節', 'name': section, 'amount': amount,
                                 'context': dict(context), 'budget': budget, 'remarks': leaves,
                                 'top': band.top, 'bottom': band.bottom})
            section_position = printed_position(page, record['_tokens']['節'] + record['_tokens']['金額（円）'])
            for (name, value), leaf_position in zip(leaves or [(None, None)], leaf_positions or [None], strict=True):
                output.append({**context, '節': section, '金額（円）': amount, '備考_予算額': budget,
                               '備考_名称': name, '備考_金額': value,
                               **position(page, printed_page(tokens), band),
                               '_positions': {**positions, '節': section_position,
                                              '備考': leaf_position, '予算額': budget_position}})
    return output, observations


def migration_detail_rows(rows):
    """Declare the printed hierarchy for the common node-table migration.

    Enterprise sections are children of moku, and their remarks are children of
    the section. Budget annotations belong to that section rather than to a
    remark leaf. Position grains distinguish printed items with equal names.
    The internal 科目 prefixes also keep independent revenue/capital statements
    out of the manager's 款_/項_/目_ sibling-completion path.
    """
    output = []
    for row in rows:
        record = {}
        for level in ('款', '項', '目', '節'):
            prefix = '科目' + level + '_'
            record[prefix + '名称'] = row[level]
            record[prefix + '金額（円）'] = row['金額（円）' if level == '節' else level + '_金額']
            record.update({prefix + k: v for k, v in row['_positions'][level].items()})
        record.update({'備考_名称': row['備考_名称'], '備考_金額（円）': row['備考_金額'],
                       '備考_予算額': row['備考_予算額']})
        for key in ('物理頁', '左端', '上端', '右端', '下端'):
            record['備考_' + key] = (row['_positions']['備考'] or {}).get(key)
            record[key] = (row['_positions']['予算額'] or {}).get(key)
        output.append(record)
    return output


def detail_metadata():
    amounts, contexts = [], []
    for level in ('款', '項', '目', '節'):
        prefix = '科目' + level + '_'
        amount = prefix + '金額（円）'
        positions = [prefix + k for k in ('物理頁', '左端', '上端', '右端', '下端')]
        amounts.append(amount)
        contexts.append({'columns': [prefix + '名称', amount, *positions],
                         'header_path': ['款項', level], 'grain_columns': positions, 'amount_position_prefix': prefix})
    amounts += ['備考_金額（円）', '備考_予算額']
    contexts += [
        {'columns': ['備考_名称', '備考_金額（円）'], 'header_path': ['備考'], 'amount_position_prefix': '備考_',
         'grain_columns': ['備考_物理頁', '備考_上端', '備考_左端']},
        {'columns': ['備考_予算額'], 'header_path': ['備考'], 'amount_position_prefix': '',
         'grain_columns': ['科目節_物理頁', '科目節_上端', '科目節_左端']},
    ]
    note = ('（消費税抜き）。款項・目・節の金額（円）は決算の実績。'
            '備考の予算額は同じ節の別金額欄、その他の備考金額は同じ節の実績内訳。'
            '企業会計の節は原典のまま保持する。収益的支出と資本的支出は独立した表。')
    return {'units': [{'text': '円', 'scope': {'kind': 'columns', 'columns': amounts}}],
            'notes': [{'text': note, 'scope': {'kind': 'table'}}], 'column_contexts': contexts}


REVENUE_LEFT = [Column('区分', 40, 170, 'left'), Column('当初予算額', 170, 247, 'right'),
                Column('補正予算額', 247, 328, 'right'), Column('予備費支出額', 328, 403, 'right'),
                Column('流用増減額', 403, 479, 'right'),
                Column('地方公営企業法第24条第3項の規定による支出額', 479, 550, 'right')]
REVENUE_RIGHT = [Column('小計', 45, 125, 'right'),
                 Column('地方公営企業法第26条第２項の規定による繰越額', 125, 181, 'right'),
                 Column('合計', 181, 256, 'right'), Column('決算額', 256, 332, 'right'),
                 Column('地方公営企業法第26条第2項の規定による繰越額', 332, 402, 'right'),
                 Column('不用額', 402, 483, 'right'), Column('備考', 483, 550, 'left')]
CAPITAL_LEFT = [Column('区分', 30, 155, 'left'), Column('当初予算額', 155, 228, 'right'),
               Column('補正予算額', 228, 304, 'right'), Column('予備費支出額', 304, 368, 'right'),
               Column('流用増減額', 368, 408, 'right'), Column('小計', 408, 487, 'right'),
               Column('地方公営企業法第26条の規定による前年度繰越額', 487, 562, 'right')]
CAPITAL_RIGHT = [Column('継続費逓次繰越額', 30, 97, 'right'), Column('合計', 97, 172, 'right'),
                Column('決算額', 172, 251, 'right'),
                Column('地方公営企業法第26条の規定による繰越額', 251, 313, 'right'),
                Column('翌年度繰越額_継続費逓次繰越額', 313, 364, 'right'),
                Column('翌年度繰越額_合計', 364, 431, 'right'), Column('不用額', 431, 505, 'right'),
                Column('備考', 505, 568, 'left')]


def report(pdf, pages, origin, directory, capital):
    left_page, right_page = pages
    lt, lr = observe(pdf, left_page, origin, directory)
    rt, rr = observe(pdf, right_page, origin, directory)
    lc, rc = (CAPITAL_LEFT, CAPITAL_RIGHT) if capital else (REVENUE_LEFT, REVENUE_RIGHT)
    top, bottom = (535, 740) if capital else (460, 674)
    lb, rb = bands_at(lr, 200, top, bottom), bands_at(rr, 220, top, bottom)
    if len(lb) != 5 or len(rb) != 5 or any(abs(a.top - b.top) > 1 for a, b in zip(lb, rb)):
        raise ValueError('Report spread rows do not align by original horizontal rules')
    tax = text([t for t in rt if 380 < t.bbox.top < 490 and (t.raw_text.startswith('（消費税') or '単位：円' in t.raw_text)])
    if tax != '（消費税込み単位：円）':
        raise ValueError('Report tax/unit heading differs')
    header_top = 505 if capital else 425
    header_alias = {'翌年度繰越額_継続費逓次繰越額': '継続費逓次繰越額', '翌年度繰越額_合計': '合計'}
    for page, tokens, columns, bands in [(left_page, lt, lc, lb), (right_page, rt, rc, rb)]:
        observed_header = cells(tokens, page, columns, (RowBand(header_top, bands[0].top),))[0]
        for column in columns:
            if observed_header[column.name] != header_alias.get(column.name, column.name):
                raise ValueError(f'Report column heading differs on p{page}: {column.name}: {observed_header[column.name]}')
    records = []
    for left, right in zip(cells(lt, left_page, lc, lb), cells(rt, right_page, rc, rb), strict=True):
        numbering = [t for t in left['_tokens']['区分'] if re.fullmatch('第[０-９]+[款項]', t.raw_text)]
        if len(numbering) != 1:
            raise ValueError('Missing report printed classification number')
        left['区分'] = text(numbering) + (text([t for t in left['_tokens']['区分'] if t not in numbering]) or '')
        right.pop('備考')
        remark_tokens = right['_tokens']['備考']
        numbers = [t for t in remark_tokens if AMOUNT.fullmatch(t.raw_text)]
        name = text([t for t in remark_tokens if t not in numbers])
        if name != 'うち仮払消費税' or len(numbers) != 1:
            raise ValueError('Report input-tax remark differs')
        values = {**{c.name: left[c.name] for c in lc}, **{c.name: right[c.name] for c in rc if c.name != '備考'},
                  '備考_名称': name, '備考_金額': text(numbers)}
        if any(not AMOUNT.fullmatch(v or '') for k, v in values.items() if k not in ('区分', '備考_名称')):
            raise ValueError('Missing/unrecognized report amount')
        records.append({**values, **position(left_page, printed_page(lt), left['_band']),
                        '右物理頁': right_page, '右印刷頁': printed_page(rt)})
    parent, *children = records
    if not parent['区分'].startswith('第１款') or any(not r['区分'].startswith('第') or '項' not in r['区分'] for r in children):
        raise ValueError('Report hierarchy differs')
    result = []
    for child in children:
        result.append({'区分_款': parent['区分'], '区分_項': child['区分'],
                       **{'区分_款_' + k: v for k, v in parent.items() if k != '区分'},
                       **{k: v for k, v in child.items() if k != '区分'}})
    return result, records


def report_metadata(rows, capital):
    amounts = [k for k, v in rows[0].items() if isinstance(v, str) and AMOUNT.fullmatch(v)]
    contexts = []
    note = '（消費税込み 単位：円）。区分の項を一行とし、款の原典値を区分_款_補助列へ反復する。予算額の各欄と決算額・繰越額・不用額、備考うち仮払消費税は独立した原典の欄である。'
    budget_columns = {c.name for c in (CAPITAL_LEFT if capital else REVENUE_LEFT) if c.name != '区分'}
    budget_columns |= {'合計', '継続費逓次繰越額'}
    if not capital:
        budget_columns |= {'小計', '地方公営企業法第26条第２項の規定による繰越額'}
    for k in rows[0]:
        base = k.removeprefix('区分_款_')
        if base in (*POSITION_COLUMNS, '右物理頁', '右印刷頁') or k in ('区分_款', '区分_項'):
            continue
        path = ['翌年度繰越額'] if base.startswith('翌年度繰越額_') else ['備考'] if base.startswith('備考_') else ['予算額'] if base in budget_columns else []
        grain = ['区分_款'] if k.startswith('区分_款_') else ['区分_款', '区分_項']
        contexts.append({'columns': [k], 'header_path': path, 'grain_columns': grain})
    return {'units': [{'text': '円', 'scope': {'kind': 'columns', 'columns': amounts}}],
            'notes': [{'text': note, 'scope': {'kind': 'table'}}], 'column_contexts': contexts}


def convert(inputs, destination, options):
    if len(inputs) != 1:
        raise ValueError('Enterprise statement requires one selected original')
    source = inputs[0]
    if source['format'] != 'pdf' or source['direction'] != 'expenditure' or source['target']['jurisdiction'] != '132071':
        raise ValueError('This measured layout requires Akishima PDF expenditure')
    scope = source['scope']
    if len(scope) != 1 or scope[0]['account'] != '下水道事業会計':
        raise ValueError('Measured enterprise account scope differs')
    requested = options['report_pages'] + options['revenue_expense_pages'] + options['capital_expense_pages']
    selected = [p for first, last in scope[0]['pages'] for p in range(first, last + 1)]
    if sorted(requested) != sorted(selected) or len(set(requested)) != len(requested):
        raise ValueError('Layout pages must cover the complete supplied expenditure scope exactly')
    destination = Path(destination)
    observations = destination / 'enterprise-observations'
    observations.mkdir()
    pdf, origin = source['path'], source['sha256']
    jobs = [('revenue-report', False, False, options['report_pages'][:2]),
            ('capital-report', False, True, options['report_pages'][2:]),
            ('revenue-detail', True, False, options['revenue_expense_pages']),
            ('capital-detail', True, True, options['capital_expense_pages'])]
    result = {}
    for suffix, is_detail, capital, pages in jobs:
        rows, observed = detail(pdf, pages, origin, observations) if is_detail else report(pdf, pages, origin, observations, capital)
        table_id = options['table_prefix'] + '-' + suffix
        (observations / (suffix + '.json')).write_text(json.dumps(observed, ensure_ascii=False, indent=2) + '\n')
        if is_detail:
            rows = migration_detail_rows(rows)
        columns = tuple(ParquetColumn(k, 'BIGINT' if k.endswith('物理頁') else 'DOUBLE' if k.endswith(('左端', '上端', '右端', '下端')) else 'VARCHAR') for k in rows[0])
        info = write_conversion(destination / (table_id + '.parquet'), rows, columns=columns,
                                context=ConversionContext(origin, table_id, __file__))
        result[table_id] = {'path': Path(info.path), 'metadata': detail_metadata() if is_detail else report_metadata(rows, capital)}
    return result
