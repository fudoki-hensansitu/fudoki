import json
import re
import subprocess
import xml.etree.ElementTree as ET
from pathlib import Path
from ingestion.lib.conversion import ConversionContext, write_conversion
from ingestion.lib.node_tables import AMOUNT_POSITION_SUFFIXES, amount_position_fields, null_position_fields, write_coverage_words
from ingestion.lib.parquet import ParquetColumn
from ingestion.generic.reading import Reading


class Reader(Reading):
    REQUIRED_RULES = []

    def __init__(self, profile, workflow):
        super().__init__(profile, workflow)
        self.BUDGET = profile['budget']
        self.EXECUTED = profile['executed']
        self.HEADER_TOP = profile['header_top']
        self.ROW_TOL = profile['row_tol']
        self.NAME_GAP = profile['name_gap']
        self.PATH_RIGHT = profile['path_right']
        self.BUDGET_BANDS = [tuple(value) for value in profile['budget_bands']]
        self.SETSU_LEFT = profile['setsu_left']
        self.SETSU_RIGHT = profile['setsu_right']
        self.SETSU_MARK_RIGHT = profile['setsu_mark_right']
        self.SETSU_NAME_LEFT = profile['setsu_name_left']
        self.SETSU_AMOUNT_BANDS = [tuple(value) for value in profile['setsu_amount_bands']]
        self.SUBJECT_EXEC_BANDS = [tuple(value) for value in profile['subject_exec_bands']]
        self.AMOUNT_COLUMNS = ([{'header': key, 'x_range': list(edges)}
                           for key, edges in zip(self.BUDGET, self.BUDGET_BANDS)] +
                          [{'header': key, 'x_range': list(edges)}
                           for key, edges in zip(self.EXECUTED, self.SUBJECT_EXEC_BANDS)] +
                          [{'header': key, 'x_range': list(edges)}
                           for key, edges in zip(['金額', *self.EXECUTED], self.SETSU_AMOUNT_BANDS)])
        self.NOTE_LEFT = profile['note_left']
        self.PROJECT_MARK_RIGHT = profile['project_mark_right']
        self.NOTE_SETSU_MARK_RIGHT = profile['note_setsu_mark_right']
        self.NOTE_AMOUNT_MIN_RIGHT = profile['note_amount_min_right']
        self.FRAG = re.compile(r'^[△0-9,]+$')
        self.PAREN_AMOUNT = re.compile(r'^\([0-9,]+\)$')
        self.PATH_TOKEN = re.compile(r'^([0-9]+)(.*)$')
        self.SETSU_MARK = re.compile(r'^([0-9]+)(.*)$')
        self.SUB_GROUP = re.compile(r'^([0-9]+)\)$')
        self.FOOTER_KOU = re.compile(r'\(款\)\s*([0-9]+)')
        self.FOOTER_KO = re.compile(r'\(項\)\s*([0-9]+)')
        self.AMOUNT_CHAR = re.compile(r'^[△0-9,()]+$')
        self.COLUMNS = (
            [f'款_{k}' for k in ['番号', '名称', *self.BUDGET, *self.EXECUTED, '物理頁', '左端', '上端', '右端', '下端',
                                *[f'{c}_{s}' for c in (*self.BUDGET, *self.EXECUTED) for s in AMOUNT_POSITION_SUFFIXES]]] +
            [f'項_{k}' for k in ['番号', '名称', *self.BUDGET, *self.EXECUTED, '物理頁', '左端', '上端', '右端', '下端',
                                *[f'{c}_{s}' for c in (*self.BUDGET, *self.EXECUTED) for s in AMOUNT_POSITION_SUFFIXES]]] +
            [f'目_{k}' for k in ['番号', '名称', *self.BUDGET, *self.EXECUTED, '備考', '物理頁', '左端', '上端', '右端', '下端',
                                *[f'{c}_{s}' for c in (*self.BUDGET, *self.EXECUTED) for s in AMOUNT_POSITION_SUFFIXES]]] +
            ['事業_番号', '事業_名称', '事業_金額', '事業_物理頁', '事業_左端', '事業_上端', '事業_右端', '事業_下端',
             *[f'事業_金額_{s}' for s in AMOUNT_POSITION_SUFFIXES],
             '事業群_番号', '事業群_名称', '事業群_金額', '事業群_物理頁', '事業群_左端', '事業群_上端', '事業群_右端', '事業群_下端',
             *[f'事業群_金額_{s}' for s in AMOUNT_POSITION_SUFFIXES],
             '備考節_番号', '備考節_名称', '備考節_金額', '備考節_物理頁', '備考節_左端', '備考節_上端', '備考節_右端', '備考節_下端',
             *[f'備考節_金額_{s}' for s in AMOUNT_POSITION_SUFFIXES],
             '細目_名称', '細目_金額', '細目_物理頁', '細目_左端', '細目_上端', '細目_右端', '細目_下端',
             *[f'細目_金額_{s}' for s in AMOUNT_POSITION_SUFFIXES],
             '葉_物理頁', '葉_上端', '葉_下端']
        )
        self.COLUMNS += ([f'節_{k}' for k in ('番号', '名称', '金額', *self.EXECUTED, '物理頁', '左端', '上端', '右端', '下端')]
                    + [f'節_{k}_{s}' for k in ('金額', *self.EXECUTED) for s in AMOUNT_POSITION_SUFFIXES])


    def observe(self, pdf, first, last, path):
        subprocess.run(['pdftotext', '-f', str(first), '-l', str(last), '-bbox-layout',
                        str(pdf), str(path)], check=True)
        pages = []
        for number, page in enumerate(ET.parse(str(path)).findall('.//{*}page'), first):
            width, height = float(page.get('width')), float(page.get('height'))
            words = [dict(text=w.text or '', **{k: float(v) for k, v in w.attrib.items()},
                          _id=f'{number}:{i}')
                     for i, w in enumerate(page.findall('.//{*}word'))]
            if (abs(width - 842.0) > 1 and abs(width - 1191.0) > 1) or \
               (abs(height - 842.0) > 1 and abs(height - 1191.0) > 1):
                raise ValueError(f'Unmeasured page dimensions at {number}: {width}x{height}')
            for w in words:
                if w['xMax'] > 1192.5 or w['yMax'] > 843.5:
                    raise ValueError(f'Word outside the measured A3 landscape space at {number}: {w}')
            pages.append((number, words))
        if [p for p, _ in pages] != list(range(first, last + 1)):
            raise ValueError('Incomplete Poppler page range')
        return pages

    def boxes(self, words):
        return [[w['xMin'], w['yMin'], w['xMax'], w['yMax']] for w in words]

    def positioned_amounts(self, keys, texts, owners, page):
        """Amount texts with their own printed positions, keyed per amount column.

        Every key is emitted so rows stay homogeneous; absent amounts keep NULL
        positions and create no amount row. A printed amount without its words
        is a converter bug, never a silent NULL.
        """
        record = {}
        for key in keys:
            value = texts.get(key)
            words = owners.get(key, [])
            record[key] = value
            if value is not None:
                if not words:
                    raise ValueError(f'Printed amount without word boxes: {key}')
                record.update(amount_position_fields(key, page, self.boxes(words)))
            else:
                record.update(null_position_fields(key))
        return record

    def node_x(self, words):
        """Name-zone horizontal extent for a node box (amount columns excluded)."""
        words = list(words)
        return {'左端': min(w['xMin'] for w in words), '右端': max(w['xMax'] for w in words)}

    def bands(self, words):
        rows = []
        for word in sorted(words, key=lambda w: (w['yMin'], w['xMin'])):
            if not rows or abs(word['yMin'] - rows[-1][0]['yMin']) > self.ROW_TOL:
                rows.append([])
            rows[-1].append(word)
        return [sorted(row, key=lambda w: w['xMin']) for row in rows]

    def join_text(self, words):
        """Join one line's words: no separator for touching glyphs, blank for gaps."""
        parts, previous = [], None
        for word in words:
            if previous is not None and word['xMin'] - previous['xMax'] > self.NAME_GAP:
                parts.append(' ')
            parts.append(word['text'])
            previous = word
        return ''.join(parts)

    def norm(self, name):
        return (name or '').replace(' ', '').replace('\n', '')

    def cell_amount(self, words, left, right, page, y, what, right_limit=None):
        frags = [w for w in words if left <= w['xMin'] < right and self.FRAG.fullmatch(w['text'])]
        limit = right_limit if right_limit is not None else right
        others = [w for w in words if left <= w['xMin'] < limit and (w['text'] or '').strip()
                  and not self.FRAG.fullmatch(w['text'])]
        if others:
            raise ValueError(f'Non-amount print inside {what} at page {page}, y={y}: '
                             + self.join_text(others))
        if not frags:
            raise ValueError(f'Missing {what} at page {page}, y={y}')
        ordered = sorted(frags, key=lambda w: w['xMin'])
        for first, second in zip(ordered, ordered[1:]):
            if first['xMax'] > second['xMin'] + 0.01 and first['_id'] != second['_id']:
                raise ValueError(f'Overlapping printed amounts at page {page}, y={y}')
        return ''.join(w['text'] for w in ordered), ordered

    def path_tokens(self, row):
        """Subject tokens of one band keyed by level.

        A digit-leading word with xMin < 45 opens the 款/項/目 group its x
        indicates; spaced name glyphs drifting into a neighboring x zone stay
        with the open group. Amount fragments (x >= 135) end the path zone.
        """
        tokens, current, seen = {}, None, set()
        for word in sorted([w for w in row if w['xMin'] < self.PATH_RIGHT], key=lambda w: w['xMin']):
            if word['xMin'] >= 135 and self.FRAG.fullmatch(word['text']):
                break
            if word['xMin'] < 45 and re.match(r'[0-9]', word['text'] or ''):
                level = '款' if word['xMin'] < 20 else '項' if word['xMin'] < 30 else '目'
                if level in seen:
                    raise ValueError(f'Repeated {level} marker in one band')
                seen.add(level)
                current = tokens.setdefault(level, [])
                current.append(word)
            elif current is None:
                raise ValueError(f'Path name before any number: {word["text"]!r}')
            else:
                current.append(word)
        for level, words in tokens.items():
            merged = ''.join(w['text'] for w in words)
            if not self.PATH_TOKEN.match(merged):
                raise ValueError(f'Unnumbered printed path at {level}: {merged!r}')
        return tokens

    def path_name(self, token_words):
        merged = ''.join(w['text'] for w in token_words)
        match = self.PATH_TOKEN.match(merged)
        number = match[1]
        skip, name_words = len(number), []
        for word in token_words:
            if skip >= len(word['text']):
                skip -= len(word['text'])
                continue
            head = dict(word)
            head['text'] = word['text'][skip:]
            name_words.append(head)
            skip = 0
            for following in token_words[token_words.index(word) + 1:]:
                name_words.append(following)
            break
        return number, self.join_text(name_words) if name_words else None

    def subject_amounts(self, row, page, y, level):
        if any(self.PATH_RIGHT <= w['xMin'] < self.SETSU_LEFT and (w['text'] or '').strip()
               and not self.FRAG.fullmatch(w['text']) for w in row):
            raise ValueError(f'Unexpected print between subject name and budget '
                             f'at page {page}, y={y}')
        record = {}
        for (left, right), key in zip(self.BUDGET_BANDS, self.BUDGET):
            value, found = self.cell_amount(row, left, right, page, y, f'{level}{key}', right_limit=455.0)
            record[key] = value
            record.update(amount_position_fields(key, page, self.boxes(found)))
        for (left, right), key in zip(self.SUBJECT_EXEC_BANDS, self.EXECUTED):
            value, found = self.cell_amount(row, left, right, page, y, f'{level}{key}')
            record[key] = value
            record.update(amount_position_fields(key, page, self.boxes(found)))
        return record

    def subject_record(self, tokens, row, page, y):
        levels = [level for level in ('款', '項', '目') if level in tokens]
        if len(levels) != 1:
            raise ValueError(f'Mixed subject levels at page {page}, y={y}')
        level = levels[0]
        number, name = self.path_name(tokens[level])
        return {'level': level, '番号': number, '名称': name,
                **self.subject_amounts(row, page, y, level),
                '上端': y, '下端': max(w['yMax'] for w in row),
                **self.node_x(tokens[level])}

    def setsu_row(self, row, page, y):
        """A 法定節 row, or None when the band carries no 節 marker."""
        markers = sorted([w for w in row if self.SETSU_LEFT <= w['xMin'] < self.SETSU_MARK_RIGHT
                          and re.match(r'[0-9]', w['text'] or '')],
                         key=lambda w: w['xMin'])
        if not markers:
            return None
        merged = ''.join(w['text'] for w in markers)
        match = self.SETSU_MARK.match(merged)
        if not match:
            raise ValueError(f'Unnumbered section print at page {page}, y={y}: {merged!r}')
        name = self.join_text([w for w in row if self.SETSU_MARK_RIGHT <= w['xMin'] < self.SETSU_RIGHT
                          and not self.FRAG.fullmatch(w['text'] or '')])
        if match[2]:
            name = match[2] + (' ' + name if name else '')
        amounts = [self.cell_amount(row, left, right, page, y, f'節{key}')
                   for (left, right), key in zip(self.SETSU_AMOUNT_BANDS, ['金額'] + self.EXECUTED)]
        return {'区分_番号': match[1], '区分_名称': name or None,
                **dict(zip(['金額'] + self.EXECUTED, amounts)),
                '上端': y, '下端': max(w['yMax'] for w in row if w['xMin'] < self.SETSU_RIGHT)}

    def note_parts(self, row, page, y):
        """Split a band's 備考 zone into (non-amount words, joined amount).

        The amount is the rightmost cluster of amount-charset words (split
        parens like `( 836,078)` rejoin here); `(N)` subgroup markers stay
        left of any name and never form the rightmost cluster.
        """
        words = sorted([w for w in row if w['xMin'] >= self.NOTE_LEFT], key=lambda w: w['xMin'])
        charset = [w for w in words if self.AMOUNT_CHAR.fullmatch(w['text'])]
        clusters, current = [], []
        for word in charset:
            if current and word['xMin'] - current[-1]['xMax'] > 40:
                clusters.append(current)
                current = []
            current.append(word)
        if current:
            clusters.append(current)
        amount, rest, merged = None, list(words), []
        amount_words = []
        while clusters and amount is None:
            merged = clusters.pop() + merged
            joined = ''.join(w['text'] for w in merged)
            if self.FRAG.fullmatch(joined) or self.PAREN_AMOUNT.fullmatch(joined):
                if max(w['xMax'] for w in merged) < self.NOTE_AMOUNT_MIN_RIGHT:
                    raise ValueError(f'Remark amount outside the amount column '
                                     f'at page {page}, y={y}: ' + self.join_text(row))
                amount = joined
                amount_words = list(merged)
                rest = [w for w in words if w not in merged]
            elif not clusters:
                raise ValueError(f'Multiple remark amounts at page {page}, y={y}: ' + self.join_text(row))
        return rest, amount, amount_words

    def parse_note_band(self, row, page, y, state, setsu_names):
        """Classify one band's 備考 zone; mutate the 目 state; return events."""
        rest, amount, amount_words = self.note_parts(row, page, y)
        if not rest and amount is None:
            return []
        if not rest:
            raise ValueError(f'Amount-only remarks band at page {page}, y={y}')
        positions = self.positioned_amounts(['金額'], {'金額': amount}, {'金額': amount_words}, page)
        if rest and rest[0]['text'] == '(':
            marker = [w for w in rest if w['xMin'] < 885 and self.SUB_GROUP.fullmatch(w['text'])]
            if len(marker) != 1 or amount is None or not self.PAREN_AMOUNT.fullmatch(amount):
                raise ValueError(f'Malformed subgroup row at page {page}, y={y}: ' + self.join_text(row))
            end = max(w['xMax'] for w in rest if w['xMin'] < 885)
            name = self.join_text([w for w in rest if w['xMin'] >= end - 1]) or None
            state['group'] = {'番号': self.SUB_GROUP.fullmatch(marker[0]['text'])[1],
                              '名称': name or self.join_text(rest), '金額': amount,
                              '物理頁': page, '上端': y, '下端': max(w['yMax'] for w in row),
                              **self.node_x(rest), **positions}
            state['setsu'] = None
            state['last'] = state['group']
            return [('group', state['group'])]
        marker, after = [], list(rest)
        while after and re.fullmatch(r'[0-9]+', after[0]['text']):
            marker.append(after.pop(0))
        number = ''.join(w['text'] for w in marker) or None
        end = max((w['xMax'] for w in marker), default=None)
        if number is not None and marker[0]['xMin'] < self.PROJECT_MARK_RIGHT:
            name = self.join_text([w for w in after if w['xMin'] >= end - 1]) or None
            if name is None:
                raise ValueError(f'Project row without a name at page {page}, y={y}: '
                                 + self.join_text(row))
            if amount is None or self.PAREN_AMOUNT.fullmatch(amount):
                raise ValueError(f'Project row without execution amount at page {page}, y={y}')
            state['project'] = {'番号': number, '名称': name, '金額': amount,
                                '物理頁': page, '上端': y, '下端': max(w['yMax'] for w in row),
                                **self.node_x(rest), **positions,
                                'sections': [], 'details': []}
            state['group'] = None
            state['setsu'] = None
            state['last'] = state['project']
            return [('project', state['project'])]
        if number is not None and marker[0]['xMin'] < self.NOTE_SETSU_MARK_RIGHT:
            name = self.join_text([w for w in after if w['xMin'] >= end - 1]) or None
            if name is None or amount is None or self.PAREN_AMOUNT.fullmatch(amount):
                raise ValueError(f'Malformed note section row at page {page}, y={y}')
            if self.norm(name) not in setsu_names:
                raise ValueError(f'Note section outside the printed 法定節 list '
                                 f'at page {page}, y={y}: {name}')
            if state['project'] is None:
                raise ValueError(f'Note section without a project at page {page}, y={y}')
            state['setsu'] = {'番号': number, '名称': name, '金額': amount,
                              '物理頁': page, '上端': y, '下端': max(w['yMax'] for w in row),
                              **self.node_x(rest), **positions, 'details': []}
            state['project']['sections'].append(state['setsu'])
            state['last'] = state['setsu']
            return [('setsu', state['setsu'])]
        if state['project'] is None:
            raise ValueError(f'Remarks print outside any project at page {page}, y={y}: '
                             + self.join_text(row))
        name = self.join_text(rest) or None
        if amount is None:
            if state['last'] is None:
                raise ValueError(f'Amount-less remarks opener at page {page}, y={y}')
            state['last']['名称'] = (state['last']['名称'] or '') + '\n' + (name or '')
            state['last']['下端'] = max(state['last']['下端'], max(w['yMax'] for w in row))
            if rest:
                state['last']['左端'] = min(state['last']['左端'], min(w['xMin'] for w in rest))
                state['last']['右端'] = max(state['last']['右端'], max(w['xMax'] for w in rest))
            return [('continued', state['last'])]
        if state['setsu'] is None:
            raise ValueError(f'Detail print outside any note section at page {page}, y={y}: '
                             + self.join_text(row))
        detail = {'名称': name, '金額': amount,
                  '物理頁': page, '上端': y, '下端': max(w['yMax'] for w in row),
                  **self.node_x(rest), **positions}
        state['setsu']['details'].append(detail)
        state['last'] = detail
        return [('detail', detail)]

    def flatten(self, context, project, group, setsu, detail, memo, page, y, bottom):
        row = {}
        for level in ('款', '項', '目'):
            record = context[level]
            for key in ['番号', '名称', *self.BUDGET, *self.EXECUTED]:
                row[f'{level}_{key}'] = record[key]
            row[f'{level}_物理頁'] = record['page']
            for key in ['左端', '上端', '右端', '下端']:
                row[f'{level}_{key}'] = record[key]
            for key in (*self.BUDGET, *self.EXECUTED):
                for suffix in AMOUNT_POSITION_SUFFIXES:
                    row[f'{level}_{key}_{suffix}'] = record[f'{key}_{suffix}']
        row['目_備考'] = memo
        for prefix, item, keys in (('事業_', project, ('番号', '名称', '金額')),
                                   ('事業群_', group, ('番号', '名称', '金額')),
                                   ('備考節_', setsu, ('番号', '名称', '金額')),
                                   ('細目_', detail, ('名称', '金額'))):
            for key in keys:
                row[prefix + key] = item[key] if item else None
            for key in ('物理頁', '左端', '上端', '右端', '下端'):
                row[prefix + key] = item[key] if item else None
            for suffix in AMOUNT_POSITION_SUFFIXES:
                row[f'{prefix}金額_{suffix}'] = item[f'金額_{suffix}'] if item else None
        row['葉_物理頁'], row['葉_上端'], row['葉_下端'] = page, y, bottom
        return row

    def convert(self, inputs, destination, options):
        if len(inputs) != 1:
            raise ValueError('Hino settlement expenditure requires one original')
        source = inputs[0]
        if (source['target']['document_kind'] != 'settlement'
                or source['direction'] != 'expenditure' or source['format'] != 'pdf'
                or source['pdf_type'] != 'text'):
            raise ValueError('This measured layout is Hino text settlement expenditure only')
        account = options['account']
        selected = [p for scope in source['scope'] if scope.get('account', account) == account
                    for first, last in scope['pages'] for p in range(first, last + 1)]
        if not selected or sorted(selected) != list(range(selected[0], selected[-1] + 1)):
            raise ValueError(f'Measured scope for {account} must be one contiguous page range')
        first, last = selected[0], selected[-1]
        destination = Path(destination)
        observations = destination / 'observations'
        observations.mkdir(parents=True, exist_ok=True)
        pages = self.observe(source['path'], first, last, observations / 'bbox.xml')

        def setsu_band_kind(row):
            if any(self.SETSU_LEFT <= w['xMin'] < self.SETSU_MARK_RIGHT
                   and re.match(r'[0-9]', w['text'] or '') for w in row):
                return 'marker'
            if any(self.SETSU_NAME_LEFT <= w['xMin'] < self.SETSU_RIGHT and (w['text'] or '').strip()
                   and not self.FRAG.fullmatch(w['text']) for w in row):
                return 'continuation'
            return None

        setsu_names, assembled = set(), []
        for page, words in pages:
            for row in self.bands([w for w in words if w['yMin'] >= self.HEADER_TOP]):
                if '(款)' in self.join_text(row) or '(項)' in self.join_text(row):
                    continue
                kind = setsu_band_kind(row)
                if kind == 'marker':
                    record = self.setsu_row(row, page, row[0]['yMin'])
                    record['page'] = page
                    assembled.append(record)
                elif kind == 'continuation':
                    if not assembled or assembled[-1]['page'] != page:
                        raise ValueError('Section continuation without an open section '
                                         f'at page {page}, y={row[0]["yMin"]}')
                    name_words = [w for w in row
                                  if self.SETSU_NAME_LEFT <= w['xMin'] < self.SETSU_RIGHT]
                    assembled[-1]['区分_名称'] += '\n' + self.join_text(name_words)
                    assembled[-1]['下端'] = max(assembled[-1]['下端'],
                                                max(w['yMax'] for w in name_words))
        for record in assembled:
            if record['区分_名称']:
                setsu_names.add(self.norm(record['区分_名称']))
        if not setsu_names:
            raise ValueError('No printed 法定節 list observed')

        leaves, setsu_list, totals, footers = [], [], [], []
        statutory_rows = []
        context, current_moku = {}, None
        state = {'project': None, 'group': None, 'setsu': None, 'last': None}
        consumed = set()

        def close_moku():
            if current_moku is None:
                return
            sections = [s for p in current_moku['projects'] for s in p['sections']]
            if not sections:
                if not current_moku['projects']:
                    raise ValueError('目 without remarks hierarchy cannot set grain implicitly: '
                                     + str(current_moku['record']))
                parts = []
                for project in current_moku['projects']:
                    if project['sections']:
                        raise ValueError('Project mixes bare and sectioned remarks')
                    parts.append(f"{project['番号']} {project['名称']} {project['金額']}")
                record = current_moku['record']
                for project in current_moku['projects']:
                    leaves.append(self.flatten(context, project, None, None, None, '\n'.join(parts),
                                          project['物理頁'], project['上端'], project['下端']))
                return
            for project in current_moku['projects']:
                if not project['sections']:
                    raise ValueError('Project without note sections beside sectioned siblings')
                for section in project['sections']:
                    if not section['details']:
                        raise ValueError('Note section without details: ' + str(section))

        for page, words in pages:
            header = [w for w in words if w['yMin'] < self.HEADER_TOP]
            if '単位：円' not in self.norm(self.join_text(header)):
                raise ValueError(f'Missing unit header at page {page}')
            for row in self.bands([w for w in words if w['yMin'] >= self.HEADER_TOP]):
                y = row[0]['yMin']
                for w in row:
                    consumed.add(w['_id'])
                texts = self.join_text(row)
                if '(款)' in texts or '(項)' in texts:
                    kou = self.FOOTER_KOU.search(texts)
                    ko = self.FOOTER_KO.search(texts)
                    if kou and context.get('款', {}).get('番号') != kou[1]:
                        raise ValueError(f'Footer 款 mismatch at page {page}, y={y}: {texts!r}')
                    if ko and context.get('項', {}).get('番号') != ko[1]:
                        raise ValueError(f'Footer 項 mismatch at page {page}, y={y}: {texts!r}')
                    if not kou and not ko:
                        raise ValueError(f'Unparsed footer at page {page}, y={y}')
                    footers.append({'page': page, 'text': texts})
                    continue
                path_head = self.join_text([w for w in row if w['xMin'] < self.PATH_RIGHT])
                if self.norm(path_head) == '歳出合計':
                    close_moku()
                    current_moku = None
                    record = {'level': '合計', '番号': None, '名称': '歳出合計',
                              **self.subject_amounts(row, page, y, '合計'),
                              '上端': y, '下端': max(w['yMax'] for w in row)}
                    totals.append({**record, 'page': page})
                    continue
                tokens = self.path_tokens(row)
                kind = setsu_band_kind(row)
                if kind == 'marker':
                    record = self.setsu_row(row, page, y)
                    if set(context) != {'款', '項', '目'}:
                        raise ValueError(f'Section row outside 目 context at page {page}, y={y}')
                    record['page'] = page
                    record['path'] = tuple(context[level]['番号'] for level in ('款', '項', '目'))
                    setsu_list.append(record)
                    adopted = self.flatten(context, None, None, None, None, None, page, y, record['下端'])
                    adopted.update({'節_番号': record['区分_番号'], '節_名称': record['区分_名称'],
                                    '節_物理頁': page, '節_上端': y, '節_下端': record['下端'],
                                    **{'節_' + k: v for k, v in self.node_x(
                                        [w for w in row if self.SETSU_LEFT <= w['xMin'] < self.SETSU_MARK_RIGHT
                                         or self.SETSU_MARK_RIGHT <= w['xMin'] < self.SETSU_RIGHT and not self.FRAG.fullmatch(w['text'])]).items()}})
                    for key in ('金額', *self.EXECUTED):
                        text, found = record[key]
                        adopted['節_' + key] = text
                        adopted.update(amount_position_fields('節_' + key, page, self.boxes(found)))
                    statutory_rows.append(adopted)
                elif kind == 'continuation':
                    name_words = [w for w in row
                                  if self.SETSU_NAME_LEFT <= w['xMin'] < self.SETSU_RIGHT]
                    if not setsu_list or setsu_list[-1]['page'] != page:
                        raise ValueError('Section continuation without an open section '
                                         f'at page {page}, y={y}')
                    setsu_list[-1]['区分_名称'] += '\n' + self.join_text(name_words)
                    statutory_rows[-1]['節_名称'] = setsu_list[-1]['区分_名称']
                    statutory_rows[-1]['節_下端'] = max(statutory_rows[-1]['節_下端'], max(w['yMax'] for w in name_words))
                    setsu_list[-1]['下端'] = max(setsu_list[-1]['下端'],
                                                max(w['yMax'] for w in name_words))
                if tokens:
                    kinds = [level for level in ('款', '項', '目') if level in tokens]
                    budgeted = any(135.0 <= w['xMin'] < 455.0 and self.FRAG.fullmatch(w['text'])
                                   for w in row)
                    if not budgeted:
                        expected = tuple(context[ancestor]['番号']
                                         for ancestor in ('款', '項', '目') if ancestor in context)
                        got = []
                        for ancestor in ('款', '項', '目'):
                            if ancestor in tokens:
                                number, _ = self.path_name(tokens[ancestor])
                                got.append(number)
                        if tuple(got) != expected[:len(got)] or len(got) != 3:
                            raise ValueError('Continuation label outside current 目 '
                                             f'at page {page}, y={y}')
                    else:
                        if len(kinds) != 1:
                            raise ValueError(f'Mixed subject levels at page {page}, y={y}')
                        level = kinds[0]
                        close_moku()
                        record = self.subject_record(tokens, row, page, y)
                        if record['level'] == '款':
                            context = {}
                        elif record['level'] == '項':
                            context.pop('目', None)
                        if record['level'] == '目':
                            current_moku = {'record': record, 'projects': []}
                        else:
                            current_moku = None
                        record['page'] = page
                        context[record['level']] = record
                        state.update(project=None, group=None, setsu=None, last=None)
                if any(w['xMin'] >= self.NOTE_LEFT for w in row):
                    if current_moku is None:
                        raise ValueError(f'Remarks print outside any 目 at page {page}, y={y}')
                    for kind, item in self.parse_note_band(row, page, y, state, setsu_names):
                        if kind == 'project':
                            current_moku['projects'].append(item)
                        elif kind == 'detail':
                            leaves.append(self.flatten(context, state['project'], state['group'],
                                                  state['setsu'], item,
                                                  None, page, item['上端'], item['下端']))
        close_moku()
        if len(totals) != 1:
            raise ValueError(f'Expected one printed expenditure total, got {len(totals)}')
        body_ids = {w['_id'] for _, words in pages for w in words if w['yMin'] >= self.HEADER_TOP}
        if body_ids - consumed:
            raise ValueError('Unassigned body print exists')
        if not leaves:
            raise ValueError('No detail leaves assembled')

        leaves.extend(statutory_rows)
        table_id = options['table_id']
        columns = tuple(ParquetColumn(k, 'BIGINT' if k.endswith('物理頁') else 'DOUBLE'
                                      if k.endswith(('左端', '上端', '右端', '下端')) else 'VARCHAR')
                        for k in self.COLUMNS)
        for leaf in leaves:
            for key in self.COLUMNS:
                leaf.setdefault(key, None)
            extra = set(leaf) - set(self.COLUMNS)
            if extra:
                raise ValueError(f'Undeclared columns: {sorted(extra)}')
        output = write_conversion(destination / (table_id + '.parquet'), leaves, columns=columns,
                                  context=ConversionContext(source['sha256'], table_id, __file__))
        write_coverage_words(Path(output.path),
                             [(page, (w['xMin'], w['yMin'], w['xMax'], w['yMax']), w['text'])
                              for page, words in pages for w in words if w['yMin'] >= self.HEADER_TOP],
                             amount_columns=self.AMOUNT_COLUMNS)
        (observations / 'setsu-list.json').write_text(
            json.dumps(setsu_list, ensure_ascii=False, indent=2) + '\n')
        (observations / 'expenditure-total.json').write_text(
            json.dumps(totals, ensure_ascii=False, indent=2) + '\n')
        (observations / 'footer-context.json').write_text(
            json.dumps(footers, ensure_ascii=False, indent=2) + '\n')
        return {table_id: {'path': Path(output.path), 'metadata': self.metadata(self.COLUMNS, account)}}

    def metadata(self, columns, account):
        amounts = [c for c in columns
                   if c.split('_', 1)[1] in self.BUDGET + self.EXECUTED + ['金額'] or c.endswith('_金額')]
        contexts = []
        for level in ('款', '項', '目'):
            contexts.append({'columns': [c for c in columns if c.startswith(level + '_')],
                             'header_path': ['科目', level],
                             'grain_columns': [level + '_番号', level + '_物理頁', level + '_上端']})
        contexts.append({'columns': [c for c in columns if c.startswith('節_')],
                         'header_path': ['節'], 'semantic_role': 'setsu',
                         'grain_columns': ['目_番号', '目_物理頁', '目_上端', '節_番号']})
        contexts.append({'columns': ['事業_番号', '事業_名称', '事業_金額'],
                         'header_path': ['説明', '事業'],
                         'grain_columns': ['目_番号', '目_物理頁', '目_上端', '事業_番号']})
        contexts.append({'columns': ['事業群_番号', '事業群_名称', '事業群_金額'],
                         'header_path': ['説明', '事業群'],
                         'grain_columns': ['目_番号', '目_物理頁', '目_上端', '事業_番号', '事業群_番号']})
        contexts.append({'columns': ['備考節_番号', '備考節_名称', '備考節_金額'],
                         'header_path': ['説明', '節'],
                         'grain_columns': ['目_番号', '目_物理頁', '目_上端', '事業_番号', '備考節_番号']})
        contexts.append({'columns': ['細目_名称', '細目_金額', '葉_物理頁', '葉_上端', '葉_下端'],
                         'header_path': ['説明', '細目'],
                         'grain_columns': ['葉_物理頁', '葉_上端']})
        note = ('日野市決算歳出事項別明細書（A3横単票）の備考細目を行とする。'
                '名称は単語間隔が2pt超の箇所を空白、欄内折返しを改行で保持する（印字のまま）。'
                '款・項・目の予算5列・執行3列・印字位置を反復し、事業・事業群・備考節を展開する。'
                '金額は印字原文（△・桁区切り・括弧のまま）。事業_名称は担当課の括弧書きを含む原文。'
                '予備費目は目の粒度とし、備考の bare 事業文を目_備考へ保持する（0069承認・0047先例）。'
                '同一印字行帯の科目・節・備考はx帯で独立に解釈し、高さの一致を対応の根拠にしない。'
                '法定節一覧は説明と独立した節の軸として保持し、歳出合計はlocal観測に留める。'
                'p2は款1項2目1の備考溢れ頁で、前頁の文脈を継承する。'
                '頁頭の「後期 (単位：円)」は単位の根拠、会計の同定は上流scopeによる。'
                f'対象会計は{account}。')
        return {'units': [{'text': '円', 'scope': {'kind': 'columns', 'columns': amounts}}],
                'notes': [{'text': note, 'scope': {'kind': 'table'}}],
                'column_contexts': contexts}
