from pathlib import Path
import json
import re
import subprocess
import xml.etree.ElementTree as ET
from ingestion.lib.conversion import ConversionContext, write_conversion
from ingestion.lib.annotations import remark_prose_lines
from ingestion.lib.node_tables import (AMOUNT_POSITION_SUFFIXES, amount_position_fields, coverage_regions,
                                        write_coverage_words)
from ingestion.lib.parquet import ParquetColumn
from ingestion.generic.reading import Reading


class Reader(Reading):
    REQUIRED_RULES = ['read_total', 'total_row']

    def __init__(self, profile, workflow):
        super().__init__(profile, workflow)
        self.ACCOUNT = profile['account']
        self.METADATA_NOTE = profile['metadata_note']
        self.TOTAL_LABEL = tuple(profile['total_label'])
        self.PARENT_AMOUNTS = profile['parent_amounts']
        self.AMOUNT_EDGES = [tuple(value) for value in profile['amount_edges']]
        self.SETSU_AMOUNT_EDGE = tuple(profile['setsu_amount_edge'])
        self.AMOUNT_COLUMNS = ([{'header': key, 'x_range': list(edges)}
                           for key, edges in zip(self.PARENT_AMOUNTS, self.AMOUNT_EDGES)] +
                          [{'header': '金額', 'x_range': list(self.SETSU_AMOUNT_EDGE)},
                           {'header': '支出済額', 'x_range': list(self.AMOUNT_EDGES[5])},
                           {'header': '翌年度繰越額', 'x_range': list(self.AMOUNT_EDGES[6])},
                           {'header': '不用額', 'x_range': list(self.AMOUNT_EDGES[7])}])
        self.SETSU_NAME_ZONE = tuple(profile['setsu_name_zone'])
        self.SETSU_EVENT_X = tuple(profile['setsu_event_x'])
        self.KAN_NAME_X = tuple(profile['kan_name_x'])
        self.KOU_NAME_X = tuple(profile['kou_name_x'])
        self.MOKU_NAME_X = tuple(profile['moku_name_x'])
        self.NOTE_LEFT = profile['note_left']
        self.UCHIWAKE_REASON = profile['uchiwake_reason']
        self.BODY_TOP = profile['body_top']
        self.BODY_BOTTOM = profile['body_bottom']
        self.AMOUNT = re.compile(r'△?(?:[0-9]{1,3}(?:,[0-9]{3})*|[0-9]+)')
        self.SETSU_SPLIT = re.compile(r'([0-9]+)(.+)')
        self.TOTAL_CARRY_LABELS = tuple(profile['total_carry_labels'])


    def physical_pages(self, ranges):
        pages = []
        for first, last in ranges:
            if first > last or (pages and first <= pages[-1]):
                raise ValueError('Physical page ranges must be ordered and disjoint')
            pages.extend(range(first, last + 1))
        return pages

    def observe(self, pdf, first, last, output):
        subprocess.run(['pdftotext', '-f', str(first), '-l', str(last), '-bbox-layout',
                        str(pdf), str(output)], check=True)
        pages = []
        for number, page in enumerate(ET.parse(output).findall('.//{*}page'), first):
            words = [dict(text=w.text or '', **{k: float(v) for k, v in w.attrib.items()})
                     for w in page.findall('.//{*}word')]
            pages.append((number, sorted(words, key=lambda w: (w['yMin'], w['xMin']))))
        if len(pages) != last - first + 1:
            raise ValueError('Poppler returned incomplete page range')
        widest = max((w['xMax'] for _, words in pages for w in words), default=0)
        if widest < 1100:
            raise ValueError('Unmeasured Musashino page space')
        return pages

    def words_of(self, pages, page):
        return next(words for pageno, words in pages if pageno == page)

    def same_line(self, words, y, left, right):
        return [w for w in words if left <= w['xMin'] and w['xMax'] < right
                and abs(w['yMin'] - y) < 1.2]

    def joined(self, words):
        return ''.join(w['text'] for w in sorted(words, key=lambda w: (round(w['yMin'], 1), w['xMin'])))

    def cell_amount(self, words, y, bounds):
        found = self.same_line(words, y, *bounds)
        text = self.joined(found).replace(' ', '').replace('　', '')
        if not self.AMOUNT.fullmatch(text):
            raise ValueError(f'Amount cell y={y} bounds={bounds} reads {text!r}')
        return text, found

    def boxes(self, words):
        return [[w['xMin'], w['yMin'], w['xMax'], w['yMax']] for w in words]

    def amount_cells(self, words, page, y, keys, edges):
        """Amount texts with their own printed positions, keyed per amount column."""
        record = {}
        for key, bounds in zip(keys, edges):
            value, found = self.cell_amount(words, y, bounds)
            record[key] = value
            record.update(amount_position_fields(key, page, self.boxes(found)))
        return record

    def positioned_names(self, event_word, name_words):
        union = [event_word, *name_words]
        return {'左端': min(w['xMin'] for w in union), '右端': max(w['xMax'] for w in union)}

    def events_on(self, pages):
        found = []
        for page, words in pages:
            for w in words:
                if not (self.BODY_TOP < w['yMin'] < self.BODY_BOTTOM):
                    continue
                if re.fullmatch(r'[0-9]+', w['text']):
                    if w['xMax'] < 60:
                        kind = '款'
                    elif 60 <= w['xMin'] and w['xMax'] < 80:
                        kind = '項'
                    elif 80 <= w['xMin'] and w['xMax'] < 92:
                        kind = '目'
                    elif self.SETSU_EVENT_X[0] <= w['xMin'] and w['xMax'] < self.SETSU_EVENT_X[1]:
                        kind = '節'
                    else:
                        continue
                elif (re.match(r'[0-9]', w['text']) and self.SETSU_EVENT_X[0] <= w['xMin']
                        and w['xMax'] < self.SETSU_EVENT_X[1]):
                    # Setsu numbers merge with the name head (1報, 10需, 13使用料及び).
                    kind = '節'
                else:
                    continue
                found.append({'page': page, 'y': w['yMin'], 'x': w['xMin'], 'kind': kind, 'word': w})
        found.sort(key=lambda e: (e['page'], e['y'], e['x']))
        merged = []
        for event in found:
            if (event['kind'] == '節' and merged and merged[-1]['kind'] == '節'
                    and merged[-1]['page'] == event['page']
                    and abs(merged[-1]['y'] - event['y']) < 1.2):
                # One 節 number split across words (2 + 7繰 + 出 + 金).
                continue
            merged.append(event)
        return merged


    def level_end(self, page, y, events, kinds):
        later = [(e['page'], e['y']) for e in events
                 if e['kind'] in kinds and (e['page'], e['y']) > (page, y + 0.8)]
        return min(later) if later else (page, self.BODY_BOTTOM + 1)

    def names_in(self, pages, level, page, y, end, total_pos):
        zone = {'款': self.KAN_NAME_X, '項': self.KOU_NAME_X, '目': self.MOKU_NAME_X}[level]
        got = []
        for pageno, words in pages:
            for w in words:
                if not (zone[0] <= w['xMin'] and w['xMax'] < zone[1]):
                    continue
                if not (self.BODY_TOP < w['yMin'] < self.BODY_BOTTOM):
                    continue
                if pageno in total_pos and w['yMin'] >= total_pos[pageno] - 1.2:
                    continue
                if (pageno, w['yMin']) < (page, y - 1.2) or (pageno, w['yMin']) >= (end[0], end[1] - 1.2):
                    continue
                if re.fullmatch(r'[0-9]+', w['text']):
                    continue
                got.append(w)
        return self.joined(got) or None

    def detail(self, pages):
        events = self.events_on(pages)
        total_pos = self.rule('total_row')(pages)
        total_page, total_y = next(iter(total_pos.items()))
        parents, setsu_rows, moku_list = [], [], []
        current = {}
        for event in events:
            page, y, kind = event['page'], event['y'], event['kind']
            words = self.words_of(pages, page)
            if kind == '節':
                if set(current) != {'款', '項', '目'}:
                    raise ValueError(f'Missing printed moku path at page {page}, y {y}')
                end = self.level_end(page, y, events, ('款', '項', '目', '節'))
                name_words = [w for pageno, ws in pages for w in ws
                              if (pageno, w['yMin']) >= (page, y - 1.2)
                              and (pageno, w['yMin']) < (end[0], end[1] - 1.2)
                              and self.SETSU_NAME_ZONE[0] <= w['xMin'] and w['xMax'] < self.SETSU_NAME_ZONE[1]]
                matched = self.SETSU_SPLIT.fullmatch(self.joined(name_words))
                if matched is None:
                    raise ValueError(f"Setsu name at page {page}, y {y} reads {self.joined(name_words)!r}")
                values = {'区分_番号': matched.group(1), '区分_名称': matched.group(2),
                          **self.amount_cells(words, page, y, ['金額', '支出済額', '翌年度繰越額', '不用額'],
                                         [self.SETSU_AMOUNT_EDGE, self.AMOUNT_EDGES[5], self.AMOUNT_EDGES[6], self.AMOUNT_EDGES[7]]),
                          '物理頁': page, '上端': event['word']['yMin'],
                          '下端': max(w['yMax'] for w in name_words),
                          **self.positioned_names(event['word'], name_words)}
                setsu_rows.append((current['目'], values))
                continue
            shared = {e['kind'] for e in events if e is not event and e['page'] == page
                      and abs(e['y'] - y) < 1.2 and e['kind'] in ('款', '項', '目')}
            # A spread that only continues the open 目 reprints its bare 款・項・目
            # numbers on one line, with no name or amount: nothing new is printed.
            if kind in ('款', '項', '目') and shared == {'款', '項', '目'} - {kind}:
                line = {e['kind']: e['word']['text'] for e in events
                        if e['page'] == page and abs(e['y'] - y) < 1.2 and e['kind'] in ('款', '項', '目')}
                if all(current.get(level, {}).get('番号') == number for level, number in line.items()):
                    continue
            if kind == '項' and shared == {'款'}:
                shared = set()
            elif shared:
                if not (kind == '款' and shared == {'項'}):
                    raise ValueError(f'Unmeasured shared heading line at page {page}, y {y}')
            if kind == '款' and shared == {'項'}:
                # A continued spread reprints the bare kan number on the kou row;
                # the printed amounts belong to the kou.
                if event['word']['text'] != current.get('款', {}).get('番号'):
                    raise ValueError(f'Unmeasured shared kan/kou line at page {page}, y {y}')
                record = {'level': kind, '番号': event['word']['text'],
                          **{k: current['款'][k] for k in self.PARENT_AMOUNTS},
                          **{f'{k}_{suffix}': current['款'][f'{k}_{suffix}']
                             for k in self.PARENT_AMOUNTS for suffix in AMOUNT_POSITION_SUFFIXES},
                          '物理頁': page, '上端': event['word']['yMin'], '下端': event['word']['yMax'],
                          **self.positioned_names(event['word'], [])}
                current.pop('項', None)
                current.pop('目', None)
                current[kind] = record
                parents.append(record)
                continue
            record = {'level': kind, '番号': event['word']['text'],
                      **self.amount_cells(words, page, y, self.PARENT_AMOUNTS, self.AMOUNT_EDGES),
                      '物理頁': page, '上端': event['word']['yMin'], '下端': event['word']['yMax'],
                      **self.positioned_names(event['word'], [])}
            if kind == '目':
                record['ref'] = {'款': current['款'], '項': current['項']}
                current['目'] = record
                moku_list.append(record)
            else:
                if kind == '項':
                    record['ref'] = {'款': current['款']}
                old = current.get(kind)
                if old is not None and old['番号'] == record['番号']:
                    for key in self.PARENT_AMOUNTS:
                        if old[key] != record[key]:
                            raise ValueError(f'Reprinted {kind} amounts differ')
                if kind == '款':
                    current.pop('項', None)
                    current.pop('目', None)
                else:
                    current.pop('目', None)
                current[kind] = record
            parents.append(record)
        # Hierarchy spans keep reprinted headings from swallowing names.
        for record in parents:
            kinds = {'款': ('款',), '項': ('款', '項'), '目': ('款', '項', '目')}[record['level']]
            end = self.level_end(record['物理頁'], record['上端'], events, kinds)
            record['名称'] = self.names_in(pages, record['level'], record['物理頁'], record['上端'], end,
                                      total_pos)
        # A continued spread reprints the heading row with identical amounts but
        # without the vertical name. Share the printed name within one identity.
        groups = {}
        for record in parents:
            if record['level'] == '目':
                ref = record['ref']
                key = ('目', ref['款']['番号'], ref['項']['番号'], record['番号'],
                       tuple(record[k] for k in self.PARENT_AMOUNTS))
            elif record['level'] == '項':
                key = ('項', record['ref']['款']['番号'], record['番号'],
                       tuple(record[k] for k in self.PARENT_AMOUNTS))
            else:
                key = ('款', record['番号'], tuple(record[k] for k in self.PARENT_AMOUNTS))
            groups.setdefault(key, []).append(record)
        for members in groups.values():
            names = {m['名称'] for m in members if m['名称']}
            if len(names) > 1:
                raise ValueError('Reprinted parent names differ')
            if names:
                for member in members:
                    member['名称'] = next(iter(names))
        rows = []
        retained = []
        for moku in moku_list:
            end = self.level_end(moku['物理頁'], moku['上端'], events, ('款', '項', '目'))
            limit = end if end[0] == moku['物理頁'] else (moku['物理頁'], self.BODY_BOTTOM + 1)
            children = [(m, v) for m, v in setsu_rows if m is moku]
            if not children:
                children = [(moku, {'区分_番号': None, '区分_名称': None, '金額': None,
                                    '支出済額': None, '翌年度繰越額': None, '不用額': None,
                                    **{f'{k}_{suffix}': None
                                       for k in ('金額', '支出済額', '翌年度繰越額', '不用額')
                                       for suffix in AMOUNT_POSITION_SUFFIXES},
                                    '物理頁': moku['物理頁'], '上端': moku['上端'], '下端': moku['下端'],
                                    '左端': moku.get('左端'), '右端': moku.get('右端')})]
            note = self.note_of(pages, moku['物理頁'], moku['上端'], limit)
            # The note is kept verbatim in 目_備考 and never becomes rows; its
            # prose words (no annotation keyword) are a non-adopted breakdown.
            retained.extend(word for line in remark_prose_lines(
                [[(moku['物理頁'], (w['xMin'], w['yMin'], w['xMax'], w['yMax']), w['text']) for w in line]
                 for line in self.note_lines(pages, moku['物理頁'], moku['上端'], limit)]) for word in line)
            for _, values in children:
                row = {}
                for level in ('款', '項', '目'):
                    parent = moku['ref'][level] if level in moku['ref'] else moku
                    row.update({level + '_' + k: parent.get(k) for k in
                                ['番号', '名称', *self.PARENT_AMOUNTS, '物理頁', '左端', '上端', '右端', '下端',
                                 *(f'{k}_{suffix}' for k in self.PARENT_AMOUNTS for suffix in AMOUNT_POSITION_SUFFIXES)]})
                row['目_備考'] = note
                rows.append({**row, **values})
        rows.sort(key=lambda r: (r['物理頁'], r['上端']))
        total = self.rule('read_total')(pages, total_page, total_y)
        observed = [{k: v for k, v in record.items() if k != 'ref'} for record in parents]
        return rows, observed, total, retained

    def note_lines(self, pages, page, y, limit):
        """Printed lines (words left to right) of the 目's 備考 cell, top to bottom."""
        words = self.words_of(pages, page)
        lines = {}
        for w in words:
            if w['xMin'] < self.NOTE_LEFT:
                continue
            if not (y - 1.2 <= w['yMin'] < limit[1] - 1.2):
                continue
            lines.setdefault(round(w['yMin'], 1), []).append(w)
        return [sorted(lines[key], key=lambda w: w['xMin']) for key in sorted(lines)]

    def note_of(self, pages, page, y, limit):
        textual = [''.join(w['text'] for w in line) for line in self.note_lines(pages, page, y, limit)]
        return '\n'.join(textual) or None

    def metadata(self, rows):
        amounts = [k for k in rows[0]
                   if k in set(self.PARENT_AMOUNTS + ['金額', '支出済額', '翌年度繰越額', '不用額'])
                   or any(k == v or k.endswith('_' + v) for v in self.PARENT_AMOUNTS)]
        contexts = []
        for index, level in enumerate(('款', '項', '目')):
            columns = [k for k in rows[0] if k.startswith(level + '_')
                       and not k.endswith(('物理頁', '左端', '上端', '右端', '下端')) and k != '目_備考']
            contexts.append({'columns': columns, 'header_path': ['科目', level],
                             'grain_columns': [x + '_番号' for x in ('款', '項', '目')[:index + 1]]})
        contexts.append({'columns': ['区分_番号', '区分_名称', '金額', '支出済額', '翌年度繰越額', '不用額'],
                         'header_path': ['節', '区分', '金額'], 'semantic_role': 'setsu',
                         'grain_columns': ['款_番号', '項_番号', '目_番号', '区分_番号']})
        contexts.append({'columns': ['目_備考'], 'header_path': ['備考'],
                         'grain_columns': ['款_番号', '項_番号', '目_番号']})
        note = self.METADATA_NOTE
        return {'units': [{'text': '円', 'scope': {'kind': 'columns', 'columns': amounts}}],
                'notes': [{'text': note, 'scope': {'kind': 'table'}}],
                'column_contexts': contexts}

    def convert(self, inputs, destination, options):
        if len(inputs) != 1:
            raise ValueError('Measured Musashino settlement uses one original')
        source = inputs[0]
        if (source['target']['document_kind'] != 'settlement'
                or source['direction'] != 'expenditure' or source['format'] != 'pdf'
                or source['pdf_type'] != 'text'):
            raise ValueError('This measured layout is Musashino text settlement expenditure only')
        wanted = self.physical_pages(options['detail_pages'])
        selected = [p for scope in source['scope'] if scope['account'] == options['account']
                    for first, last in scope['pages'] for p in range(first, last + 1)]
        if sorted(selected) != sorted(wanted):
            raise ValueError('Configured account pages differ from selected expenditure scope')
        destination = Path(destination)
        table_id = options['table_id']
        prefix = table_id.removesuffix('-expenditure-detail')
        observations = destination / f'musashino-{prefix}-observations'
        observations.mkdir()
        pages = []
        for index, (first, last) in enumerate(options['detail_pages']):
            pages.extend(self.observe(source['path'], first, last,
                                 observations / f'detail-{index}-bbox.xml'))
        rows, parents, total, retained = self.detail(pages)
        if not rows:
            raise ValueError('Configured detail scope has no leaf rows')
        (observations / 'parents.json').write_text(
            json.dumps(parents, ensure_ascii=False, indent=2) + '\n')
        (observations / 'total.json').write_text(
            json.dumps(total, ensure_ascii=False, indent=2) + '\n')
        columns = tuple(ParquetColumn(k, 'BIGINT' if k.endswith('物理頁')
                                      else 'DOUBLE' if k.endswith(('左端', '上端', '右端', '下端')) else 'VARCHAR')
                        for k in rows[0])
        result = write_conversion(destination / (table_id + '.parquet'), rows, columns=columns,
                                  context=ConversionContext(source['sha256'], table_id, __file__))
        write_coverage_words(Path(result.path),
                             [(page, (w['xMin'], w['yMin'], w['xMax'], w['yMax']), w['text'])
                              for page, words in pages for w in words
                              if self.BODY_TOP < w['yMin'] < self.BODY_BOTTOM],
                             amount_columns=self.AMOUNT_COLUMNS,
                             excluded_regions=coverage_regions(retained, kind='経費内訳', reason=self.UCHIWAKE_REASON))
        return {table_id: {'path': Path(result.path), 'metadata': self.metadata(rows)}}
