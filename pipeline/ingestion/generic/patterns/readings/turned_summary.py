"""A one-page summary of an account's 款 drawn turned on its page (大島町の決算資料「一般会計目的別歳出」).

The page is upright A4 but its table is printed turned 90° counterclockwise: the text layer's words run up the
page, so the layered builder (`generic_text`) reads no rows. This reading turns each word box into the table's
own upright frame to find rows and columns, and keeps every position it writes in the display page's frame
(the word boxes as Poppler gives them).

What the profile declares (measured on the page, in the upright frame):

- the header rows and the column x ranges, each column's printed heading path with the span of every
  spanning heading above it. The printed characters found in those spans must read the declared heading,
  or the conversion stops;
- which columns are amounts, which are ratios (構成比・対前年度増減率) and which are breakdowns of another column
  that are read and checked but not taken in (`breakdown`, with the coverage exclusion's kind and reason).
  Ratio cells are listed to the digit-coverage check as 数量表;
- the heading an amount column is kept under when the shared dictionary must know it (`heading`, for the
  executed total of the year);
- the sums the table prints of itself: the 計 row of every amount column (款 sum = printed 計) and the row
  identities (総額 = 左の内訳の和). A row with a blank part is not compared; every other mismatch stops.

Each 款 row is one node (axis 区分, level 款). Only what is printed is kept: a blank cell has no amount row.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import re
import subprocess
import unicodedata
import xml.etree.ElementTree as ET

from ingestion.generic.reading import Reading
from ingestion.fiscal.manifest import sha_file
from ingestion.lib.node_tables import AMOUNT_COLUMNS, NODE_COLUMNS, write_coverage_words
from ingestion.lib.parquet import write_parquet
from shared.amount import number

AMOUNT = re.compile(r'△?(?:0|[1-9][0-9]{0,2}(?:,[0-9]{3})*)')
CODE = re.compile(r'^([0-9０-９]+)[．.]')
DASH = re.compile(r'[-－−‐]')
ROW_GAP = 3.0  # points: the words of one printed row start within this of each other (upright y)


class Reader(Reading):
    REQUIRED_RULES = []

    def __init__(self, profile, workflow):
        super().__init__(profile, workflow)
        self.profile = profile

    # The upright frame of a table turned 90° counterclockwise on a page of height H: x' = H - y, y' = x.
    # A profile with `turned: false` measures a page whose text layer already runs upright (the page is
    # rotated in the PDF, so Poppler gives the table's own frame): the frame is the display frame.
    def upright(self, word, height):
        x0, y0, x1, y1 = word['box']
        if not self.profile.get('turned', True):
            return (x0, y0, x1, y1)
        return (height - y1, x0, height - y0, x1)

    def words(self, pdf, page, directory):
        xml = directory / f'p{page}.bbox.xml'
        subprocess.run(['pdftotext', '-f', str(page), '-l', str(page), '-bbox-layout', str(pdf), str(xml)], check=True)
        tree = ET.parse(xml)
        pages = tree.findall('.//{*}page')
        if len(pages) != 1:
            raise ValueError(f'Expected one page from the text layer: p{page}')
        height = float(pages[0].get('height'))
        found = []
        for w in pages[0].iter():
            if w.tag.rsplit('}', 1)[-1] != 'word' or not (w.text or '').strip():
                continue
            box = tuple(float(w.get(k)) for k in ('xMin', 'yMin', 'xMax', 'yMax'))
            found.append({'text': w.text, 'box': box})
        for w in found:
            w['up'] = self.upright(w, height)
            w['cx'] = (w['up'][0] + w['up'][2]) / 2
            w['cy'] = (w['up'][1] + w['up'][3]) / 2
        return found, height

    @staticmethod
    def read(words):
        """Printed text in the upright reading order: line by line (y'), left to right (x') within a line."""
        lines: list[list] = []
        for w in sorted(words, key=lambda w: (w['up'][1], w['up'][0])):
            if lines and abs(lines[-1][0]['up'][1] - w['up'][1]) <= ROW_GAP:
                lines[-1].append(w)
            else:
                lines.append([w])
        return ''.join(w['text'] for line in lines for w in sorted(line, key=lambda w: w['up'][0]))

    @staticmethod
    def key(text):
        return re.sub(r'\s+', '', unicodedata.normalize('NFKC', text))

    def check_heading(self, words, x, y, expected, where):
        inside = [w for w in words if x[0] <= w['cx'] <= x[1] and y[0] <= w['cy'] <= y[1]]
        printed = self.read(inside)
        if self.key(printed) != self.key(expected):
            raise ValueError(f'Printed heading differs at {where}: {printed!r} ≠ {expected!r}')

    @staticmethod
    def box(words):
        return (min(w['box'][0] for w in words), min(w['box'][1] for w in words),
                max(w['box'][2] for w in words), max(w['box'][3] for w in words))

    def display_box(self, x, y, height):
        """An upright rectangle (x' range, y' range) as a display-page box."""
        if not self.profile.get('turned', True):
            return [x[0], y[0], x[1], y[1]]
        return [y[0], height - x[1], y[1], height - x[0]]

    def convert(self, inputs, destination, options):
        if len(inputs) != 1:
            raise ValueError('A turned summary is read from one original')
        source = inputs[0]
        if source['format'] != 'pdf' or source['pdf_type'] != 'text' or source['direction'] != 'expenditure':
            raise ValueError('A turned summary reads a text PDF of expenditure')
        if sha_file(source['path']) != source['sha256']:
            raise ValueError('Original SHA differs')
        profile = self.profile
        scopes = [s for s in source['scope'] if s['account'] == options['account']]
        pages = [p for s in scopes for first, last in s['pages'] for p in range(first, last + 1)]
        if pages != [profile['page']]:
            raise ValueError(f'The selected scope must be the one page the profile measured: {pages}')
        page = profile['page']
        destination = Path(destination)
        observations = destination / f'{options["table_id"]}-observations'
        observations.mkdir(parents=True)
        words, height = self.words(source['path'], page, observations)

        # The unit, the title and the headings, as printed.
        unit_words = [w for w in words if self.key(w['text']) == self.key(profile['unit']['printed'])]
        if len(unit_words) != 1:
            raise ValueError(f'Printed unit not found once: {profile["unit"]["printed"]}')
        unit = profile['unit']['text']
        title = [w for w in words if self.key(w['text']) == self.key(profile['title'])]
        if len(title) != 1:
            raise ValueError(f'Printed title not found once: {profile["title"]}')
        header_rows = profile['header_rows']
        header_y = (header_rows[0][0], header_rows[-1][1])
        label = profile['label_column']
        self.check_heading(words, label['x'], header_y, label['header'], 'the label column')
        for column in profile['columns']:
            for level, segment in enumerate(column['header']):
                span = segment.get('x', column['x'])
                self.check_heading(words, span, header_rows[level], segment['text'], f'{column["x"]} level {level}')

        # The rows of the body and the 計 row.
        body = [w for w in words if profile['body'][0] <= w['cy'] <= profile['body'][1]]
        rows: list[list] = []
        for w in sorted(body, key=lambda w: w['up'][1]):
            if rows and w['up'][1] - rows[-1][0]['up'][1] <= ROW_GAP:
                rows[-1].append(w)
            else:
                rows.append([w])
        total_row = [w for w in words if profile['total_row']['y'][0] <= w['cy'] <= profile['total_row']['y'][1]]

        def cells(row, where):
            taken, values = set(), {}
            for index, column in enumerate(profile['columns']):
                inside = [w for w in row if column['x'][0] <= w['cx'] <= column['x'][1]]
                taken.update(id(w) for w in inside)
                if column['kind'] == 'ratio':
                    continue
                # A dash alone in an amount cell is the printed nil of a 款 the year does not have: a blank.
                inside = [w for w in inside if not DASH.fullmatch(w['text'])]
                if len(inside) > 1:
                    raise ValueError(f'More than one print in an amount cell: {where} {[w["text"] for w in inside]}')
                if inside and not AMOUNT.fullmatch(inside[0]['text']):
                    raise ValueError(f'Not an amount in an amount cell: {where} {inside[0]["text"]!r}')
                if inside:
                    values[index] = inside[0]
            label_words = [w for w in row if label['x'][0] <= w['cx'] <= label['x'][1]]
            taken.update(id(w) for w in label_words)
            left = [w['text'] for w in row if id(w) not in taken]
            if left:
                raise ValueError(f'Prints outside the declared columns: {where} {left}')
            return label_words, values

        nodes, amounts, kan, label_ids = [], [], [], set()
        heading = lambda column: column.get('heading') or '／'.join(s['text'] for s in column['header'])
        for row in rows:
            label_words, values = cells(row, f'row at y\'={row[0]["up"][1]:.1f}')
            label_ids.update(id(w) for w in label_words)
            printed = self.read(label_words)
            found = CODE.match(self.key(printed)) or DASH.match(self.key(printed))
            if not found:
                raise ValueError(f'A 款 row without its printed number: {printed!r}')
            # A dash in place of the number (`- 土石流災害対策費`): a 款 of the year before only, printed with no number.
            number_printed = re.match(r'[0-9０-９]+', printed.strip())
            code = number_printed.group(0) if number_printed else None
            name = self.key(printed)[found.end():]
            if not name:
                raise ValueError(f'A 款 row without its printed name: {printed!r}')
            x0, y0, x1, y1 = self.box(label_words)
            node_key = 'n-' + hashlib.sha256(f'{page}:{x0:.2f}:{y0:.2f}:{label["header"]}'.encode()).hexdigest()[:24]
            nodes.append({'node_key': node_key, 'parent_node_key': None, 'axis_header': label['header'], 'depth': 1,
                          'level_header': '款', 'code_text': code, 'name_text': name, 'physical_page': page,
                          'x0': x0, 'y0': y0, 'x1': x1, 'y1': y1})
            kan.append((name, values))
            for index, word in values.items():
                if profile['columns'][index]['kind'] != 'amount':
                    continue
                bx0, by0, bx1, by1 = word['box']
                amounts.append({'node_key': node_key, 'header_path': heading(profile['columns'][index]),
                                'amount_text': word['text'], 'unit_text': unit, 'physical_page': page,
                                'x0': bx0, 'y0': by0, 'x1': bx1, 'y1': by1})
        if not nodes:
            raise ValueError('No 款 row read')

        # The sums the table prints of itself.
        total_label, totals = cells(total_row, 'the 計 row')
        if self.key(self.read(total_label)) != self.key(profile['total_row']['label']):
            raise ValueError(f'The 計 row label differs: {self.read(total_label)!r}')
        amount_columns = [i for i, c in enumerate(profile['columns']) if c['kind'] == 'amount']
        breakdowns = [i for i, c in enumerate(profile['columns']) if c['kind'] == 'breakdown']
        for index in [*amount_columns, *breakdowns]:
            if index not in totals:
                raise ValueError(f'The 計 row prints no amount in column {profile["columns"][index]["x"]}')
            summed = sum(number(values[index]['text']) for _, values in kan if index in values)
            if summed != number(totals[index]['text']):
                raise ValueError(f'款 sum {summed:,} ≠ printed 計 {totals[index]["text"]} in {heading(profile["columns"][index])}')
        paths = [heading(c) for c in profile['columns']]
        compared, skipped = 0, []
        for identity in profile['row_sums']:
            whole, parts = paths.index(identity['whole']), [paths.index(p) for p in identity['parts']]
            for name, values in [*kan, ('計', totals)]:
                if whole not in values or any(p not in values for p in parts):
                    if whole in values or any(p in values for p in parts):
                        skipped.append(f'{name}（{identity["whole"]}）')
                    continue
                if number(values[whole]['text']) != sum(number(values[p]['text']) for p in parts):
                    raise ValueError(f'{name}: {identity["whole"]} ≠ {" + ".join(identity["parts"])}')
                compared += 1

        nodes_path = destination / f'{options["table_id"]}-nodes.parquet'
        amounts_path = destination / f'{options["table_id"]}-amounts.parquet'
        write_parquet(nodes_path, nodes, columns=NODE_COLUMNS)
        write_parquet(amounts_path, amounts, columns=AMOUNT_COLUMNS)
        table_x = (min(c['x'][0] for c in profile['columns']), max(c['x'][1] for c in profile['columns']))
        regions = [{'kind': '数量表', 'reason': '比率の欄（構成比・対前年度増減率）。金額の欄ではない。', 'page': page,
                    'bbox': self.display_box(c['x'], (profile['body'][0], profile['total_row']['y'][1]), height)}
                   for c in profile['columns'] if c['kind'] == 'ratio']
        regions += [{**c['exclusion'], 'page': page,
                     'bbox': self.display_box(c['x'], (profile['body'][0], profile['total_row']['y'][1]), height)}
                    for c in profile['columns'] if c['kind'] == 'breakdown']
        regions.append({'kind': '総括', 'reason': '計の行。款の和と照合した統制値で、款の和には入れない。', 'page': page,
                        'bbox': self.display_box(table_x, profile['total_row']['y'], height)})
        scope = []
        for w in words:
            # A number glued to the first character of the name (`１．議`): the number is the node's code.
            glued = re.match(r'^([0-9０-９]+)(.+)$', w['text'])
            if glued and id(w) in label_ids:
                x0, y0, x1, y1 = w['box']
                share = len(glued.group(1)) / len(w['text'])
                if profile.get('turned', True):
                    cut = y1 - (y1 - y0) * share  # the text runs up the page
                    scope.append((page, (x0, cut, x1, y1), glued.group(1)))
                    scope.append((page, (x0, y0, x1, cut), glued.group(2)))
                else:
                    cut = x0 + (x1 - x0) * share
                    scope.append((page, (x0, y0, cut, y1), glued.group(1)))
                    scope.append((page, (cut, y0, x1, y1), glued.group(2)))
            else:
                scope.append((page, w['box'], w['text']))
        write_coverage_words(destination / f'{options["table_id"]}.parquet', scope, excluded_regions=regions)
        moved = [(('／'.join(s['text'] for s in c['header'])), c['heading']) for c in profile['columns'] if c.get('heading')]
        notes = [
            (f'物理{page}頁の表（{profile["title"]}）は頁に90°回して組まれているので、語の位置を表の向きに回して行と欄を読んだ（読み方 turned_summary、位置は表示頁の座標のまま）。'
             if profile.get('turned', True) else
             f'物理{page}頁の表（{profile["title"]}）は頁ごと回してあり、文字層が表の向きのままなので、その座標で行と欄を読んだ（読み方 turned_summary の turned: false）。'),
            f'款の行 {len(nodes)} 行を、区分の欄の印字のとおり款として置いた。項・目は印字されていない。',
            f'金額の単位は印字の「{profile["unit"]["printed"]}」。金額の欄 {len(amount_columns) + len(breakdowns)} 欄すべてで款の和と印字の「{profile["total_row"]["label"]}」が一致。'
            f'行の内訳（総額＝左の内訳の和など）を {compared} 行で照合して一致'
            + (f'（空欄を含む {len(skipped)} 行は照合していない: {"・".join(skipped)}）' if skipped else '') + '。',
            '比率の欄（構成比・対前年度増減率）は金額ではないので取り込んでいない。空欄の欄は金額の行を作っていない。',
        ]
        if breakdowns:
            notes.append('内訳の欄 ' + '・'.join('／'.join(s['text'] for s in profile['columns'][i]['header']) for i in breakdowns)
                         + ' は、和と計を照合したうえで取り込んでいない（' + '・'.join(sorted({profile['columns'][i]['exclusion']['kind'] for i in breakdowns})) + '）。')
        if moved:
            notes.append('金額の見出しを辞書の見出しに寄せた: ' + '・'.join(f'{a}→{b}' for a, b in moved) + '。')
        (observations / 'notes.json').write_text(json.dumps(notes, ensure_ascii=False, indent=2) + '\n')
        return {options['table_id']: {'nodes': nodes_path, 'amounts': amounts_path, 'notes': notes}}
