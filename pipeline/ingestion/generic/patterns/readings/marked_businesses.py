from __future__ import annotations
from collections import defaultdict
import json
from pathlib import Path
import re
import subprocess
import duckdb
from ingestion.lib.node_tables import write_coverage_words
from ingestion.lib.pdf_table import tokens_from_bbox_layout
from importlib import import_module
from ingestion.generic.reading import Reading


class Reader(Reading):
    REQUIRED_RULES = ['annual_header', 'annual_row', 'assemble', 'grid_lines', 'grid_table', 'inner_header', 'money', 'node_context', 'nonfinancial_facts', 'parent_event', 'table_cells', 'unexplained_sections']

    def __init__(self, profile, workflow):
        super().__init__(profile, workflow)
        self.monetary = import_module("ingestion.generic.patterns.readings.business_amounts")
        self.AMOUNT = re.compile(r'^(?:[0-9]+(?:,[0-9]{3})*(?:\.[0-9]+)?|－|−|―|\（[0-9.]+\）)$')
        self.FINANCIAL = profile['financial']
        self.LEVELS = profile['levels']
        self.INNER_HEADERS = profile['inner_headers']
        self.QUANTITY_EXCLUSION = profile['quantity_exclusion']
        self.RESERVE_EXCLUSION = profile['reserve_exclusion']
        self.PERSONNEL_EXCLUSION = profile['personnel_exclusion']
        self.LENDING_EXCLUSION = profile['lending_exclusion']
        self.SECTION_EXCLUSION = profile['section_exclusion']


    def text(self, words):
        return ' '.join(w['text'] for w in sorted(words, key=lambda w: w['x']) if w['text'])

    def compact(self, value):
        return re.sub(r'\s+', '', value)

    def origin_position(self, column, page, words):
        """One amount column's own printed place in this layout's 原典 coordinates.

        Migration reads `<column>_原典物理頁/_原典xMin/...` as the amount's own
        position, never inheriting the node's label position.
        """
        if not words:
            return {f'{column}_{suffix}': None for suffix in
                    ('原典物理頁', '原典xMin', '原典yMin', '原典xMax', '原典yMax')}
        boxes = [[w['x'], w['y'], w['xe'], w['ye']] for w in words]
        return {column + '_原典物理頁': page, column + '_原典xMin': min(b[0] for b in boxes),
                column + '_原典yMin': min(b[1] for b in boxes),
                column + '_原典xMax': max(b[2] for b in boxes),
                column + '_原典yMax': max(b[3] for b in boxes)}

    def rows(self, words, *, tolerance=4.1):
        result = []
        for word in sorted(words, key=lambda w: (w['y'], w['x'])):
            if not result or word['y'] - result[-1][0]['y'] > tolerance:
                result.append([])
            result[-1].append(word)
        return [sorted(row, key=lambda w: w['x']) for row in result]

    def coordinates(self, words, page):
        return {'原典物理頁': page, '原典xMin': min(w['x'] for w in words),
                '原典yMin': min(w['y'] for w in words), '原典xMax': max(w['xe'] for w in words),
                '原典yMax': max(w['ye'] for w in words)}

    def rowbox(self, row, page):
        """One printed row's display box for read-but-not-adopted regions."""
        return [page, [min(w['x'] for w in row), min(w['y'] for w in row),
                       max(w['xe'] for w in row), max(w['ye'] for w in row)]]

    def write_parquet(self, path, records):
        if not records:
            raise ValueError(f'No rows for {path}')
        columns = list(dict.fromkeys(key for record in records for key in record))
        types = {}
        for col in columns:
            if col.endswith('物理頁'):
                types[col] = 'INTEGER'
            elif re.search(r'(?:xMin|xMax|yMin|yMax)$', col):
                types[col] = 'DOUBLE'
            else:
                types[col] = 'VARCHAR'
        quote = lambda value: '"' + value.replace('"', '""') + '"'
        with duckdb.connect() as con:
            con.execute('create table raw (' + ', '.join(quote(c) + ' ' + types[c] for c in columns) + ')')
            con.executemany('insert into raw values (' + ','.join('?' for _ in columns) + ')',
                            [[record.get(c) for c in columns] for record in records])
            con.execute('copy raw to ? (format parquet, compression zstd)', [str(path)])
            readback = con.execute('select * from read_parquet(?, hive_partitioning=false)', [str(path)]).fetchall()
        expected = [tuple(record.get(c) for c in columns) for record in records]
        if readback != expected:
            raise ValueError('Parquet readback differs from the assembled original cells')
        return columns

    def context(self, parents):
        result = {}
        for level in ['款', '項', '目']:
            parent = parents.get(level)
            if parent:
                for key, value in parent.items():
                    if key != 'level':
                        result[level + '_' + key] = value
        return result

    def reading_position(self, location):
        return location['原典物理頁'], int(location['原典xMin'] >= 650), location['原典yMin']

    def coordinates_keys(self):
        return ['原典物理頁', '原典xMin', '原典yMin', '原典xMax', '原典yMax']

    def metadata(self, columns, *, auxiliary=(), reserve=False, lending=False):
        monetary = [c for c in columns if any(c.endswith('_' + f) for f in self.FINANCIAL[:-1])
                    or c.endswith('_金額') or c == '明細金額' or c.startswith('施工概要_') and c != '施工概要_区分'
                    or c in ('充用した科目（事業）及び金額', '内表_金額', '内表_給付額', '内表_月額')]
        result = {'units': [{'text': '円', 'scope': {'kind': 'columns', 'columns': monetary}}],
                  'notes': [{'text': '事業説明と法定節一覧は独立の分解であり、同じ高さの節を事業に対応付けない。名称内の字間はPopplerの単語を空白で連結し、折り返しは改行で保持。XML構文を壊す印字外の制御文字だけを解析用コピーから除去し、原XMLを観測として保持。',
                             'scope': {'kind': 'table'}}], 'column_contexts': []}
        for level in ('款', '項', '目'):
            group = [c for c in columns if c.startswith(level + '_')
                     and not c.startswith('目_機関部署見出し')]
            result['column_contexts'].append({'columns': group, 'header_path': ['科目', level],
                                             'grain_columns': [level + '_番号', level + '_原典物理頁', level + '_原典yMin']})
        office = [c for c in columns if c.startswith('目_機関部署見出し')]
        if office:
            result['column_contexts'].append({'columns': office, 'header_path': ['科目', '目', '機関部署見出し'],
                                             'grain_columns': ['目_機関部署見出し_' + k for k in self.coordinates_keys()]})
            result['notes'].append({'text': '目の直下に印字される機関・部署の見出しはその目自身のscalarであり、特定の事業・内訳の補足ではない。原印字の文字と位置を、原典見出しの開始から次の機関または目見出しまでの最細行へ反復し、支出の分解や事業への付与とは扱わない。', 'scope': {'kind': 'table'}})
        for level in self.LEVELS:
            group = [c for c in columns if c.startswith(level + '_')]
            if group:
                result['column_contexts'].append({'columns': group, 'header_path': ['科目', '事業説明'],
                                                 'grain_columns': [level + '_原典物理頁', level + '_原典yMin'],
                                                 'semantic_role': 'project'})
        annual = [c for c in columns if c.startswith('施工概要_')]
        if annual:
            result['column_contexts'].append({'columns': annual, 'header_path': ['施工概要'],
                                             'grain_columns': ['原典物理頁', '原典yMin', '施工概要_区分']})
        inner = [c for c in columns if c.startswith('内表_')]
        if inner:
            money_columns = []
            for label in ('金額', '給付額'):
                prefix = '内表_' + label
                group = [c for c in inner if c == prefix or c.startswith(prefix + '_')]
                if group:
                    money_columns.extend(group)
                    result['column_contexts'].append({'columns': group, 'header_path': ['事業説明', '内表', label],
                                                     'grain_columns': [prefix + '_' + key for key in self.coordinates_keys()]})
            title_columns = [c for c in inner if c == '内表_表題' or c.startswith('内表_表題_')]
            if title_columns:
                result['column_contexts'].append({'columns': title_columns,
                                                 'header_path': ['事業説明', '内表', '表題'],
                                                 'grain_columns': ['内表_表題_' + k for k in self.coordinates_keys()]})
                result['notes'].append({'text': '金額内表の直上に印字された表題・資格区分の行は、その内表自身の表題であり通常給付側や事業の補足ではない。原印字の文字と位置を内表_表題としてその内表の最細行へ保持する。', 'scope': {'kind': 'table'}})
            result['column_contexts'].append({'columns': [c for c in inner if c not in money_columns + title_columns],
                                             'header_path': ['事業説明', '内表'],
                                             'grain_columns': ['原典物理頁', '原典yMin', '原典yMax']})
            result['notes'].append({'text': '金額を持つ内表は罫線のセル範囲で文字・複数行・結合セルの所属を復元。印字された数量・対象者数・月額・施工数などを原見出しに対応するscalar補助列で保持。金額セルが期別など複数の最細行に縦結合される場合、印字共通金額と同一金額bboxを各行へ反復し、期別配分額とは解釈しない。集計では原典頁・親経路・金額列・金額bboxで同一原典セルを識別し、反復値の一致確認後に一度だけ数える。SUM(DISTINCT 金額)は用いない。内表の計行は検算用観測に保持。', 'scope': {'kind': 'table'}})
        if '内表_給付額' in columns:
            result['units'].append({'text': '件', 'scope': {'kind': 'columns', 'columns': ['内表_件数']}})
            result['notes'].append({'text': '区分・件数・給付額の内表は最細区分行を保持。最初のデータ行上部の独立した件・円の印字は各列共通の単位であり、最初の行だけの値に含めない。', 'scope': {'kind': 'table'}})
        personnel = [c for c in columns if c.startswith('職員_')]
        if personnel:
            result['units'].append({'text': '人', 'scope': {'kind': 'columns', 'columns': ['職員_人数']}})
            result['column_contexts'].append({'columns': personnel, 'header_path': ['事業説明', '職員の給与費'],
                                             'grain_columns': ['原典物理頁', '原典yMin']})
            result['notes'].append({'text': '職員人数の最細区分行は給与費の事業親に属する独立した人数内訳。共通の給与費額と事業の原典位置を各人数行に反復するが、人数区分ごとの支出配分額は印字されていないため明細金額を付与しない。現在日は人数の計行から保持。給与費額を集計する際は同一親経路・原典位置の反復値の一致を確認して一度だけ数える。人数の計行は検算用観測に保持。', 'scope': {'kind': 'table'}})
        quantity = [column for column in columns if column.startswith('数量表_')]
        if quantity:
            declared = set()
            for _, _, _, _, _, title, fields, _, _, _ in auxiliary:
                for field in fields:
                    prefix = '数量表_' + title + '_' + field
                    group = [column for column in quantity if column == prefix or column.startswith(prefix + '_原典')]
                    if not group or prefix in declared:
                        continue
                    declared.add(prefix)
                    result['column_contexts'].append({'columns': group,
                        'header_path': ['事業説明', title, *field.split('_')],
                        'grain_columns': [prefix + '_' + key for key in self.coordinates_keys()
                                          if prefix + '_' + key in columns]})
                    unit = None
                    if ('園児数_' in field or '職員数_' in field or field in ('人数', '戸籍人口', '児童数', '教員数', '生徒数',
                            '園児数', '個人貸出者数', '乳幼児', '小学生', '中学生', '高校生', '保護者')
                            or field.endswith(('受診者数', '入院者数', '調剤数'))
                            or title in ('利用状況', '認定状況') and field != '児童館名'):
                        unit = '人'
                    elif field.endswith(('回数', '回数（延）')):
                        unit = '回'
                    elif field in ('利用件数', '件数'):
                        unit = '件'
                    elif field == '派遣世帯（延）':
                        unit = '世帯'
                    elif field in ('購入図書数', '蔵書数'):
                        unit = '冊'
                    elif field in ('学校数', '園数', '学級数', '戸籍数', '助成基準', '規模'):
                        unit = {'学校数': '校', '園数': '園', '学級数': '学級', '戸籍数': '戸籍',
                                '助成基準': '％', '規模': '㎡'}[field]
                    if unit:
                        result['units'].append({'text': unit, 'scope': {'kind': 'columns', 'columns': [prefix]}})
            general = [column for column in ('数量表_見出し', '数量表_現在日') if column in columns]
            result['column_contexts'].append({'columns': general, 'header_path': ['事業説明', '数量表'],
                                             'grain_columns': ['原典物理頁', '原典yMin', '原典yMax']})
            result['notes'].append({'text': '数量表は原典の最細区分行・欄・結合セル・印字位置を保持する独立した非金額の内訳。共通の給与費・事業費などは所属する親の印字金額と位置を反復し、数量行へ配賦した明細金額は付与しない。複数段見出しや重複した計・受診者数等は原見出しの経路で区別。計行はローカル検算用観測。住民基本台帳の京橋・日本橋・月島・計の欄は、区分が世帯数の行は世帯、人口の行は人。道路工種実績の単位は印字された数量セル内の㎡・ｍ・個を保持。回数の括弧内の延日数は同じ原典セルの原文として保持。',
                                     'scope': {'kind': 'table'}})
        if '補足_本文' in columns:
            result['column_contexts'].append({'columns': ['補足_本文'], 'header_path': ['事業説明', '補足'],
                                             'grain_columns': ['原典物理頁', '原典yMin', '原典yMax']})
            result['notes'].append({'text': '所在地・完成予定・件数等の原典補足は印字行の文字と位置をscalarで保持。所属する事業・内訳の共通印字金額と位置は反復し、補足行に支出配分額を付与しない。', 'scope': {'kind': 'table'}})
        section = [c for c in columns if c.startswith('節_')]
        if section:
            result['column_contexts'].append({'columns': section, 'header_path': ['節'],
                                             'grain_columns': ['目_原典物理頁', '目_原典yMin', '節_番号',
                                                               '節_原典物理頁', '節_原典yMin']})
            result['notes'].append({'text': '事業説明の印字がない目だけは、原典の最細法定節行を保持。節の金額は予算現額、支出済額・翌年度繰越額・不用額は同じ節の印字額。事業説明を持つ他の目へ法定節を対応付けず、別軸の節一覧を事業葉行に重ねない。法定節がない予備費は目粒度を保持。', 'scope': {'kind': 'table'}})
        result['notes'].append({'text': ('予備費の「充用した科目（事業）及び金額」の説明。各充用先の金額を保持し、通常事業の支出済額とは異なる。' if reserve else
            '款・項・目の予算列・繰越・不用額・執行率は原典の親項目粒度で反復。事業・内訳金額と明細金額は支出済額の説明。施工概要は全印字年度と計の列を保持し、通常明細金額は空欄。施工概要の区分行を末端として改修親額を反復、計行は検算用観測へ保存。予備費は目粒度の印字0支出済額を保持。'),
                                 'scope': {'kind': 'table'}})
        rates = [c for c in columns if c.endswith('_執行率')]
        if rates:
            result['units'].append({'text': '％', 'scope': {'kind': 'columns', 'columns': rates}})
        if lending:
            result['units'] = [u for u in result['units'] if u['text'] != '円']
            result['units'].extend([{'text': '円', 'scope': {'kind': 'columns', 'columns': [c for c in monetary if c != '内表_金額']}},
                                   {'text': '千円', 'scope': {'kind': 'columns', 'columns': ['内表_金額']}}])
            result['notes'].append({'text': '［備考］貸付状況。原文「区分」「件数」「金額」の最細印字行であり、商工業融資の支出内訳とは異なる実績の表。', 'scope': {'kind': 'table'}})
        return result

    def convert(self, inputs, destination, options):
        if len(inputs) != 1 or inputs[0]['format'] != 'pdf' or inputs[0]['pdf_type'] != 'text':
            raise ValueError('This layout requires one selected text PDF')
        source = inputs[0]
        if source['direction'] != 'expenditure':
            raise ValueError('This measured layout is Chuo expenditure only')
        first, last = options['detail_pages']
        scope = next(s for s in source['scope'] if s['account'] == options['account'])
        if not any(start <= first <= last <= end for start, end in scope['pages']):
            raise ValueError('Requested pages are outside selected account scope')
        destination = Path(destination)
        origin = destination / 'origin-bbox.html'
        subprocess.run(['pdftotext', '-f', str(first), '-l', str(last), '-bbox-layout', str(source['path']), str(origin)], check=True)
        xml = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', '', origin.read_text())
        tokens = tokens_from_bbox_layout(xml, origin_id=source['sha256'], first_page=first)
        pages = defaultdict(list)
        for token in tokens:
            if token.raw_text:
                box = token.bbox
                pages[token.page].append({'text': token.raw_text, 'x': box.left, 'xe': box.right,
                                           'y': box.top, 'ye': box.bottom})
        measured = {k: [tuple(row) for row in options.get(k, [])]
                    for k in ('auxiliary_tables', 'prose_lines', 'office_headings')}
        records, reserve, lending, observations, excluded = self.rule('assemble')(pages, first, last, source=source['path'], destination=destination,
                                                          reserve_kan=options.get('reserve_kan', '11'),
                                                          personnel_breakdown=options.get('personnel_breakdown', False),
                                                          unexplained_section_detail=options.get('unexplained_section_detail', False),
                                                          nonfinancial_breakdown=options.get('nonfinancial_breakdown', False),
                                                          remark_column=options.get('remark_column', False),
                                                          remark_min_x=options.get('remark_min_x', 1024),
                                                          remark_merged_cells=options.get('remark_merged_cells', False),
                                                          row_tolerance=options.get('row_tolerance', 4.1),
                                                          measured=measured)
        (destination / 'builder-observations.json').write_text(json.dumps(observations, ensure_ascii=False, indent=2) + '\n')
        result = {}
        available = {'detail': (records, False, False), 'reserve': (reserve, True, False),
                     'lending': (lending, False, True)}
        role = options.get('output_role')
        if role:
            outputs = [(options['table_id'], *available[role])]
        else:
            outputs = [(options['table_id'], *available['detail'])]
            for name in ('reserve', 'lending'):
                table_id = options.get(name + '_table_id')
                data, is_reserve, is_lending = available[name]
                if not table_id:
                    if data:
                        raise ValueError(f'Nonempty {name} explanation requires a declared table ID or output_role')
                    continue
                outputs.append((table_id, data, is_reserve, is_lending))
        for table_id, data, is_reserve, is_lending in outputs:
            output = destination / (table_id + '.parquet')
            write_coverage_words(output, [(page, (w['x'], w['y'], w['xe'], w['ye']), w['text'])
                                          for page, words in pages.items() for w in words
                                          if 60 <= w['y'] < 790],
                                 excluded_regions=[] if is_reserve or is_lending else excluded)
            if not is_reserve and not is_lending:
                data = self.monetary.prepare(data)
            columns = self.write_parquet(output, data)
            result[table_id] = {'path': output, 'metadata': (self.metadata(columns, auxiliary=measured['auxiliary_tables'], reserve=is_reserve, lending=is_lending)
                                                       if is_reserve or is_lending else self.monetary.metadata(columns))}
        return result
