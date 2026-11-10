"""款ごとの決算年度比較表（監査委員の審査意見書）を読む。

左右の見開きの頁に、款ごとの金額を今年度と前年度の2列ずつ印字する表。左頁は款の番号・名称と予算現額・
構成割合・増減率・支出済額、右頁は割合・不用額などを、同じ行の高さに印字する。欄は見出しの下の年度の
行（`６ ５ ６ ５ …`）で分かれ、その並びを宣言（profile の `left_columns`・`right_columns`）で欄の意味に
対応させる。割合の欄は取り込まず、網羅の検査からは数量表として除く。金額の欄で括弧書きの数字
（`(60,758,000)`）は、表の注記（`※（ ）内は翌年度繰越額で外数`）のとおり別の欄（profile の
`bracketed`）の金額にする。

一つの頁に歳入と歳出の表を上下に並べる資料もあるので、表は支出の見出し（profile の `frame_heading`）の
下の年度の行で探す。行は左頁の款の番号と、最初の金額の欄で決める。合計の行は款にせず、網羅の検査が款の和と
突き合わせる印字として残す（右頁の合計は総括として除く）。
"""
from __future__ import annotations

import json
from pathlib import Path
import re
import subprocess
import xml.etree.ElementTree as ET

from ingestion.fiscal.manifest import sha_file
from ingestion.generic.reading import Reading
from ingestion.lib.conversion import ConversionContext, write_conversion
from ingestion.lib.node_tables import amount_position_fields, null_position_fields, write_coverage_words
from ingestion.lib.parquet import ParquetColumn

AMOUNT = re.compile(r'[△▲]?(?:0|[1-9][0-9]{0,2}(?:,[0-9]{3})*)')
BRACKETED = re.compile(r'[(（]((?:0|[1-9][0-9]{0,2}(?:,[0-9]{3})*))[)）]')
CODE = re.compile(r'([0-9]+)(.*)')
YEAR_DIGIT = re.compile(r'[0-9０-９]{1,2}')
TOTAL = '合計'
LINE = 2.0  # points: words of one printed line
RATIO = 'ratio'
# How far right of the last year digit's centre a number set right in the last column may end (half a column of
# this table's widest amounts, about 40pt, with room to spare); a digit further right is outside the table.
LAST_COLUMN_OVERHANG = 80.0


class Reader(Reading):
    REQUIRED_RULES = []

    def __init__(self, profile, workflow):
        super().__init__(profile, workflow)
        self.LEFT = list(profile['left_columns'])
        self.RIGHT = list(profile['right_columns'])
        self.BRACKETED = dict(profile['bracketed'])
        self.FRAME_HEADING = profile['frame_heading']
        self.NOTE = profile['note']
        self.BALANCES = dict(profile.get('balances', {}))
        headings = [c for c in self.LEFT + self.RIGHT if c != RATIO]
        if len(set(headings)) != len(headings) or set(self.BRACKETED) - set(headings):
            raise ValueError('Compared-year columns must name each amount heading once')
        if not self.LEFT or self.LEFT[0] == RATIO:
            raise ValueError('The first left column must be an amount: it decides the rows')

    # -- observation ---------------------------------------------------------------------------------------

    def observe(self, pdf: Path, pages: list[int], path: Path) -> dict[int, list[dict]]:
        subprocess.run(['pdftotext', '-f', str(pages[0]), '-l', str(pages[-1]), '-bbox', str(pdf), str(path)], check=True)
        found = {}
        for number, page in enumerate(ET.parse(path).findall('.//{*}page'), pages[0]):
            found[number] = [{'text': w.text or '', 'page': number, **{k: float(v) for k, v in w.attrib.items()}}
                             for w in page.findall('.//{*}word') if (w.text or '').strip()]
        if sorted(found) != pages:
            raise ValueError('Incomplete Poppler page range')
        return found

    @staticmethod
    def lines(words: list[dict]) -> list[list[dict]]:
        result: list[list[dict]] = []
        for word in sorted(words, key=lambda w: (w['yMin'], w['xMin'])):
            if result and abs(word['yMin'] - result[-1][0]['yMin']) <= LINE:
                result[-1].append(word)
            else:
                result.append([word])
        return [sorted(line, key=lambda w: w['xMin']) for line in result]

    @staticmethod
    def joined(words) -> str:
        return ''.join(w['text'] for w in sorted(words, key=lambda w: (round(w['yMin']), w['xMin']))).replace(' ', '')

    def year_line(self, words: list[dict], count: int, below: float | None = None, near: float | None = None):
        """The line of year digits heading the columns: as many digits as the side declares."""
        # The line may also print the axis heading (`款`, `度`) left of the digits.
        candidates = [digits for line in self.lines(words)
                      if len(digits := [w for w in line if YEAR_DIGIT.fullmatch(w['text'])]) == count
                      and not any(re.search(r'[0-9０-９]', w['text']) for w in line if w not in digits)]
        if below is not None:
            candidates = [line for line in candidates if line[0]['yMin'] > below]
            candidates = candidates[:1]
        if near is not None:
            candidates = [line for line in candidates if abs(line[0]['yMin'] - near) <= LINE * 2]
        if len(candidates) != 1:
            raise ValueError(f'Expected one line of {count} year digits, found {len(candidates)}')
        return candidates[0]

    def frame_top(self, words: list[dict]) -> float:
        """Where the expenditure frame begins: its heading (`支出済額`), spaced out character by character."""
        heading = self.FRAME_HEADING
        for line in self.lines(words):
            text = self.joined(line)
            if heading in text:
                return min(w['yMin'] for w in line)
        raise ValueError(f'No frame heading {heading} on the left page')

    @staticmethod
    def centres(line: list[dict]) -> list[float]:
        return [(w['xMin'] + w['xMax']) / 2 for w in line]

    @staticmethod
    def column(centres: list[float], word: dict) -> int | None:
        """The column a printed number belongs to, by its right edge: an amount is set right in its column, a
        percentage about its centre, and either ends past the centre of its year digit and before the next one
        (a short amount set right, `778`, has its centre nearer the next column's digit)."""
        index = next((i for i in range(len(centres) - 1, -1, -1) if centres[i] <= word['xMax']), None)
        return None if index is None or (index == len(centres) - 1 and word['xMax'] > centres[-1] + LAST_COLUMN_OVERHANG) else index

    @staticmethod
    def edges(line: list[dict]) -> list[tuple[float, float]]:
        """Each column's x range: halfway between the centres of neighbouring year digits."""
        centres = [(w['xMin'] + w['xMax']) / 2 for w in line]
        bounds = [(a + b) / 2 for a, b in zip(centres, centres[1:])]
        first = centres[0] - (bounds[0] - centres[0]) if bounds else centres[0] - 40
        last = centres[-1] + (centres[-1] - bounds[-1]) if bounds else centres[-1] + 40
        cuts = [first, *bounds, last]
        return list(zip(cuts, cuts[1:]))

    # -- reading -------------------------------------------------------------------------------------------

    def read_spread(self, left_page: int, right_page: int, words: dict[int, list[dict]]):
        left_words, right_words = words[left_page], words[right_page]
        top = self.frame_top(left_words)
        left_years = self.year_line(left_words, len(self.LEFT), below=top)
        right_years = self.year_line(right_words, len(self.RIGHT), near=left_years[0]['yMin'])
        left_edges, right_edges = self.edges(left_years), self.edges(right_years)
        left_centres, right_centres = self.centres(left_years), self.centres(right_years)
        body_top = max(w['yMax'] for w in left_years)
        label_right = left_edges[0][0]
        left_body = [w for w in left_words if w['yMin'] > body_top]
        # The rows: a line printing an amount in the first column, in order down the page, until the 合計 row.
        anchors = []
        for line in self.lines(left_body):
            labels = [w for w in line if w['xMax'] <= label_right]
            if not any(self.column(left_centres, w) == 0 and AMOUNT.fullmatch(w['text']) for w in line):
                continue
            anchors.append((line[0]['yMin'], line))
            if self.joined(labels) == TOTAL:
                break
        else:
            raise ValueError(f'No {TOTAL} row on page {left_page}')
        bottoms = [(a[0] + b[0]) / 2 for a, b in zip(anchors, anchors[1:])]
        total_y, total_line = anchors[-1]
        body_bottom = max(w['yMax'] for w in total_line) + (total_y - bottoms[-1] if bottoms else 20)
        # The first row reaches up as far as it reaches down: the axis heading (`款`) printed under the year digits
        # is no part of its name.
        first_top = max(body_top, anchors[0][0] - (bottoms[0] - anchors[0][0])) if bottoms else body_top
        tops = [first_top, *bottoms]
        regions = list(zip(tops, [*bottoms, body_bottom]))
        rows, exclusions = [], []
        scope = [w for page in (left_page, right_page) for w in words[page]
                 if body_top < w['yMin'] and w['yMax'] <= body_bottom]
        for (low, high), (y, line) in zip(regions, anchors):
            inside = lambda w: low <= (w['yMin'] + w['yMax']) / 2 < high
            labels = [w for w in left_words if inside(w) and w['xMax'] <= label_right]
            cells = {}
            for side, page, page_words, names, centres in (('left', left_page, left_words, self.LEFT, left_centres),
                                                           ('right', right_page, right_words, self.RIGHT, right_centres)):
                for word in page_words:
                    if not inside(word) or (side == 'left' and word['xMax'] <= label_right):
                        continue
                    index = self.column(centres, word)
                    if index is None:
                        if re.search(r'[0-9]', word['text']):
                            raise ValueError(f'Digits outside the columns at page {page}, y={word["yMin"]}: {word["text"]}')
                        continue
                    name = names[index]
                    if name == RATIO:
                        continue
                    bracketed = BRACKETED.fullmatch(word['text'])
                    if bracketed:
                        heading, text = self.BRACKETED.get(name), bracketed[1]
                        if heading is None:
                            raise ValueError(f'Bracketed amount in column {name} at page {page}, y={word["yMin"]}')
                    elif AMOUNT.fullmatch(word['text']):
                        heading, text = name, word['text']
                    elif re.search(r'[0-9]', word['text']):
                        raise ValueError(f'Unreadable amount at page {page}, y={word["yMin"]}: {word["text"]}')
                    else:
                        continue
                    if heading in cells:
                        raise ValueError(f'Two amounts in column {heading} at page {page}, y={word["yMin"]}')
                    cells[heading] = (text, page, word)
            if self.joined(labels) == TOTAL:
                # The 合計 row is no 款: the coverage check matches its left-page amounts to the 款 sums. Its right-page amounts are printed
                # above and below its baseline (the bracketed 翌年度繰越額 over the 不用額), where the control-total
                # baseline does not reach them.
                exclusions.append({'kind': '総括', 'reason': '合計の行。款の和には入れない統制値。',
                                   'page': right_page, 'bbox': [right_edges[0][0], low, right_edges[-1][1], high]})
                continue
            ordered = sorted(labels, key=lambda w: (round(w['yMin']), w['xMin']))
            code_word = next((w for w in ordered if CODE.fullmatch(w['text'])), None)
            if code_word is None:
                raise ValueError(f'No 款 number at page {left_page}, y={y}')
            code, rest = CODE.fullmatch(code_word['text']).groups()
            name = rest + ''.join(w['text'] for w in ordered if w is not code_word)
            name = name.replace(' ', '')
            if not name:
                raise ValueError(f'No 款 name at page {left_page}, y={y}')
            record = {'款_番号': code, '款_名称': name, '款_物理頁': left_page,
                      '款_左端': min(w['xMin'] for w in labels), '款_上端': min(w['yMin'] for w in labels),
                      '款_右端': max(w['xMax'] for w in labels), '款_下端': max(w['yMax'] for w in labels)}
            for heading in self.headings():
                if heading in cells:
                    text, page, word = cells[heading]
                    record['款_' + heading] = text
                    record.update(amount_position_fields('款_' + heading, page,
                                                         [(word['xMin'], word['yMin'], word['xMax'], word['yMax'])]))
                else:
                    record['款_' + heading] = None
                    record.update(null_position_fields('款_' + heading))
            self.check_balance(record, left_page, y)
            rows.append(record)
        # Each column's printed extent: from halfway to the column on its left up to the next column's year digit
        # (a number printed in it ends before that digit's centre).
        spans = lambda edges, centres: [(a, centres[i + 1] if i + 1 < len(centres) else b) for i, (a, b) in enumerate(edges)]
        sides = ((left_page, self.LEFT, spans(left_edges, left_centres)), (right_page, self.RIGHT, spans(right_edges, right_centres)))
        for page, names, ranges in sides:
            for name, (a, b) in zip(names, ranges):
                if name == RATIO:
                    exclusions.append({'kind': '数量表', 'reason': '構成割合・増減率・予算現額に対する割合の欄（％）。金額の欄ではない。',
                                       'pages': [[page, page]], 'x_range': [a, b]})
        amount_columns = [{'header': name, 'x_range': [a, b]}
                          for _, names, ranges in sides for name, (a, b) in zip(names, ranges) if name != RATIO]
        return rows, scope, exclusions, amount_columns

    def check_balance(self, record: dict, page: int, y: float) -> None:
        """Each declared balance (`予算現額 = 支出済額 + 不用額 + 翌年度繰越額`, the same for the year before) holds in
        the row: the columns are printed independently, so a number read into the wrong column breaks it."""
        value = lambda heading: int((record.get('款_' + heading) or '0').replace(',', '').replace('△', '-').replace('▲', '-'))
        for total, parts in self.BALANCES.items():
            if record.get('款_' + total) is None:
                continue
            if value(total) != sum(value(part) for part in parts):
                raise ValueError(f'{total} ≠ {" + ".join(parts)} at page {page}, y={y}: {record["款_名称"]}')

    def headings(self) -> list[str]:
        named = [c for c in self.LEFT + self.RIGHT if c != RATIO]
        return named + [self.BRACKETED[c] for c in named if c in self.BRACKETED]

    def metadata(self, columns: list[str]) -> dict:
        money = ['款_' + h for h in self.headings()]
        return {'units': [{'text': '円', 'scope': {'kind': 'columns', 'columns': money}}],
                'notes': [{'text': self.NOTE, 'scope': {'kind': 'table'}}],
                'column_contexts': [{'columns': [c for c in columns if c.startswith('款_')],
                                     'header_path': ['科目', '款'],
                                     'grain_columns': ['款_番号', '款_物理頁', '款_上端']}]}

    def convert(self, inputs, destination, options):
        if len(inputs) != 1:
            raise ValueError('A compared-year table is read from one original')
        source = inputs[0]
        if (source['format'] != 'pdf' or source['pdf_type'] != 'text' or source['direction'] != 'expenditure'
                or source['target']['document_kind'] != 'settlement'):
            raise ValueError('Compared-year tables are text PDF settlement expenditure')
        if sha_file(source['path']) != source['sha256']:
            raise ValueError('Original SHA differs')
        account = options['account']
        pages = [p for scope in source['scope'] if scope['account'] == account
                 for first, last in scope['pages'] for p in range(first, last + 1)]
        if len(pages) != 2 or pages[1] != pages[0] + 1:
            raise ValueError(f'The scope of {account} must be one spread of two facing pages')
        destination = Path(destination)
        table_id = options['table_id']
        observations = destination / (table_id + '-observations')
        observations.mkdir()
        words = self.observe(Path(source['path']), pages, observations / 'words.html')
        rows, scope, exclusions, amount_columns = self.read_spread(pages[0], pages[1], words)
        if not rows:
            raise ValueError(f'No 款 rows for {account}')
        (observations / 'rows.json').write_text(json.dumps(rows, ensure_ascii=False, indent=2) + '\n')
        columns = tuple(ParquetColumn(k, 'BIGINT' if k.endswith('物理頁') else 'DOUBLE'
                                      if k.endswith(('左端', '上端', '右端', '下端')) else 'VARCHAR') for k in rows[0])
        output = write_conversion(destination / (table_id + '.parquet'), rows, columns=columns,
                                  context=ConversionContext(source['sha256'], table_id, __file__))
        write_coverage_words(Path(output.path), [(w['page'], (w['xMin'], w['yMin'], w['xMax'], w['yMax']), w['text'])
                                                 for w in scope],
                             amount_columns=amount_columns, excluded_regions=exclusions)
        return {table_id: {'path': Path(output.path), 'metadata': self.metadata(list(rows[0]))}}
