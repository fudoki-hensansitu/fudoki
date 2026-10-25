import re
import subprocess
from pathlib import Path
import json
import xml.etree.ElementTree as ET
from ingestion.lib.conversion import ConversionContext, write_conversion
from ingestion.lib.annotations import remark_prose_lines
from ingestion.lib.node_tables import (AMOUNT_POSITION_SUFFIXES, amount_position_fields, coverage_regions,
                                        null_position_fields, write_coverage_words)
from ingestion.lib.parquet import ParquetColumn
from ingestion.generic.reading import Reading

_DEFAULT = object()

class Reader(Reading):
    REQUIRED_RULES = ['normalize', 'repair_brackets', 'repair_name', 'repair_text', 'repair_width', 'split_boundary_token', 'split_glued_setsu']

    def __init__(self, profile, workflow):
        super().__init__(profile, workflow)
        self.REPAIR_PATTERNS = profile['repair_patterns']
        self.BRACKET_WORDS = profile['bracket_words']
        self.BOUNDARY_X = profile['boundary_x']
        self.PAGE_WIDTH = profile['page_width']
        self.PAGE_HEIGHT = profile['page_height']
        self.BODY_TOP = profile['body_top']
        self.BODY_BOTTOM = profile['body_bottom']
        self.NOTE_LEFT = profile['note_left']
        self.NOTE_RIGHT = profile['note_right']
        self.BUDGET = profile['budget']
        self.EXECUTED = profile['executed']
        self.SUBJ_BANDS = [tuple(value) for value in profile['subj_bands']]
        self.SETSU_NUM = tuple(profile['setsu_num'])
        self.SETSU_NAME = tuple(profile['setsu_name'])
        self.SETSU_BANDS = [tuple(value) for value in profile['setsu_bands']]
        self.EXEC_BANDS = self.SETSU_BANDS[1:]
        self.AMOUNT_COLUMNS = ([{'header': key, 'x_range': list(edges)}
                           for key, edges in zip(self.BUDGET, self.SUBJ_BANDS)] +
                          [{'header': '金額', 'x_range': list(self.SETSU_BANDS[0])}] +
                          [{'header': key, 'x_range': list(edges)}
                           for key, edges in zip(self.EXECUTED, self.EXEC_BANDS)])
        self.NOTE_AMOUNT_LEFT = profile['note_amount_left']
        self.AMOUNT = re.compile(r'[△]?(?:[0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)')
        self.NUMBER = re.compile(r'[0-9]+')
        self.GLYPH_FIX = profile['glyph_fix']
        self.DIGIT_FIX = profile['digit_fix']
        self.REPAIR_CHARS = profile['repair_chars']
        self.REPAIR_WORDS = [tuple(value) for value in profile['repair_words']]
        self.REPAIR_HITS = {}
        self.DEPT_SUFFIX = re.compile(
            r'(?:課|局|所|室|部|係|科|館|園|校|庁|事務所|センター|課・[課局所室部係科館校庁]|'
            r'局・[課局所室部係科館校庁]|所・[課局所室部係科館校庁]|'
            r'課・課・[課局所室部係科館校庁]|課・局・[課局所室部係科館校庁])+')
        self.FULLWIDTH = str.maketrans('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
                                  '０１２３４５６７８９ＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺ'
                                  'ａｂｃｄｅｆｇｈｉｊｋｌｍｎｏｐｑｒｓｔｕｖｗｘｙｚ')
        self.BOUNDARY_MARKER = re.compile(r'[0-9oO○〇●]*[oO○〇●][0-9oO○〇●]*')
        self.GLUED_SETSU = re.compile(r'([0-9]{1,2})([^0-9,.\s].*)')
        self.SHIFTED_GLYPHS = frozenset('•゜oO')
        self.AMOUNT_CHARS = frozenset('0123456789,•゜OlI|△')
        self.ANNOTATION = re.compile(r'流用|充当|繰越分不用額|前年度繰越|議決|不用額|説明|流$|から流')
        self.DATED = re.compile(r'[0-9]+年|[0-9]+号')
        self.UCHIWAKE_REASON = profile['uchiwake_reason']
        self.LINEAGE = [f'{level}_{k}' for level in ('款', '項', '目')
                   for k in ('番号', '名称', *self.BUDGET, *self.EXECUTED, '翌年度繰越額_区分',
                             '備考', '物理頁', '左端', '上端', '右端', '下端',
                             *[f'{c}_{s}' for c in (*self.BUDGET, *self.EXECUTED) for s in AMOUNT_POSITION_SUFFIXES])]
        self.SETSU_COLUMNS = (self.LINEAGE + [f'節_{k}' for k in ('番号', '名称', '金額', *self.EXECUTED,
                                                        '翌年度繰越額_区分', '備考',
                                                        '物理頁', '左端', '上端', '右端', '下端',
                                                        *[f'{c}_{s}' for c in ('金額', *self.EXECUTED)
                                                          for s in AMOUNT_POSITION_SUFFIXES])])
        self.BREAKDOWN_COLUMNS = (self.LINEAGE + ['実施事業_名称', '実施事業_金額', '項目_番号',
                                        '項目_名称', '項目_金額', '細目_番号', '細目_名称',
                                        '細目_金額', '物理頁', '上端', '下端'] +
                             [f'{level}_{field}' for level in ('実施事業', '項目', '細目')
                              for field in ('物理頁', '左端', '上端', '右端', '下端',
                                            *[f'金額_{s}' for s in AMOUNT_POSITION_SUFFIXES])])


    def observe(self, pdf, first, last, path):
        subprocess.run(['pdftotext', '-f', str(first), '-l', str(last), '-bbox-layout',
                        str(pdf), str(path)], check=True)
        pages = []
        for number, page in enumerate(ET.parse(path).findall('.//{*}page'), first):
            if abs(float(page.get('width')) - self.PAGE_WIDTH) > .1 or abs(float(page.get('height')) - self.PAGE_HEIGHT) > .1:
                raise ValueError(f'Unmeasured page dimensions at {number}')
            words = []
            for w in page.findall('.//{*}word'):
                word = dict(text=self.rule('repair_text')(w.text or ''), **{k: float(v) for k, v in w.attrib.items()})
                for part in self.rule('split_glued_setsu')(word):
                    words.extend(self.rule('split_boundary_token')(part))
            pages.append((number, words))
        if len(pages) != last - first + 1:
            raise ValueError('Incomplete Poppler page range')
        return pages

    def lines(self, words):
        result = []
        for word in sorted(words, key=lambda w: (w['yMin'], w['xMin'])):
            if not result or word['yMin'] - result[-1][0]['yMin'] > 1.5:
                result.append([])
            result[-1].append(word)
        return [sorted(row, key=lambda w: w['xMin']) for row in result]

    def text(self, words):
        result = []
        for row in self.lines(words):
            value = ''
            previous = None
            for word in row:
                if previous and word['xMin'] - previous['xMax'] > 1:
                    value += ' '
                value += word['text']
                previous = word
            result.append(value)
        return '\n'.join(result) or None

    def row_words(self, words, y):
        """Words of one printed row; shifted glyphs (△/0) sit up to ~4.2pt off the line
        (a printed 0 can reach the text layer as an 'o' raised above the baseline)."""
        return [w for w in words
                if y - (4.6 if w['text'] in self.SHIFTED_GLYPHS else 2.2) <= w['yMin'] < y + 3.2]

    def boxes(self, words):
        return [[w['xMin'], w['yMin'], w['xMax'], w['yMax']] for w in words]

    def positioned_amounts(self, keys, texts, owners, page):
        """Amount texts with their own printed positions, keyed per amount column.

        Every key is emitted so rows stay homogeneous; absent amounts keep NULL
        positions and create no amount row. A printed amount without its words
        is a converter bug, never a silent NULL.
        """
        record = {}
        for key, value in zip(keys, texts):
            record[key] = value
            words = owners.get(key, [])
            if value is not None:
                if not words:
                    raise ValueError(f'Printed amount without word boxes: {key}')
                record.update(amount_position_fields(key, page, self.boxes(words)))
            else:
                record.update(null_position_fields(key))
        return record

    def band_amounts(self, row, bands, anomalies=None):
        """Assign each amount token to its band by the token's center x, then
        join the band's tokens left to right. Tokens split one glyph per word.
        A △ sign (text layer '•') sits a few points left of its digits and can
        drift into the previous band: it takes the band of the next token.
        Returns (texts, owners) per band; owners keep the printed word boxes."""
        ordered = sorted(row, key=lambda w: w['xMin'])
        values = [[] for _ in bands]
        for index, w in enumerate(ordered):
            center = (w['xMin'] + w['xMax']) / 2
            if w['text'] == '•' and index + 1 < len(ordered):
                nxt = ordered[index + 1]
                if nxt['xMin'] - w['xMax'] < 15:
                    center = (nxt['xMin'] + nxt['xMax']) / 2
            band = next((i for i, (left, right) in enumerate(bands) if left <= center < right), None)
            if band is None:
                continue
            values[band].append(w)
        result = []
        owners = []
        for tokens in values:
            if not tokens:
                result.append(None)
                owners.append([])
                continue
            value = ''.join(self.rule('normalize')(self.DIGIT_FIX.get(w['text'], w['text'])) for w in tokens)
            if not self.AMOUNT.fullmatch(value):
                # A printed literal instead of an amount (e.g. 繰越明許費 in the
                # 翌年度繰越額 column): keep it verbatim and flag it.
                if anomalies is not None:
                    anomalies.append({'issue': 'literal value in amount column',
                                      'value': value})
                result.append(value)
                owners.append(tokens)
                continue
            result.append(value)
            owners.append(tokens)
        return result, owners

    def location(self, page, y, words):
        words = list(words)
        return {'物理頁': page, '左端': min(w['xMin'] for w in words), '上端': y,
                '右端': max(w['xMax'] for w in words), '下端': max(w['yMax'] for w in words)}

    def executed(self, words, y, anomalies):
        right = [w for w in self.row_words(words, y)
                 if self.EXEC_BANDS[0][0] - 6 <= w['xMin'] and w['xMin'] < 980]
        texts, band_owners = self.band_amounts(right, self.EXEC_BANDS, anomalies)
        owners = dict(zip(self.EXECUTED, band_owners))
        result = dict(zip(self.EXECUTED, texts))
        result['翌年度繰越額_区分'] = None
        # 繰越明許費 rows print the label on the row and the carried amount on a
        # sub-line ~12pt below it, inside the same column band. The printed literal
        # is preserved as the carryover kind, not folded into the amount.
        carryover = result['翌年度繰越額']
        if carryover is not None and not self.AMOUNT.fullmatch(carryover):
            result['翌年度繰越額_区分'] = carryover
            result['翌年度繰越額'] = None
            owners['翌年度繰越額'] = []
            sub = [w for w in words if self.EXEC_BANDS[1][0] <= w['xMin'] < self.EXEC_BANDS[1][1] + 4
                   and y + 6 <= w['yMin'] < y + 22]
            # The sub-line must not itself carry another carryover label.
            if not any('繰越' in w['text'] for w in words
                       if y + 6 <= w['yMin'] < y + 22):
                value = self.amount_text(sub)
                if value is not None:
                    anomalies.append({'issue': 'carryover subline merged', 'y': y,
                                      'value': value, 'label': carryover})
                    result['翌年度繰越額'] = value
                    owners['翌年度繰越額'] = sub
        return result, owners

    def subject_record(self, words, row, page, y, name_high, anomalies, next_row=None):
        labels = [w for w in row if w['xMin'] < self.SUBJ_BANDS[0][0]]
        joined = ''.join(w['text'] for w in labels)
        if joined.startswith('歳出') and '計' in joined:
            # The 合 glyph splits into misencoded strokes in the text layer.
            # Keep the observed total's known printed caption in coverage too.
            for index, word in enumerate(labels):
                word['coverage_text'] = '歳出合計' if index == 0 else ''
            near = self.row_words(words, y)
            texts, owners = self.band_amounts(near, self.SUBJ_BANDS, anomalies)
            exec_texts, exec_owners = self.executed(words, y, anomalies)
            return 'total', {**self.positioned_amounts(self.BUDGET, texts, dict(zip(self.BUDGET, owners)), page),
                             **self.positioned_amounts(self.EXECUTED, [exec_texts[k] for k in self.EXECUTED],
                                                  exec_owners, page),
                             '翌年度繰越額_区分': exec_texts['翌年度繰越額_区分']}
        # The marker is the leftmost label word that reads as a number. A parent's
        # wrapped name tail can sit further left on the same baseline (and a
        # printed '1' can reach the text layer as 'l'/'I').
        digits = [w for w in labels
                  if self.NUMBER.match(self.DIGIT_FIX.get(w['text'], w['text']))]
        if not digits:
            raise ValueError(f'Unnumbered printed path at page {page}, y={y}')
        marker = min(digits, key=lambda w: w['xMin'])
        match = re.match(r'([0-9]+)(.*)', self.DIGIT_FIX.get(marker['text'], marker['text']))
        level = '款' if marker['xMin'] < 60 else '項' if marker['xMin'] < 140 else '目'
        name_words = [w for w in words if marker['xMin'] + .2 <= w['xMin'] and w['xMax'] <= 217
                      and y - 7.5 <= w['yMin'] < name_high and w is not marker]
        # A name tail sharing the next row's baseline stays left of that row's
        # own marker; recover it into this record's name.
        if next_row is not None:
            next_labels = [w for w in next_row if w['xMin'] < self.SUBJ_BANDS[0][0]]
            next_marker = next((w for w in sorted(next_labels, key=lambda w: w['xMin'])
                                if self.NUMBER.match(self.DIGIT_FIX.get(w['text'], w['text']))), None)
            if next_marker is not None:
                name_words += [w for w in next_labels
                               if marker['xMin'] + .2 <= w['xMin']
                               and w['xMax'] < next_marker['xMin']]
        if match[2]:
            name_words.append({**marker, 'text': match[2],
                               'xMin': marker['xMin'] + 4.5 * len(match[1])})
        near = self.row_words(words, y)
        texts, owners = self.band_amounts(near, self.SUBJ_BANDS, anomalies)
        exec_texts, exec_owners = self.executed(words, y, anomalies)
        return 'subject', {'level': level, '番号': match[1], '名称': self.rule('repair_name')(''.join(w['text'] for w in sorted(name_words, key=lambda w: (w['yMin'], w['xMin'])))),
                           **self.positioned_amounts(self.BUDGET, texts, dict(zip(self.BUDGET, owners)), page),
                           **self.positioned_amounts(self.EXECUTED, [exec_texts[k] for k in self.EXECUTED],
                                                exec_owners, page),
                           '翌年度繰越額_区分': exec_texts['翌年度繰越額_区分'],
                           '備考': None, **self.location(page, y, labels + name_words)}

    def setsu_record(self, words, row, page, y, name_high, anomalies):
        markers = [w for w in row if self.SETSU_NUM[0] <= w['xMin'] and w['xMax'] <= self.SETSU_NUM[1]]
        if len(markers) != 1 or not self.NUMBER.fullmatch(markers[0]['text']):
            raise ValueError(f'Missing section number at page {page}, y={y}')
        name_words = [w for w in words if self.SETSU_NAME[0] <= w['xMin'] and w['xMax'] <= self.SETSU_BANDS[0][0]
                      and y - 7.5 <= w['yMin'] < name_high]
        near = self.row_words(words, y)
        setsu_texts, setsu_owners = self.band_amounts(near, self.SETSU_BANDS, anomalies)
        exec_texts, exec_owners = self.executed(words, y, anomalies)
        return {'区分_番号': markers[0]['text'], '区分_名称': self.rule('repair_name')(''.join(w['text'] for w in sorted(name_words, key=lambda w: (w['yMin'], w['xMin'])))),
                **self.positioned_amounts(['金額'], setsu_texts[:1], {'金額': setsu_owners[0]}, page),
                **self.positioned_amounts(self.EXECUTED, [exec_texts[k] for k in self.EXECUTED],
                                     exec_owners, page),
                '翌年度繰越額_区分': exec_texts['翌年度繰越額_区分'],
                '備考': None, **self.location(page, y, markers + name_words)}

    def amount_text(self, words):
        value = ''.join(self.rule('normalize')(self.DIGIT_FIX.get(w['text'], w['text']))
                        for w in sorted(words, key=lambda w: w['xMin']))
        return value if self.AMOUNT.fullmatch(value) else None

    def split_row(self, row):
        """The printed amount is the contiguous run of digit-like tokens at the
        row's right edge; names may carry digits mid-row (号・条 numbers)."""
        amounts = []
        next_x = None
        for w in reversed(row):
            # Stray digits can sit far left of an amount (e.g. a misprinted '1'
            # 40pt ahead of '22,612,264'); amount digits pack within ~5pt.
            if (w['text'] and all(ch in self.AMOUNT_CHARS for ch in w['text'])
                    and (next_x is None or next_x - w['xMax'] <= 8)):
                amounts.insert(0, w)
                next_x = w['xMin']
            else:
                break
        if not any(ch in '0123456789゜' for w in amounts for ch in w['text']):
            amounts = []
        return row[:len(row) - len(amounts)], amounts

    def is_breakdown(self, cell):
        """A ruled cell is a breakdown when it holds numbered/heading items or
        repeated name+amount rows; remark cells carry free text only. Lines that
        read as dates/resolution references never count as items."""
        headings = numbered = pairs = 0
        for index, (page, row) in enumerate(cell['rows']):
            names, amounts = self.split_row(row)
            if not names:
                continue
            first = names[0]
            if (first['text'] == '0' or first['text'].startswith(('〇', '○', 'O'))) and first['xMin'] < 990:
                headings += 1
            elif (self.NUMBER.fullmatch(first['text'].replace('l', '1')) and first['xMin'] < 1006
                  and len(names) > 1):
                numbered += 1
            elif amounts and not self.ANNOTATION.search(''.join(w['text'] for w in names)):
                pairs += 1
        return headings > 0 or numbered > 0 or pairs >= 2

    def retained_remark_words(self, page_rows, adopted_words):
        """Printed words of a remark cell kept only as 備考 text.

        The leading lines that name no annotation kind, minus the words an
        item adopted as its name or amount (or merged into one)."""
        lines = [[(page, (w['xMin'], w['yMin'], w['xMax'], w['yMax']), w['text']) for w in row]
                 for page, row in page_rows]
        adopted = [(w['xMin'] - .5, w['yMin'] - .5, w['xMax'] + .5, w['yMax'] + .5) for w in adopted_words]
        return [word for line in remark_prose_lines(lines) for word in line
                if not any(b[0] <= word[1][0] and b[1] <= word[1][1] and word[1][2] <= b[2] and word[1][3] <= b[3]
                           for b in adopted)]

    def parse_breakdown(self, cell, anomalies):
        """Parse one breakdown stream into the item tree; returns (items, remarks).
        cell['rows'] are (page, words) pairs so items keep their own print page."""
        stack = []
        items = []
        remarks = []
        open_item = None    # deepest item still waiting for its amount
        saw_item = False
        carry = None        # lone glyph ending a name row (a misencoded 】 read as 1); never an amount digit
        annotation_zone = False

        def close_deeper(level):
            while stack and stack[-1]['level'] >= level:
                stack.pop()

        rows = cell['rows']
        for index, (page, row) in enumerate(rows):
            names, amounts = self.split_row(row)
            if names and len(amounts) == 1 and len(amounts[0]['text']) == 1 and amounts[0]['xMin'] >= 1100:
                carry = amounts[0]
                raw_name = ''.join(w['text'] for w in names)
                repaired = self.rule('repair_brackets')(raw_name + carry['text'])
                if repaired.endswith('】') and repaired != raw_name + carry['text']:
                    carry['coverage_text'] = '】'
                    names = [*names, carry]
                    carry = None
                    amounts = []
                elif re.search(r'[（(][^()（）]*$', raw_name):
                    # A wrapped parenthesized identifier owns its trailing digit.
                    # It is not a lone money cell (e.g. （１５ followed by １）).
                    names = [*names, carry]
                    carry = None
                    amounts = []
                else:
                    # A single printed 0/1 can be a real monetary cell.
                    carry = None
            elif carry is not None:
                anomalies.append({'page': cell['page'], 'y': row[0]['yMin'],
                                  'issue': 'lone glyph after name', 'text': carry['text']})
                carry = None
            if not names:
                if amounts:
                    value = self.amount_text(amounts)
                    if value is None:
                        raise ValueError(f'Unmeasured remarks amount at page {page}, y={row[0]["yMin"]}')
                    if open_item is None or open_item['金額'] is not None:
                        anomalies.append({'page': page, 'y': row[0]['yMin'],
                                          'issue': 'orphan amount', 'value': value})
                        remarks.append(value)
                    else:
                        open_item['金額'] = value
                        open_item['_amount_words'] = amounts
                        open_item['_amount_page'] = page
                        open_item['下端'] = row[0]['yMax']
                continue
            # Multi-digit item numbers arrive as separate tokens ('1'+'7' for 17);
            # merge all leading digit tokens inside the number column.
            names = list(names)
            while (len(names) > 1 and names[0]['xMin'] >= 985
                   and self.NUMBER.fullmatch(names[0]['text'])
                   and self.NUMBER.fullmatch(names[1]['text']) and names[1]['xMin'] < 1006):
                names[0] = {**names[0], 'text': names[0]['text'] + names[1]['text'],
                            'xMax': names[1]['xMax']}
                del names[1]
            leading = names[0]
            name_full = ''.join(w['text'] for w in names)
            value = self.amount_text(amounts) if amounts else None
            is_heading = False
            head_name = name_full
            if leading['xMin'] < 990:
                first_text = leading['text']
                if first_text in ('0', '〇', '○', 'O', 'o', '●'):
                    is_heading = True
                    head_name = ''.join(w['text'] for w in names[1:])
                elif first_text[0] in '〇○O●' and len(first_text) > 1:
                    is_heading = True
                    head_name = first_text[1:] + ''.join(w['text'] for w in names[1:])
                    anomalies.append({'page': page, 'y': row[0]['yMin'],
                                      'issue': 'merged heading glyph'})
                elif first_text.startswith('0') and len(first_text) > 1 and not first_text[1].isdigit():
                    is_heading = True
                    head_name = first_text[1:] + ''.join(w['text'] for w in names[1:])
                    anomalies.append({'page': page, 'y': row[0]['yMin'],
                                      'issue': 'merged heading glyph'})
            # A printed ○ marker can reach the text layer twice: a stray '0'
            # token plus a '〇…' word (e.g. 0 + 〇介護認定調査【介護保険課】).
            # Names never legitimately start with a marker glyph, so strip one.
            if is_heading and head_name[:1] in '0〇○Oo●':
                head_name = head_name[1:]
                anomalies.append({'page': page, 'y': row[0]['yMin'],
                                  'issue': 'duplicated heading marker'})
            number_token = leading['text'].replace('l', '1').replace('I', '1')
            is_numbered = (not is_heading and self.NUMBER.fullmatch(number_token)
                           and leading['xMin'] < 1006 and len(names) > 1)
            # A lone marker digit (e.g. a stray '0' in the heading column) is not
            # an item: keep it as remark text rather than a name-less leaf.
            if is_heading and not head_name.strip() and value is None:
                remarks.append(''.join(w['text'] for w in row))
                anomalies.append({'page': page, 'y': row[0]['yMin'],
                                  'issue': 'marker-only line'})
                continue
            if is_numbered and not ''.join(w['text'] for w in names[1:]).strip():
                remarks.append(''.join(w['text'] for w in row))
                anomalies.append({'page': page, 'y': row[0]['yMin'],
                                  'issue': 'marker-only line'})
                continue
            if is_heading or is_numbered:
                annotation_zone = False
                level = 0 if is_heading else (1 if leading['xMin'] < 995.5 else 2)
                close_deeper(level)
                if leading['text'] != number_token:
                    anomalies.append({'page': page, 'y': row[0]['yMin'],
                                      'issue': 'number glyph variant', 'text': leading['text']})
                parent = stack[-1] if level and stack else None
                if level and parent is None:
                    anomalies.append({'page': page, 'y': row[0]['yMin'],
                                      'issue': 'item without printed parent'})
                item = {'level': level, '番号': None if is_heading else number_token,
                        '名称': head_name if is_heading else ''.join(w['text'] for w in names[1:]),
                        '名称_x': names[1]['xMin'] if len(names) > 1 else leading['xMin'],
                        '金額': value, 'parent': parent,
                        '_amount_words': amounts if value is not None else [],
                        '_name_words': list(names),
                        '物理頁': page, '上端': row[0]['yMin'], '下端': row[0]['yMax']}
                stack.append(item)
                items.append(item)
                open_item = item
                saw_item = True
                continue
            # An affiliation line 【課名】 (optionally carrying the biz total)
            # completes the open 事業 name and amount; it is not an item. The biz
            # name tail can precede the bracket on the same line
            # (国民審査【選挙管理委員会事務局】 completing 衆議院議員選挙及び…).
            probe = self.rule('repair_brackets')(name_full)
            if '【' in probe and (probe.startswith('【')
                                 or (open_item is not None and open_item['level'] == 0
                                     and open_item['金額'] is None)):
                biz = next((it for it in reversed(stack) if it['level'] == 0), None)
                if biz is not None:
                    biz['名称'] += name_full
                    biz['_name_words'].extend(names)
                    biz['下端'] = row[0]['yMax']
                    if value is not None:
                        if biz['金額'] is None:
                            biz['金額'] = value
                            biz['_amount_words'] = amounts
                            biz['_amount_page'] = page
                        elif biz['金額'] != value:
                            anomalies.append({'page': page, 'y': row[0]['yMin'],
                                              'issue': 'conflicting biz total',
                                              'value': value, 'held': biz['金額']})
                    anomalies.append({'page': page, 'y': row[0]['yMin'],
                                      'issue': 'affiliation total line'})
                    continue
            # Explanation notes (流用・充当・繰越分不用額・議決・説明) are not
            # expenditure items; they stay remarks and open an annotation zone
            # until the next heading/numbered line.
            if self.ANNOTATION.search(name_full):
                annotation_zone = True
                remarks.append(''.join(w['text'] for w in row))
                anomalies.append({'page': page, 'y': row[0]['yMin'],
                                  'issue': 'annotation inside breakdown'})
                continue
            if annotation_zone and not is_numbered:
                remarks.append(''.join(w['text'] for w in row))
                continue
            # Wrapped name of an item still awaiting its amount: continuations
            # align with the item's name column, except name tails that wrap all
            # the way back to the left margin — those keep their own amount too.
            if (open_item is not None and open_item['金額'] is None
                    and (abs(leading['xMin'] - open_item['名称_x']) <= 9
                         or value is not None)):
                open_item['名称'] += name_full
                open_item['_name_words'].extend(names)
                open_item['下端'] = row[0]['yMax']
                if value is not None:
                    open_item['金額'] = value
                    open_item['_amount_words'] = amounts
                    open_item['_amount_page'] = page
                continue
            # A new unnumbered item: name+amount on one line, or a name line
            # followed by an amount-only line.
            nxt = rows[index + 1] if index + 1 < len(rows) else None
            n_names, n_amounts = self.split_row(nxt[1]) if nxt is not None else ([], [])
            # An unmarked name in the heading column followed by a 【課名】 line is
            # a 事業 heading whose ○ marker never reached the text layer.
            if (value is None and leading['xMin'] < 998 and nxt is not None
                    and n_names and self.rule('repair_brackets')(
                        ''.join(w['text'] for w in n_names)).startswith('【')):
                close_deeper(0)
                item = {'level': 0, '番号': None, '名称': name_full,
                        '名称_x': leading['xMin'], '金額': None, 'parent': None,
                        '_amount_words': [], '_name_words': list(names),
                        '物理頁': page, '上端': row[0]['yMin'], '下端': row[0]['yMax']}
                stack.insert(0, item)
                items.append(item)
                open_item = item
                saw_item = True
                anomalies.append({'page': page, 'y': row[0]['yMin'],
                                  'issue': 'unmarked heading'})
                continue
            is_pair_item = value is not None or (nxt is not None and not n_names and n_amounts
                                                 and len(name_full) > 2)
            if is_pair_item:
                # An unmarked name starting in the heading column is a 事業 whose
                # ○ marker was lost to the text layer (e.g. merged into digits).
                level = 0 if leading['xMin'] < 998 else (min(stack[-1]['level'] + 1, 2) if stack else 1)
                if level != 0 and stack and len(stack) <= 2 and leading['xMin'] < stack[-1]['名称_x'] - 4:
                    level = 1
                close_deeper(level)
                parent = stack[-1] if level and stack else None
                item = {'level': level, '番号': None, '名称': name_full,
                        '名称_x': leading['xMin'], '金額': value,
                        'parent': parent,
                        '_amount_words': amounts if value is not None else [],
                        '_name_words': list(names),
                        '物理頁': page, '上端': row[0]['yMin'], '下端': row[0]['yMax']}
                stack.append(item)
                items.append(item)
                open_item = item
                saw_item = True
                anomalies.append({'page': page, 'y': row[0]['yMin'],
                                  'issue': 'unnumbered item'})
                continue
            # A wrapped name tail after the amount was already assigned: very short
            # fragments aligned to the item's name column continue the name.
            if (open_item is not None and value is None and len(name_full) <= 6
                    and abs(leading['xMin'] - open_item['名称_x']) <= 9):
                open_item['名称'] += name_full
                open_item['_name_words'].extend(names)
                open_item['下端'] = row[0]['yMax']
                continue
            remarks.append(''.join(w['text'] for w in row))
            anomalies.append({'page': page, 'y': row[0]['yMin'],
                              'issue': 'text inside breakdown'})
        if open_item is not None and open_item['金額'] is None and open_item['level'] != 0:
            anomalies.append({'page': cell['page'], 'issue': 'item without amount',
                              'name': open_item['名称']})
        return items, remarks

    def build(self, pages, note_left=_DEFAULT):
        """Assemble leaf rows; remarks-column lines attach to the subject whose
        printed row region contains them (breakdowns go to that subject's stream)."""
        if note_left is _DEFAULT:
            note_left = self.NOTE_LEFT
        current = {}
        parents = []
        total_rows = []
        anomalies = []
        cells_seen = []
        anchors = []          # (page, y, kind, path, record, context), document order
        setsu_rows = []
        breakdown_rows = []
        subject_anchors = []  # subject anchors only, document order
        streams = {}          # subject record id -> {record, context, rows, page}
        stream_order = []
        retained = []         # remark words kept only as 備考 text (declared non-adopted)

        for page, words in pages:
            body = [w for w in words if self.BODY_TOP <= w['yMin'] < self.BODY_BOTTOM]
            events = []
            for row in self.lines(body):
                labelled = [w for w in row if w['xMin'] < self.SUBJ_BANDS[0][0]]
                if labelled and any(self.SUBJ_BANDS[0][0] <= w['xMin'] < self.SUBJ_BANDS[-1][1]
                                    and (self.AMOUNT.fullmatch(self.rule('normalize')(w['text'])) or w['text'] in self.GLYPH_FIX)
                                    for w in row):
                    events.append((row[0]['yMin'], 'subject', row))
                if any(self.SETSU_NUM[0] <= w['xMin'] and w['xMax'] <= self.SETSU_NUM[1] and self.NUMBER.fullmatch(w['text'])
                       for w in row):
                    events.append((row[0]['yMin'], 'setsu', row))
            events.sort(key=lambda e: e[0])
            if len(events) != len({round(e[0], 1) for e in events}):
                raise ValueError(f'Shared subject/section baseline at page {page}')
            page_anchors = []
            # Wrapped names run to the next printed line of the SAME kind: a 目
            # name may span lines carrying unrelated 節 rows, and a 節 name may
            # span lines carrying subject rows on the left printed page.
            subject_ys = [e[0] for e in events if e[1] == 'subject']
            setsu_ys = [e[0] for e in events if e[1] == 'setsu']
            subject_rows = [e[2] for e in events if e[1] == 'subject']
            subject_index = 0
            for index, (y, kind, row) in enumerate(events):
                bound_list = subject_ys if kind == 'subject' else setsu_ys
                name_high = next((by for by in bound_list if by > y), self.BODY_BOTTOM) - 1.0
                if kind == 'subject':
                    next_row = (subject_rows[subject_index + 1]
                                if subject_index + 1 < len(subject_rows) else None)
                    subject_index += 1
                    which, record = self.subject_record(body, row, page, y, name_high, anomalies,
                                                   next_row=next_row)
                    if which == 'total':
                        total_rows.append({'page': page, 'y': y, **record})
                        continue
                    level = record['level']
                    if level == '款':
                        current = {}
                    elif level == '項':
                        current.pop('目', None)
                    current[level] = record
                    path = tuple(current[a]['番号'] for a in ('款', '項', '目') if a in current)
                    parents.append({**record, 'path': path, 'record_ref': record})
                    page_anchors.append((page, y, 'subject', path, record, dict(current)))
                    subject_anchors.append(page_anchors[-1])
                else:
                    if set(current) != {'款', '項', '目'}:
                        raise ValueError(f'Missing printed path at page {page}, y={y}')
                    record = self.setsu_record(body, row, page, y, name_high, anomalies)
                    path = tuple(current[a]['番号'] for a in ('款', '項', '目')) + (record['区分_番号'],)
                    page_anchors.append((page, y, 'setsu', path, record, dict(current)))
            anchors.extend(page_anchors)
            for a in page_anchors:
                if a[2] != 'setsu':
                    continue
                path, _, record, context = a[3], a[2], a[4], a[5]
                # Materialize the leaf after remark streams run, so 目_備考
                # additions from breakdown parsing are visible on the lineage.
                setsu_rows.append((page, record['上端'], record, context))
            # Remarks-column lines route to the latest subject anchor's stream.
            # Ownership follows document order: the last subject anchor before
            # this line, comparing (page, y) so later anchors never claim earlier
            # lines and page-top continuations keep the previous subject.
            # Amount cells sit right of the note column's rule (x=975); a token
            # straddling x=982 is split so a merged ○ marker is recovered, but the
            # amount-side fragments (x<982) must not leak into the remark stream —
            # e.g. the last digit of 1,101,960 in 不用額 fakes a '0' marker/item.
            note_rows = self.lines([w for w in body if w['xMin'] >= note_left
                               and not (w.get('frag') and w['xMin'] < self.BOUNDARY_X)])
            for row in note_rows:
                y = row[0]['yMin']
                earlier = [a for a in subject_anchors if (a[0], a[1]) <= (page, y + 1.5)]
                owner = earlier[-1] if earlier else None
                if owner is None:
                    raise ValueError(f'Remarks line without an owner at page {page}, y={y}')
                key = id(owner[4])
                if key not in streams:
                    streams[key] = {'record': owner[4], 'context': owner[5], 'rows': [], 'page': page}
                    stream_order.append(key)
                streams[key]['rows'].append((page, row))
            cells_seen.append({'page': page, 'subject_rows': len(page_anchors),
                               'note_lines': len(note_rows)})

        for key in stream_order:
            stream = streams[key]
            record, context = stream['record'], stream['context']
            pseudo = {'rows': stream['rows'], 'page': stream['page']}
            if self.is_breakdown(pseudo):
                items, remarks = self.parse_breakdown(pseudo, anomalies)
                retained.extend(self.retained_remark_words(
                    stream['rows'], [w for it in items for w in (*it['_name_words'], *it['_amount_words'])]))
                cells_seen.append({'kind': 'breakdown', 'page': stream['page'],
                                   'owner': record['番号'], 'items': len(items)})
                if remarks:
                    addition = '\n'.join(remarks)
                    record['備考'] = addition if record['備考'] is None else record['備考'] + '\n' + addition
                leaves = [it for it in items if not any(o['parent'] is it for o in items)]
                for it in leaves:
                    leaf = {}
                    for level in ('款', '項', '目'):
                        if level in context:
                            leaf.update({level + '_' + k: v for k, v in context[level].items() if k != 'level'})
                    chain = []
                    node = it
                    while node is not None:
                        chain.append(node)
                        node = node['parent']
                    for node in chain:
                        prefix = {0: '実施事業_', 1: '項目_', 2: '細目_'}[node['level']]
                        if node['level']:
                            leaf[prefix + '番号'] = node['番号']
                        leaf[prefix + '名称'] = self.rule('repair_name')(node['名称'], node['level'] == 0)
                        leaf[prefix + '金額'] = node['金額']
                        for field in ('物理頁', '上端', '下端'):
                            leaf[prefix + field] = node[field]
                        name_boxes = self.boxes(node.get('_name_words', []))
                        if name_boxes:
                            leaf[prefix + '左端'] = min(b[0] for b in name_boxes)
                            leaf[prefix + '右端'] = max(b[2] for b in name_boxes)
                        else:
                            leaf[prefix + '左端'] = leaf[prefix + '右端'] = None
                        amount_words = node.get('_amount_words', [])
                        if node['金額'] is not None and not amount_words:
                            raise ValueError('Printed breakdown amount without word boxes')
                        leaf.update(amount_position_fields(prefix + '金額', node.get('_amount_page', node['物理頁']), self.boxes(amount_words))
                                    if amount_words else null_position_fields(prefix + '金額'))
                    leaf['物理頁'] = it['物理頁']
                    leaf['上端'] = it['上端']
                    leaf['下端'] = it['下端']
                    breakdown_rows.append((it['物理頁'], it['上端'], leaf))
            else:
                remarks = [self.rule('repair_name')(''.join(w['text'] for w in row[1])) for row in stream['rows']]
                retained.extend(self.retained_remark_words(stream['rows'], []))
                cells_seen.append({'kind': 'remark', 'page': stream['page'], 'owner': record['番号']})
                if remarks:
                    # A remark confined to one 節 band belongs to that 節.
                    setsu = [a for a in anchors if a[2] == 'setsu'
                           and stream['rows'] and a[4] is not record
                           and a[5].get('目') is context.get('目')]
                    def band_end(a):
                        return next((b[1] for b in anchors if b[0] == a[0] and b[1] > a[1]), self.BODY_BOTTOM + 30)
                    band = [a for a in setsu
                            if all(r[0] == a[0] and a[1] - 1 <= r[1][0]['yMin'] < band_end(a)
                                   for r in stream['rows'])]
                    target = band[0][4] if len(band) == 1 else record
                    addition = '\n'.join(remarks)
                    target['備考'] = addition if target['備考'] is None else target['備考'] + '\n' + addition
                    if len(band) == 1:
                        anomalies.append({'issue': 'setsu-scoped remark', 'page': stream['page'],
                                          'setsu': band[0][3]})

        # 目 with neither 節 rows nor breakdown items is its own leaf row.
        with_setsu = {id(a[5]['目']) for a in anchors if a[2] == 'setsu'}
        with_detail = {key for key in stream_order
                       if self.is_breakdown({'rows': streams[key]['rows'], 'page': 0})}
        for record in parents:
            if record['level'] != '目' or id(record['record_ref']) in with_setsu or id(record['record_ref']) in with_detail:
                continue
            ctx = next((a[5] for a in anchors if a[4] is record['record_ref']), None)
            setsu_rows.append((record['物理頁'], record['上端'], {}, ctx))
        if len(total_rows) > 1:
            raise ValueError('Expected one printed detail expenditure total')
        out = []
        for page, y, record, context in setsu_rows:
            leaf = {}
            for level in ('款', '項', '目'):
                leaf.update({level + '_' + k: v for k, v in context[level].items() if k != 'level'})
            leaf.update({'節_' + k.removeprefix('区分_'): v for k, v in record.items()
                         if k != 'level'})
            out.append((page, y, leaf))
        return out, breakdown_rows, parents, cells_seen, total_rows, anomalies, retained

    def metadata(self, columns, account, kind):
        amounts = [c for c in columns if c in self.BUDGET + self.EXECUTED
                   or c.endswith('_金額') or any(c.endswith('_' + k) for k in self.BUDGET + self.EXECUTED)]
        contexts = []
        for level in ('款', '項', '目'):
            contexts.append({'columns': [c for c in columns if c.startswith(level + '_')],
                             'header_path': ['科目', level],
                             'grain_columns': [level + '_番号', level + '_物理頁', level + '_上端']})
        if kind == 'details':
            contexts.append({'columns': [c for c in columns if c.startswith('節_')],
                             'header_path': ['節'], 'semantic_role': 'setsu',
                             'grain_columns': ['目_物理頁', '目_上端', '節_番号']})
        else:
            for level in ('実施事業', '項目', '細目'):
                contexts.append({'columns': [c for c in columns if c.startswith(level + '_')],
                                 'header_path': ['備考'],
                                 'grain_columns': [level + '_物理頁', level + '_上端']})
        note = ('原典の同一目には節の財政明細行と目単位の事業内訳という親子関係のない2つの印字分解が併記される。'
                '所属する款・項・目の予算5列・執行3列・備考・印字位置を反復する。'
                '内訳項目行は備考欄の罫線セルに印字される支出済額の階層内訳で、'
                '事業（印字○、文字層では0）→番号付き項目→番号付き細目の最末端を葉とし、'
                '事業名【所管】・項目・細目の名称と金額を階層列へ展開する。'
                '内訳金額欄に印字見出しはなく、右端整列の金額を各項目へ対応させる。'
                '番号のない名称+金額行は番号NULLの内訳項目。'
                '節も内訳もない目は目自体を葉として節表に載せる。'
                '内訳項目の所属は罫線セルが覆う節ブロックの目まで（個々の節への割当は原典にない）。'
                '備考欄の金額構造を持たない単文はowner行の備考へ保持する。'
                '金額セルは1文字ずつの語に分かれるため列内で結合し、'
                '文字層の「•」「゜」は印字の「△」「0」へ復元する。'
                '原典は1物理頁=左右印字2頁の見開きで、左頁に科目・予算、右頁に節・執行・備考が印字される。'
                f'見開き末尾の「{account}」会計標・各頁の実行見出し・印字頁番号は明細ではないため除く。')
        return {'units': [{'text': '円', 'scope': {'kind': 'columns', 'columns': amounts}}],
                'notes': [{'text': note, 'scope': {'kind': 'table'}}],
                'column_contexts': contexts}

    def convert(self, inputs, destination, options):
        if len(inputs) != 1:
            raise ValueError('Suginami general settlement requires one original')
        source = inputs[0]
        if (source['target']['document_kind'] != 'settlement'
                or source['direction'] != 'expenditure' or source['format'] != 'pdf' or source['pdf_type'] != 'text'):
            raise ValueError('This measured layout is Suginami text settlement expenditure only')
        account = options.get('account', '一般会計')
        selected = [p for scope in source['scope'] if scope['account'] == account
                    for first, last in scope['pages'] for p in range(first, last + 1)]
        if not selected or sorted(selected) != list(range(selected[0], selected[-1] + 1)):
            raise ValueError(f'Measured scope for {account} must be one contiguous page range')
        destination = Path(destination)
        observations = destination / 'suginami-observations'
        observations.mkdir(parents=True, exist_ok=True)
        pages = self.observe(source['path'], selected[0], selected[-1], observations / 'detail-bbox.html')
        setsu_rows, breakdown_rows, parents, cells_seen, total_rows, anomalies, retained = self.build(pages, options.get('note_left', self.NOTE_LEFT))
        (observations / 'parents.json').write_text(json.dumps({'detail': parents}, ensure_ascii=False, indent=2) + '\n')
        (observations / 'note-cells.json').write_text(json.dumps(
            {'cells': cells_seen}, ensure_ascii=False, indent=2) + '\n')
        (observations / 'totals.json').write_text(json.dumps(total_rows, ensure_ascii=False, indent=2) + '\n')
        (observations / 'anomalies.json').write_text(json.dumps(anomalies, ensure_ascii=False, indent=2) + '\n')
        (observations / 'repairs.json').write_text(json.dumps(
            {'hits': dict(sorted(self.REPAIR_HITS.items()))}, ensure_ascii=False, indent=2) + '\n')
        prefix = options['table_prefix']
        emit = options.get('emit') or ('details', 'notes')
        results = {}
        for kind, collected, order in (('details', setsu_rows, self.SETSU_COLUMNS),
                                       ('notes', breakdown_rows, self.BREAKDOWN_COLUMNS)):
            if kind not in emit:
                continue
            collected.sort(key=lambda r: (r[0], r[1]))
            rows = [{k: row.get(k) for k in order} for _, _, row in collected]
            if not rows:
                raise ValueError(f'No {kind} rows produced')
            columns = tuple(ParquetColumn(k, 'BIGINT' if k == '物理頁' or k.endswith('_物理頁')
                                          else 'DOUBLE' if k in ('左端', '上端', '右端', '下端')
                                          or k.endswith(('_左端', '_上端', '_右端', '_下端'))
                                          else 'VARCHAR') for k in order)
            table_id = f'{prefix}-{kind}'
            output = write_conversion(destination / (table_id + '.parquet'), rows, columns=columns,
                                      context=ConversionContext(source['sha256'], table_id, __file__))
            write_coverage_words(Path(output.path),
                                 [(page, (w['xMin'], w['yMin'], w['xMax'], w['yMax']), w.get('coverage_text', w['text']))
                                  for page, words in pages for w in words
                                  if self.BODY_TOP <= w['yMin'] < self.BODY_BOTTOM],
                                 amount_columns=self.AMOUNT_COLUMNS if kind == 'details' else (),
                                 excluded_regions=coverage_regions(retained, kind='経費内訳', reason=self.UCHIWAKE_REASON))
            results[table_id] = {'path': Path(output.path), 'metadata': self.metadata(order, account, kind)}
        return results
