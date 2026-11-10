"""An account's 款 printed beside its revenue on one page (新島村の事務報告「一般会計当初予算」).

The page stacks several small tables. The one this reading reads prints the revenue on the left and the expenditure
on the right under one title line (`（３）令和6年度一般会計当初予算（単位：千円）`): over the right half only the
heading `歳 出`, then one row per 款 with its name spaced out character by character (no printed number), its
amount and its 構成比, and the row `歳出合計` at the foot. The amount column prints no heading of its own.

What the profile declares (measured on the page, in display coordinates):

- the title line (read in its box, it must read the declared title and hold the printed unit);
- the frame of the expenditure table (its x range and the y range of its heading, which must read the declared
  heading), the body and the total row;
- the label, amount and ratio columns. The amount is kept under the declared `heading`, the dictionary heading of
  the phase the title names, since nothing is printed over the column.

Only the words inside the frame are read and listed to the coverage check (the revenue on the left and the other
tables of the page are not this table). Every print inside the frame must fall in a column. The 款 sum must equal
the printed total, or the conversion stops. Ratio cells are listed to the coverage check as 数量表.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import re
import subprocess
import unicodedata
import xml.etree.ElementTree as ET

from ingestion.fiscal.manifest import sha_file
from ingestion.generic.reading import Reading
from ingestion.lib.node_tables import AMOUNT_COLUMNS, NODE_COLUMNS, write_coverage_words
from ingestion.lib.parquet import write_parquet
from shared.amount import number

AMOUNT = re.compile(r'△?(?:0|[1-9][0-9]{0,2}(?:,[0-9]{3})*)')
RATIO = re.compile(r'[0-9]+\.[0-9]+')
ROW_GAP = 3.0  # points: the words of one printed row start within this of each other


class Reader(Reading):
    REQUIRED_RULES = []

    def __init__(self, profile, workflow):
        super().__init__(profile, workflow)
        self.profile = profile

    @staticmethod
    def words(pdf, page, directory):
        xml = directory / f'p{page}.bbox.xml'
        subprocess.run(['pdftotext', '-f', str(page), '-l', str(page), '-bbox-layout', str(pdf), str(xml)], check=True)
        pages = ET.parse(xml).findall('.//{*}page')
        if len(pages) != 1:
            raise ValueError(f'Expected one page from the text layer: p{page}')
        found = []
        for w in pages[0].iter():
            if w.tag.rsplit('}', 1)[-1] != 'word' or not (w.text or '').strip():
                continue
            box = tuple(float(w.get(k)) for k in ('xMin', 'yMin', 'xMax', 'yMax'))
            found.append({'text': w.text, 'box': box, 'cx': (box[0] + box[2]) / 2, 'cy': (box[1] + box[3]) / 2})
        return found

    @staticmethod
    def key(text):
        return re.sub(r'\s+', '', unicodedata.normalize('NFKC', text))

    @staticmethod
    def within(words, x, y):
        return [w for w in words if x[0] <= w['cx'] <= x[1] and y[0] <= w['cy'] <= y[1]]

    @staticmethod
    def read(words):
        return ''.join(w['text'] for w in sorted(words, key=lambda w: (round(w['box'][1] / ROW_GAP), w['box'][0])))

    @staticmethod
    def box(words):
        return (min(w['box'][0] for w in words), min(w['box'][1] for w in words),
                max(w['box'][2] for w in words), max(w['box'][3] for w in words))

    def convert(self, inputs, destination, options):
        if len(inputs) != 1:
            raise ValueError('A paired summary is read from one original')
        source = inputs[0]
        if source['format'] != 'pdf' or source['pdf_type'] != 'text' or source['direction'] != 'expenditure':
            raise ValueError('A paired summary reads a text PDF of expenditure')
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
        words = self.words(source['path'], page, observations)

        # The title line, the unit it prints and the heading over the frame.
        title = self.read(self.within(words, profile['title']['x'], profile['title']['y']))
        if self.key(title) != self.key(profile['title']['text']):
            raise ValueError(f'Printed title differs: {title!r} ≠ {profile["title"]["text"]!r}')
        if self.key(profile['unit']['printed']) not in self.key(title):
            raise ValueError(f'The title does not print the unit {profile["unit"]["printed"]}')
        unit = profile['unit']['text']
        frame = profile['frame']
        heading_printed = self.read(self.within(words, frame['x'], frame['heading_y']))
        if self.key(heading_printed) != self.key(frame['heading']):
            raise ValueError(f'Printed heading differs: {heading_printed!r} ≠ {frame["heading"]!r}')

        columns = profile['columns']
        label_x, amount_x, ratio_x = columns['label'], columns['amount']['x'], columns['ratio']

        def cells(row, where):
            label_words = [w for w in row if label_x[0] <= w['cx'] <= label_x[1]]
            amount = [w for w in row if amount_x[0] <= w['cx'] <= amount_x[1]]
            ratio = [w for w in row if ratio_x[0] <= w['cx'] <= ratio_x[1]]
            left = [w['text'] for w in row if w not in label_words and w not in amount and w not in ratio]
            if left:
                raise ValueError(f'Prints outside the declared columns: {where} {left}')
            if len(amount) > 1 or (amount and not AMOUNT.fullmatch(amount[0]['text'])):
                raise ValueError(f'Not one amount in the amount cell: {where} {[w["text"] for w in amount]}')
            if len(ratio) > 1 or (ratio and not RATIO.fullmatch(ratio[0]['text'])):
                raise ValueError(f'Not one ratio in the ratio cell: {where} {[w["text"] for w in ratio]}')
            return label_words, amount[0] if amount else None

        body = self.within(words, frame['x'], profile['body'])
        rows: list[list] = []
        for w in sorted(body, key=lambda w: w['box'][1]):
            if rows and w['box'][1] - rows[-1][0]['box'][1] <= ROW_GAP:
                rows[-1].append(w)
            else:
                rows.append([w])

        nodes, amounts, kan = [], [], []
        heading = columns['amount']['heading']
        axis = frame['heading']
        for row in rows:
            label_words, amount = cells(row, f'row at y={row[0]["box"][1]:.1f}')
            name = self.key(self.read(label_words))
            if not name:
                raise ValueError(f'A 款 row without its printed name at y={row[0]["box"][1]:.1f}')
            x0, y0, x1, y1 = self.box(label_words)
            node_key = 'n-' + hashlib.sha256(f'{page}:{x0:.2f}:{y0:.2f}:{axis}'.encode()).hexdigest()[:24]
            nodes.append({'node_key': node_key, 'parent_node_key': None, 'axis_header': axis, 'depth': 1,
                          'level_header': '款', 'code_text': None, 'name_text': name, 'physical_page': page,
                          'x0': x0, 'y0': y0, 'x1': x1, 'y1': y1})
            kan.append((name, amount))
            if amount:
                bx0, by0, bx1, by1 = amount['box']
                amounts.append({'node_key': node_key, 'header_path': heading, 'amount_text': amount['text'],
                                'unit_text': unit, 'physical_page': page, 'x0': bx0, 'y0': by0, 'x1': bx1, 'y1': by1})
        if not nodes:
            raise ValueError('No 款 row read')

        # The total the table prints of itself.
        total_row = self.within(words, frame['x'], profile['total_row']['y'])
        total_label, total = cells(total_row, 'the total row')
        if self.key(self.read(total_label)) != self.key(profile['total_row']['label']):
            raise ValueError(f'The total row label differs: {self.read(total_label)!r}')
        if total is None:
            raise ValueError('The total row prints no amount')
        summed = sum(number(a['text']) for _, a in kan if a)
        if summed != number(total['text']):
            raise ValueError(f'款 sum {summed:,} ≠ printed total {total["text"]}')

        nodes_path = destination / f'{options["table_id"]}-nodes.parquet'
        amounts_path = destination / f'{options["table_id"]}-amounts.parquet'
        write_parquet(nodes_path, nodes, columns=NODE_COLUMNS)
        write_parquet(amounts_path, amounts, columns=AMOUNT_COLUMNS)
        foot = profile['total_row']['y']
        regions = [
            {'kind': '数量表', 'reason': '構成比の欄。金額の欄ではない。', 'page': page,
             'bbox': [ratio_x[0], profile['body'][0], ratio_x[1], foot[1]]},
            {'kind': '総括', 'reason': '合計の行。款の和と照合した統制値で、款の和には入れない。', 'page': page,
             'bbox': [frame['x'][0], foot[0], frame['x'][1], foot[1]]},
        ]
        scope = [(page, w['box'], w['text']) for w in [*body, *total_row]]
        write_coverage_words(destination / f'{options["table_id"]}.parquet', scope, excluded_regions=regions)
        notes = [
            f'物理{page}頁の「{profile["title"]["text"]}」は歳入と歳出を左右に並べた表なので、右の「{frame["heading"]}」の枠だけを読んだ'
            '（読み方 paired_summary）。左の歳入と頁の他の表は取り込んでいない。',
            f'款の行 {len(nodes)} 行を、印字のとおり款として置いた。款の番号は印字されていない。項・目は印字されていない。',
            f'金額の欄に見出しの印字が無いので、表の題のとおり「{heading}」の見出しで持った。',
            f'金額の単位は表の題の「{profile["unit"]["printed"]}」。款の和と印字の「{profile["total_row"]["label"]}」が一致。',
            '構成比の欄は金額ではないので取り込んでいない。',
        ]
        (observations / 'notes.json').write_text(json.dumps(notes, ensure_ascii=False, indent=2) + '\n')
        return {options['table_id']: {'nodes': nodes_path, 'amounts': amounts_path, 'notes': notes}}
