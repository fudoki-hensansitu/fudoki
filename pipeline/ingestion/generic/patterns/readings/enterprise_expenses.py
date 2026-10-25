from __future__ import annotations
from dataclasses import asdict
import json
from pathlib import Path
import re
import subprocess
import tempfile
import xml.etree.ElementTree as ET
from ingestion.lib.conversion import ConversionContext, write_conversion
from ingestion.lib.node_tables import write_coverage_words
from ingestion.lib.parquet import ParquetColumn
from ingestion.lib.pdf_table import Column, Placement, RowBand, TableLayout, assemble_table, place_tokens, tokens_from_bbox_layout
from ingestion.generic.reading import Reading


class Reader(Reading):
    REQUIRED_RULES = ['detail', 'detail_metadata', 'migration_detail_rows']

    def __init__(self, profile, workflow):
        super().__init__(profile, workflow)
        self.AMOUNT = re.compile(r'[0-9][0-9,]*')
        self.RECTANGLE = re.compile(r'M ([0-9.]+) ([0-9.]+) L ([0-9.]+) ([0-9.]+) L ([0-9.]+) ([0-9.]+) L ([0-9.]+) ([0-9.]+) Z')
        self.POSITION_COLUMNS = tuple(profile['position_columns'])
        self.REVENUE_LEFT = [Column('区分', 40, 170, 'left'), Column('当初予算額', 170, 247, 'right'),
                        Column('補正予算額', 247, 328, 'right'), Column('予備費支出額', 328, 403, 'right'),
                        Column('流用増減額', 403, 479, 'right'),
                        Column('地方公営企業法第24条第3項の規定による支出額', 479, 550, 'right')]
        self.REVENUE_RIGHT = [Column('小計', 45, 125, 'right'),
                         Column('地方公営企業法第26条第２項の規定による繰越額', 125, 181, 'right'),
                         Column('合計', 181, 256, 'right'), Column('決算額', 256, 332, 'right'),
                         Column('地方公営企業法第26条第2項の規定による繰越額', 332, 402, 'right'),
                         Column('不用額', 402, 483, 'right'), Column('備考', 483, 550, 'left')]
        self.CAPITAL_LEFT = [Column('区分', 30, 155, 'left'), Column('当初予算額', 155, 228, 'right'),
                       Column('補正予算額', 228, 304, 'right'), Column('予備費支出額', 304, 368, 'right'),
                       Column('流用増減額', 368, 408, 'right'), Column('小計', 408, 487, 'right'),
                       Column('地方公営企業法第26条の規定による前年度繰越額', 487, 562, 'right')]
        self.CAPITAL_RIGHT = [Column('継続費逓次繰越額', 30, 97, 'right'), Column('合計', 97, 172, 'right'),
                        Column('決算額', 172, 251, 'right'),
                        Column('地方公営企業法第26条の規定による繰越額', 251, 313, 'right'),
                        Column('翌年度繰越額_継続費逓次繰越額', 313, 364, 'right'),
                        Column('翌年度繰越額_合計', 364, 431, 'right'), Column('不用額', 431, 505, 'right'),
                        Column('備考', 505, 568, 'left')]


    def text(self, tokens):
        """Restore line order within wrapped cells without inserting inferred spaces."""
        rows = []
        for token in sorted(tokens, key=lambda t: (t.bbox.top, t.bbox.left)):
            if not rows or token.bbox.top - rows[-1][0].bbox.top > 1:
                rows.append([])
            rows[-1].append(token)
        return ''.join(t.raw_text for row in rows for t in sorted(row, key=lambda t: t.bbox.left)) or None

    def observe(self, pdf, page, origin, directory):
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
            for match in self.RECTANGLE.finditer(node.get('d', '')):
                pairs = list(zip(*[iter(map(float, match.groups()))] * 2))
                xs, ys = zip(*pairs)
                rectangles.append((min(xs), min(ys), max(xs), max(ys)))
        horizontal = [b for b in rectangles if b[3] - b[1] < 3 and b[2] - b[0] > 10]
        (directory / f'p{page}.words.json').write_text(json.dumps([asdict(t) for t in tokens], ensure_ascii=False, indent=2) + '\n')
        return tokens, horizontal

    def bands_at(self, rules, x, top, bottom):
        edges = sorted({round((a[1] + a[3]) / 2, 4) for a in rules if a[0] < x < a[2] and top < a[1] < bottom})
        if len(edges) < 2:
            raise ValueError('No complete ruled table at the measured amount column')
        return tuple(RowBand(a, b) for a, b in zip(edges, edges[1:]))

    def cells(self, tokens, page, columns, bands):
        placed = place_tokens(tokens, {(t.origin_id, page): Placement(str(page)) for t in tokens})
        result = assemble_table(placed, TableLayout(tuple(columns), row_bands=bands))
        records = []
        for band, row in zip(bands, result.rows, strict=True):
            record = {c.column: self.text([w.token for w in c.tokens]) for c in row.cells}
            record['_tokens'] = {c.column: [w.token for w in c.tokens] for c in row.cells}
            record['_band'] = band
            records.append(record)
        return records

    def printed_page(self, tokens):
        value = self.text([t for t in tokens if t.bbox.top > 800])
        if not value or not re.fullmatch(r'-[0-9]+-', value):
            raise ValueError('Printed page footer differs')
        return value

    def position(self, page, footer, band):
        return {'物理頁': page, '印刷頁': footer, '原典位置_上端': band.top, '原典位置_下端': band.bottom}

    def printed_position(self, page, tokens):
        """Enclose the observed print, retaining the first printed ancestor on repeats."""
        return {'物理頁': page, '左端': min(t.bbox.left for t in tokens),
                '上端': min(t.bbox.top for t in tokens),
                '右端': max(t.bbox.right for t in tokens),
                '下端': max(t.bbox.bottom for t in tokens)}

    def report(self, pdf, pages, origin, directory, capital):
        left_page, right_page = pages
        lt, lr = self.observe(pdf, left_page, origin, directory)
        rt, rr = self.observe(pdf, right_page, origin, directory)
        coverage = ([(left_page, (t.bbox.left, t.bbox.top, t.bbox.right, t.bbox.bottom), t.raw_text) for t in lt] +
                    [(right_page, (t.bbox.left, t.bbox.top, t.bbox.right, t.bbox.bottom), t.raw_text) for t in rt])
        lc, rc = (self.CAPITAL_LEFT, self.CAPITAL_RIGHT) if capital else (self.REVENUE_LEFT, self.REVENUE_RIGHT)
        top, bottom = (535, 740) if capital else (460, 674)
        lb, rb = self.bands_at(lr, 200, top, bottom), self.bands_at(rr, 220, top, bottom)
        if len(lb) != 5 or len(rb) != 5 or any(abs(a.top - b.top) > 1 for a, b in zip(lb, rb)):
            raise ValueError('Report spread rows do not align by original horizontal rules')
        tax = self.text([t for t in rt if 380 < t.bbox.top < 490 and (t.raw_text.startswith('（消費税') or '単位：円' in t.raw_text)])
        if tax != '（消費税込み単位：円）':
            raise ValueError('Report tax/unit heading differs')
        header_top = 505 if capital else 425
        header_alias = {'翌年度繰越額_継続費逓次繰越額': '継続費逓次繰越額', '翌年度繰越額_合計': '合計'}
        for page, tokens, columns, bands in [(left_page, lt, lc, lb), (right_page, rt, rc, rb)]:
            observed_header = self.cells(tokens, page, columns, (RowBand(header_top, bands[0].top),))[0]
            for column in columns:
                if observed_header[column.name] != header_alias.get(column.name, column.name):
                    raise ValueError(f'Report column heading differs on p{page}: {column.name}: {observed_header[column.name]}')
        records = []
        for left, right in zip(self.cells(lt, left_page, lc, lb), self.cells(rt, right_page, rc, rb), strict=True):
            numbering = [t for t in left['_tokens']['区分'] if re.fullmatch('第[０-９]+[款項]', t.raw_text)]
            if len(numbering) != 1:
                raise ValueError('Missing report printed classification number')
            left['区分'] = self.text(numbering) + (self.text([t for t in left['_tokens']['区分'] if t not in numbering]) or '')
            right.pop('備考')
            remark_tokens = right['_tokens']['備考']
            numbers = [t for t in remark_tokens if self.AMOUNT.fullmatch(t.raw_text)]
            name = self.text([t for t in remark_tokens if t not in numbers])
            if name != 'うち仮払消費税' or len(numbers) != 1:
                raise ValueError('Report input-tax remark differs')
            values = {**{c.name: left[c.name] for c in lc}, **{c.name: right[c.name] for c in rc if c.name != '備考'},
                      '備考_名称': name, '備考_金額': self.text(numbers)}
            if any(not self.AMOUNT.fullmatch(v or '') for k, v in values.items() if k not in ('区分', '備考_名称')):
                raise ValueError('Missing/unrecognized report amount')
            records.append({**values, **self.position(left_page, self.printed_page(lt), left['_band']),
                            '右物理頁': right_page, '右印刷頁': self.printed_page(rt)})
        parent, *children = records
        if not parent['区分'].startswith('第１款') or any(not r['区分'].startswith('第') or '項' not in r['区分'] for r in children):
            raise ValueError('Report hierarchy differs')
        result = []
        for child in children:
            result.append({'区分_款': parent['区分'], '区分_項': child['区分'],
                           **{'区分_款_' + k: v for k, v in parent.items() if k != '区分'},
                           **{k: v for k, v in child.items() if k != '区分'}})
        return result, records, coverage

    def report_metadata(self, rows, capital):
        amounts = [k for k, v in rows[0].items() if isinstance(v, str) and self.AMOUNT.fullmatch(v)]
        contexts = []
        note = '（消費税込み 単位：円）。区分の項を一行とし、款の原典値を区分_款_補助列へ反復する。予算額の各欄と決算額・繰越額・不用額、備考うち仮払消費税は独立した原典の欄である。'
        budget_columns = {c.name for c in (self.CAPITAL_LEFT if capital else self.REVENUE_LEFT) if c.name != '区分'}
        budget_columns |= {'合計', '継続費逓次繰越額'}
        if not capital:
            budget_columns |= {'小計', '地方公営企業法第26条第２項の規定による繰越額'}
        for k in rows[0]:
            base = k.removeprefix('区分_款_')
            if base in (*self.POSITION_COLUMNS, '右物理頁', '右印刷頁') or k in ('区分_款', '区分_項'):
                continue
            path = ['翌年度繰越額'] if base.startswith('翌年度繰越額_') else ['備考'] if base.startswith('備考_') else ['予算額'] if base in budget_columns else []
            grain = ['区分_款'] if k.startswith('区分_款_') else ['区分_款', '区分_項']
            contexts.append({'columns': [k], 'header_path': path, 'grain_columns': grain})
        return {'units': [{'text': '円', 'scope': {'kind': 'columns', 'columns': amounts}}],
                'notes': [{'text': note, 'scope': {'kind': 'table'}}], 'column_contexts': contexts}

    def convert(self, inputs, destination, options):
        if len(inputs) != 1:
            raise ValueError('Enterprise statement requires one selected original')
        source = inputs[0]
        if source['format'] != 'pdf' or source['direction'] != 'expenditure':
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
            if is_detail:
                rows, observed, coverage = self.rule('detail')(pdf, pages, origin, observations)
            else:
                rows, observed, coverage = self.report(pdf, pages, origin, observations, capital)
            table_id = options['table_prefix'] + '-' + suffix
            (observations / (suffix + '.json')).write_text(json.dumps(observed, ensure_ascii=False, indent=2) + '\n')
            if is_detail:
                rows = self.rule('migration_detail_rows')(rows)
            columns = tuple(ParquetColumn(k, 'BIGINT' if k.endswith('物理頁') else 'DOUBLE' if k.endswith(('左端', '上端', '右端', '下端')) else 'VARCHAR') for k in rows[0])
            info = write_conversion(destination / (table_id + '.parquet'), rows, columns=columns,
                                    context=ConversionContext(origin, table_id, __file__))
            write_coverage_words(Path(info.path), coverage)
            result[table_id] = {'path': Path(info.path), 'metadata': self.rule('detail_metadata')() if is_detail else self.report_metadata(rows, capital)}
        return result
