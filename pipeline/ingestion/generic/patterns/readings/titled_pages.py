"""A budget statement whose 款・項 are each page's title (墨田区の予算説明書).

Each page prints `款 1 議会費  項 1 議会費  （単位 千円）` above one frame. The frame holds the 目 (its code, name and
本年度・前年度・比較), the 節 (区分・金額) and, at the right, the 計上説明: for each 目, first a ruled block of its 財源内訳
(the source names over their amounts), then the explanation, whose items are numbered `1`・`⑴`・`ア`… with their
amount at the right end and the unit printed under it (`440,861` / `千円`). The 項 prints its total on a `計` row at
the foot of its last page; the 款 prints none. Only the first page of a spread prints the column headings; the facing
page draws the same columns with none, and a 目 that runs on prints its name again in parentheses (`（議会費）`).

The reading builds the printed tree directly (科目・節・説明 and the 債務負担行為 notes of the explanation) and hands
the node and amount tables with the digit-coverage scope to the shared checks. What it reads but does not take in
(the 財源内訳 blocks, the quantity tables and the prose of the explanation, the titles a page repeats) is described as
coverage exclusions from where it found them. Column edges, the item markers and the words of a note are the profile's.
"""
from __future__ import annotations

from collections import defaultdict
import hashlib
import json
import re
import unicodedata
from pathlib import Path

from ingestion.fiscal.manifest import sha_file
from ingestion.generic.observe import Page, Word, observe
from ingestion.generic.reading import Reading
from ingestion.lib.node_tables import AMOUNT_COLUMNS, NODE_COLUMNS, write_coverage_words
from ingestion.lib.parquet import write_parquet

AMOUNT = re.compile(r'^[△▲]?(?:[0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)$')
CODE = re.compile(r'^([0-9]+)(.*)$')
FULL_WIDTH_DIGITS = str.maketrans('０１２３４５６７８９', '0123456789')
LINE = 2.5   # points: words of one printed line
JOIN = 3.0   # points: fragments of one printed number (`562,` `750`) abut
EDGE = 2.0   # points: a rule of the page at a column edge of the profile


def compact(value: str) -> str:
    return re.sub(r'\s+', '', unicodedata.normalize('NFKC', value))


def name_of(text: str) -> str:
    """A wrapped 目・節 name without the `…` its lines end with."""
    return text.replace('...', '')


def lines(words, tolerance=LINE):
    result = []
    for word in sorted(words, key=lambda w: (w.y0, w.x0)):
        if result and abs(word.y0 - result[-1][0].y0) <= tolerance:
            result[-1].append(word)
        else:
            result.append([word])
    return [sorted(line, key=lambda w: w.x0) for line in result]


def centered_codes(found):
    """A name in two or three lines prints its code on the second (`使用料及び` / `13` / `賃借料`, `高額介護予防…` /
    `4 サービス費相当…` / `事業費`): the code's line takes the line just above it as the start of its name."""
    result = []
    for line in found:
        text = compact(''.join(w.text for w in line))
        above = result[-1] if result else None
        if CODE.match(text) and above is not None and line[0].y0 - above[0].y0 <= 10 \
                and not CODE.match(compact(''.join(w.text for w in above))):
            first = line[0]
            code, rest = re.match(r'^([0-9]+)(.*)$', first.text.strip()).groups()
            head = [Word(code, first.x0, first.y0, first.x1, first.y1)]
            tail = [Word(rest, first.x0, first.y0, first.x1, first.y1)] if rest else []
            result[-1] = [*head, *above, *tail, *line[1:]]
        else:
            result.append(line)
    return result


def repeats(text, name):
    """A line of the name of a 目 printed again on the page it runs on to: in parentheses, cut with `…`, or wrapped."""
    bare = text.strip('()').replace('...', '')
    return bool(bare) and (bare in name)


def trimmed(word):
    """A word the text layer opens with tabs (`\\t\\t\\t\\t13使用料及び` from the 目 column to the 節 column):
    its box starts where its printed characters do, estimated from the line height (full-width) and half for ASCII."""
    text = word.text.strip()
    if text == word.text:
        return word
    height = word.y1 - word.y0
    width = sum(height * (.5 if ord(c) < 128 else 1.0) for c in text)
    if word.text[:1].isspace():
        return Word(text, max(word.x0, word.x1 - width), word.y0, word.x1, word.y1)
    return Word(text, word.x0, word.y0, min(word.x1, word.x0 + width), word.y1)


def box(words):
    return (min(w.x0 for w in words), min(w.y0 for w in words), max(w.x1 for w in words), max(w.y1 for w in words))


def inside(word, x_range):
    middle = (word.x0 + word.x1) / 2
    return x_range[0] <= middle < x_range[1]


def numbers(words):
    """Runs of abutting amount fragments in a line (`562,` `750` → `562,750`), each with its words."""
    runs = []
    for word in words:
        if runs and runs[-1] is not None and word.x0 - runs[-1][-1].x1 <= JOIN and re.fullmatch(r'[0-9,]+[)）]?', word.text) \
                and runs[-1][-1].text.endswith(','):
            runs[-1].append(word)
        elif re.fullmatch(r'[△▲]?[0-9,]+[)）]?', word.text):
            runs.append([word])
        else:
            runs.append(None)
    result = []
    for run in runs:
        if run is None:
            continue
        value = ''.join(w.text for w in run).rstrip(')）')   # `611）` closes a 目 printed in parentheses
        if AMOUNT.fullmatch(value):
            result.append((value, run))
    return result


def node_key(page, x0, y0, axis):
    return 'n-' + hashlib.sha256(f'{page}:{x0:.2f}:{y0:.2f}:{axis}'.encode()).hexdigest()[:24]


class Reader(Reading):
    REQUIRED_RULES = []

    def __init__(self, profile, workflow):
        super().__init__(profile, workflow)
        self.profile = profile
        columns = profile['columns']
        self.SUBJECT = tuple(columns['subject'])
        self.SUBJECT_AMOUNTS = [(c['header'], tuple(c['x'])) for c in columns['subject_amounts']]
        self.SETSU = tuple(columns['setsu'])
        self.SETSU_AMOUNT = (columns['setsu_amount']['header'], tuple(columns['setsu_amount']['x']))
        self.EXPLANATION = tuple(columns['explanation'])
        self.ITEM_AMOUNT_LEFT = profile['item_amount_left']
        self.MARKER_REACH = profile['marker_reach']
        self.WRAP_REACH = profile.get('wrap_reach', 0)
        self.MARKER_EDGES = profile['marker_edges']
        self.MARKERS = [re.compile(pattern) for pattern in profile['markers']]
        self.FUNDING_RULE = tuple(profile['funding_rule'])
        self.NOTE_KINDS = profile['note_kinds']
        self.TOTAL = profile['total_label']
        self.FRAME = (self.SUBJECT[0], self.EXPLANATION[1])

    # The frame of a page: its rules across the whole width, the first and the last.
    def frame(self, page):
        full = sorted(r.y0 for r in page.rules if not r.vertical
                      and r.x0 <= self.FRAME[0] + EDGE and r.x1 >= self.FRAME[1] - EDGE)
        if len(full) < 2:
            return None
        top, bottom = full[0], full[-1]
        verticals = sorted({round(r.x0, 1) for r in page.rules if r.vertical and r.y1 - r.y0 > (bottom - top) / 2})
        edges = [self.SUBJECT[0], self.SUBJECT[1], *[x for _, (x, _) in self.SUBJECT_AMOUNTS],
                 self.SETSU[0], self.SETSU[1], self.SETSU_AMOUNT[1][1], self.EXPLANATION[1]]
        missing = [x for x in edges if not any(abs(x - v) <= EDGE for v in verticals)]
        if missing:
            raise ValueError(f'Page {page.number}: the frame draws no column rule at {missing}')
        # The headings: a second rule across the frame close below its top, with the 目 heading between.
        below = [y for y in full[1:] if y - top < 80]
        heading = below and any(compact(w.text) == '目' and inside(w, self.SUBJECT) and top < w.y0 < below[0]
                                for w in page.words)
        return top, (below[0] if heading else top), bottom

    def title(self, page, top):
        """`款 1 議会費 項 1 議会費 （単位 千円）`: the 款 and 項 with their words, and the unit."""
        words = sorted([w for w in page.words if w.y1 <= top + 1], key=lambda w: w.x0)
        result, current = {'款': None, '項': None, 'unit': None, 'folio': []}, None
        closed = False   # a 款・項 of the year before that this year budgets 0: in parentheses, with no code
        for word in words:
            text = compact(word.text)
            if text.startswith('(') and text[1:] in ('款', '項'):
                closed, text = True, text[1:]
            if text in ('款', '項'):
                current = {'level': text, 'code': None, 'name': '', 'words': [word], 'code_words': [word]}
                result[text] = current
            elif text.startswith('(単位'):
                current = None
                found = re.search(r'(千円|円)', text)
                result['unit'] = found.group(1) if found else 'pending'
            elif result['unit'] == 'pending':
                found = re.search(r'(千円|円)', text)
                result['unit'] = found.group(1) if found else None
            elif result['unit'] is not None and re.fullmatch(r'[0-9]+', text):
                result['folio'].append(word)   # the page number printed at the right end of the title
            elif current is not None:
                current['words'].append(word)
                if current['code'] is None and re.fullmatch(r'[0-9]+', text):
                    current['code'] = text
                    current['code_words'].append(word)
                else:
                    current['name'] += text.rstrip(')') if closed else text
        if not result['款'] or not result['項'] or (not closed and not (result['款']['code'] and result['項']['code'])):
            raise ValueError(f'Page {page.number}: no 款・項 title above the frame')
        if result['unit'] not in ('千円', '円'):
            raise ValueError(f'Page {page.number}: no unit in the title')
        return result

    def funding_bands(self, page, top, bottom):
        """The ruled bands of the 財源内訳: two rules across the 計上説明 with a rule of its columns between them."""
        across = sorted({r.y0 for r in page.rules if not r.vertical and r.x0 <= self.EXPLANATION[0] + EDGE
                         and r.x1 >= self.EXPLANATION[1] - EDGE and top - 1 <= r.y0 <= bottom + 1})
        columns = [r for r in page.rules if r.vertical and self.FUNDING_RULE[0] <= r.x0 <= self.FUNDING_RULE[1]]
        bands = []
        for upper, lower in zip(across, across[1:]):
            middle = (upper + lower) / 2
            if any(r.y0 - 1 <= middle <= r.y1 + 1 for r in columns):
                bands.append((upper, lower))
        return bands

    def convert(self, inputs, destination, options):
        if len(inputs) != 1:
            raise ValueError('One original makes one table')
        source = inputs[0]
        if source['format'] != 'pdf' or source['pdf_type'] != 'text' or source['direction'] != 'expenditure':
            raise ValueError('Expected the expenditure of a text PDF')
        if sha_file(source['path']) != source['sha256']:
            raise ValueError('Original SHA differs')
        scopes = [s for s in source['scope'] if s['account'] == options['account']
                  and s.get('direction', 'expenditure') == 'expenditure']
        if len(scopes) != 1:
            raise ValueError(f'Expected one selected scope of the account {options["account"]}')
        scope = scopes[0]
        numbers_ = [p for first, last in scope['pages'] for p in range(first, last + 1)]
        observed = [Page(p.number, p.width, p.height, [trimmed(w) for w in p.words if w.text.strip()], p.rules)
                    for p in observe(Path(source['path']), numbers_)]
        folder = Path(destination)
        table_id = options['table_id']
        built = self.build(observed, table_id)
        nodes_path = folder / f'{table_id}-nodes.parquet'
        amounts_path = folder / f'{table_id}-amounts.parquet'
        write_parquet(nodes_path, [{c.name: n[c.name] for c in NODE_COLUMNS} for n in built['nodes']], columns=NODE_COLUMNS)
        write_parquet(amounts_path, [{c.name: a[c.name] for c in AMOUNT_COLUMNS} for a in built['amounts']],
                      columns=AMOUNT_COLUMNS)
        write_coverage_words(folder / f'{table_id}.parquet', built['words'], amount_columns=built['amount_columns'],
                             excluded_regions=built['excluded'])
        (folder / f'{table_id}.reading.json').write_text(json.dumps(built['report'], ensure_ascii=False, indent=1) + '\n')
        return {table_id: {'nodes': nodes_path, 'amounts': amounts_path, 'notes': built['notes']}}

    def build(self, pages, table_id):
        nodes, amounts, words, excluded = [], [], [], []
        report = defaultdict(int)
        kan = kou = moku = setsu = None
        stack: list[dict] = []   # the open explanation items of the 目, by depth
        last_item = None         # the item of the previous explanation line (a name that wraps)
        stack_moku = None        # the 目 the open items belong to
        seen_titles = set()
        unit = None
        mismatched = []

        def add_node(axis, depth, level, code, name, page, glyphs, parent):
            x0, y0, x1, y1 = box(glyphs)
            node = {'node_key': node_key(page, x0, y0, axis), 'parent_node_key': parent['node_key'] if parent else None,
                    'axis_header': axis, 'depth': depth, 'level_header': level, 'code_text': code,
                    'name_text': name or None, 'physical_page': page, 'x0': x0, 'y0': y0, 'x1': x1, 'y1': y1}
            nodes.append(node)
            return node

        def add_amount(node, header, value, run, page, unit_text):
            x0, y0, x1, y1 = box(run)
            amounts.append({'node_key': node['node_key'], 'header_path': header, 'amount_text': value,
                            'unit_text': unit_text, 'physical_page': page, 'x0': x0, 'y0': y0, 'x1': x1, 'y1': y1})

        def exclude(kind, reason, page, glyphs):
            excluded.extend({'kind': kind, 'reason': reason, 'page': page, 'bbox': list(box([w]))} for w in glyphs
                            if re.search(r'[0-9]', w.text))

        for page in pages:
            frame = self.frame(page)
            if frame is None:
                if any(re.search(r'[0-9]', w.text) for w in page.words if w.y0 < page.height * .9):
                    report['pages without a frame (digits)'] += 1
                continue
            top, body_top, bottom = frame
            title = self.title(page, top)
            if unit not in (None, title['unit']):
                raise ValueError(f'Page {page.number}: the unit changes within the account')
            unit = title['unit']
            in_frame = [w for w in page.words if self.FRAME[0] - 1 <= (w.x0 + w.x1) / 2 <= self.FRAME[1] + 1
                        and top < (w.y0 + w.y1) / 2 < bottom]
            # The title is read for its 款・項 and unit; the page number at its right end is not read.
            title_words = [w for w in page.words if w.y1 <= top + 1 and w not in title['folio']]
            words.extend((page.number, box([w]), w.text) for w in [*title_words, *in_frame])
            # The 款・項 of the title: a new one opens a node, the same again is the title the page repeats.
            key = (title['款']['code'], title['款']['name'], title['項']['code'], title['項']['name'])
            repeated = '見開きの各頁に印字する款・項の題の再掲。最初の頁の題を款・項の項目にした。'
            if kan is None or (kan['code_text'], kan['name_text']) != key[:2]:
                kan = add_node('科目', 1, '款', key[0], key[1], page.number, title['款']['words'], None)
                kou = None
            else:
                exclude('反復見出し', repeated, page.number, title['款']['code_words'])
            if kou is None or (kou['code_text'], kou['name_text']) != key[2:]:
                if key in seen_titles:
                    raise ValueError(f'Page {page.number}: the 款・項 title returns after another')
                kou = add_node('科目', 2, '項', key[2], key[3], page.number, title['項']['words'], kan)
                moku = setsu = last_item = None
                stack = []
                seen_titles.add(key)
            else:
                exclude('反復見出し', repeated, page.number, title['項']['code_words'])
            body = [w for w in in_frame if (w.y0 + w.y1) / 2 > body_top]
            # 目 column.
            subject_lines = centered_codes(lines([w for w in body if inside(w, self.SUBJECT)]))
            continuing = moku   # the 目 that runs on from the page before
            starts = []   # (y, 目 node) of the 目 that open on this page
            total_y = None
            amount_rows = [run[0].y0 for _, x_range in self.SUBJECT_AMOUNTS
                           for line in lines([w for w in body if inside(w, x_range)]) for _, run in numbers(line)]
            last_line = None   # the y of the last line of the 目 that opened last on this page
            for line in subject_lines:
                text = compact(''.join(w.text for w in line))
                found = CODE.match(text)
                y = line[0].y0
                follows = starts and last_line is not None and y - last_line <= 10
                if text.strip('()') == self.TOTAL:
                    total_y = y
                elif not starts and continuing is not None and not found and repeats(text, continuing['name_text']):
                    # The name of the 目 that runs on, printed again (`（議会費）`, `住民基本台帳…` / `事務費`).
                    report['repeated 目 names'] += 1
                elif found and found.group(2):
                    moku = add_node('科目', 3, '目', found.group(1), name_of(found.group(2)), page.number, line, kou)
                    starts.append((y, moku))
                    last_line = y
                elif not found and not follows and any(abs(r - y) <= 6 for r in amount_rows):
                    # A 目 of the year before that this year budgets 0: printed with no code, in parentheses
                    # (`（母子生活ホーム費  0  29,611  △29,611）`).
                    moku = add_node('科目', 3, '目', None, name_of(text).strip('()'), page.number, line, kou)
                    starts.append((y, moku))
                    last_line = y
                    report['目 with no code'] += 1
                elif starts and not found:
                    last_line = y
                    owner = starts[-1][1]
                    owner['name_text'] = (owner['name_text'] + name_of(text)).strip('()') if owner['code_text'] is None \
                        else owner['name_text'] + name_of(text)
                    owner['x0'], owner['y0'], owner['x1'], owner['y1'] = \
                        box([*line, _Box(owner['x0'], owner['y0'], owner['x1'], owner['y1'])])
                else:
                    raise ValueError(f'Page {page.number}: unread 目 line {text!r}')

            def owner_at(y, opened=starts):
                found = [m for top_y, m in opened if top_y <= y + 8]
                return found[-1] if found else continuing

            for header, x_range in self.SUBJECT_AMOUNTS:
                for line in lines([w for w in body if inside(w, x_range)]):
                    for value, run in numbers(line):
                        y = run[0].y0
                        if total_y is not None and abs(y - total_y) <= LINE:
                            add_amount(kou, header, value, run, page.number, unit)
                            continue
                        target = owner_at(y)
                        if target is None:
                            raise ValueError(f'Page {page.number}: {header} {value} above every 目 of the page')
                        add_amount(target, header, value, run, page.number, unit)
            # 節 column.
            setsu_starts = []
            setsu_lines = centered_codes(lines([w for w in body if inside(w, self.SETSU)]))
            for line in setsu_lines:
                text = compact(''.join(w.text for w in line))
                found = CODE.match(text)
                y = line[0].y0
                parent = owner_at(y)
                if parent is None:
                    raise ValueError(f'Page {page.number}: 節 line {text!r} belongs to no 目')
                if found and found.group(2):
                    setsu = add_node('節', 1, None, found.group(1), name_of(found.group(2)), page.number, line, parent)
                    setsu_starts.append((y, setsu))
                elif setsu is not None and setsu['parent_node_key'] == parent['node_key'] and not found:
                    setsu['name_text'] += name_of(text)
                    setsu['x0'], setsu['y0'], setsu['x1'], setsu['y1'] = \
                        box([*line, _Box(setsu['x0'], setsu['y0'], setsu['x1'], setsu['y1'])])
                else:
                    raise ValueError(f'Page {page.number}: unread 節 line {text!r}')
            header, x_range = self.SETSU_AMOUNT
            for line in lines([w for w in body if inside(w, x_range)]):
                for value, run in numbers(line):
                    y = run[0].y0
                    if total_y is not None and abs(y - total_y) <= LINE:
                        raise ValueError(f'Page {page.number}: a 節 amount on the 計 row')
                    found = [s for top_y, s in setsu_starts if top_y <= y + 6]
                    if not found:
                        raise ValueError(f'Page {page.number}: 節 amount {value} above every 節 of the page')
                    add_amount(found[-1], header, value, run, page.number, unit)
            # 計上説明: the 財源内訳 bands, then the explanation lines.
            right = [w for w in body if inside(w, self.EXPLANATION)]
            bands = self.funding_bands(page, body_top, bottom)
            in_band = lambda w: any(upper < (w.y0 + w.y1) / 2 < lower for upper, lower in bands)
            funding = [w for w in right if in_band(w)]
            exclude('財源内訳', '各目の計上説明の頭と計の行に罫線で囲んで印字する財源内訳（財源の名前の行と金額の行）は取り込まない。'
                    '財源の種類ごとの額で、目の本年度予算額の内訳の別の切り口のため。', page.number, funding)
            report['funding words'] += len(funding)
            text_words = [w for w in right if not in_band(w)]
            units = [w for w in text_words if compact(w.text) in ('千円', '円')]
            inner = [r for r in page.rules if not r.vertical and r.x0 > self.EXPLANATION[0] + EDGE
                     and r.x1 < self.EXPLANATION[1] - EDGE]
            for line in lines([w for w in text_words if w not in units]):
                y = line[0].y0
                parent = owner_at(y)
                if parent is None:
                    raise ValueError(f'Page {page.number}: explanation line above every 目 of the page')
                if parent is not stack_moku:
                    stack, last_item, stack_moku = [], None, parent
                found_numbers = numbers(line)
                tail = None
                if found_numbers:
                    value, run = found_numbers[-1]
                    unit_word = next((u for u in units if abs(u.y0 - run[-1].y0) <= 5 and -1 <= u.x0 - run[-1].x1 <= JOIN + 1
                                      or (u.y0 - run[-1].y0 > 0 and u.y0 - run[-1].y0 <= 5 and abs(u.x0 - run[-1].x1) <= JOIN)),
                                     None)
                    if line[-1] is run[-1]:
                        tail = (value, run, unit_word)
                marker = self.marker(line[0])
                is_item = marker is not None and line[0].x0 <= self.EXPLANATION[0] + self.MARKER_REACH
                if tail is not None:
                    right = tail[1][-1].x1 >= self.ITEM_AMOUNT_LEFT
                    # An item's amount ends its line with the unit under it (its right edge moves with the depth); on
                    # another line a number at the right end with its unit is the amount of an item whose name wrapped,
                    # and a number further in is the prose's (`限度額 200千円`).
                    wrapped = last_item is not None and tail[2] is not None \
                        and tail[1][-1].x1 >= self.ITEM_AMOUNT_LEFT - self.WRAP_REACH
                    if not (right or (is_item and tail[2] is not None) or (not is_item and wrapped)):
                        tail = None
                if is_item:
                    depth = self.depth_at(line[0].x0)
                    if depth != marker + 1:
                        # The marker is printed where another depth's are (`２` at the place of `⑵`): the place decides.
                        report['markers of another depth\'s shape'] += 1
                        mismatched.append(f'{page.number}頁 {compact(line[0].text)}')
                    if depth > len(stack) + 1:
                        raise ValueError(f'Page {page.number}: explanation item {compact(line[0].text)} skips a level')
                    stack = stack[:depth - 1]
                    name_words = [w for w in line[1:] if not tail or w not in tail[1]]
                    if name_words and AMOUNT.fullmatch(name_words[-1].text) and len(name_words[-1].text) > 2:
                        raise ValueError(f'Page {page.number}: item {compact(line[0].text)} ends with a number that is '
                                         f'no amount: {" ".join(w.text for w in line)}')
                    item_parent = stack[-1]['node'] if stack else parent
                    item = add_node('説明', depth, None, compact(line[0].text), compact(''.join(w.text for w in name_words)),
                                    page.number, [line[0], *name_words] if name_words else [line[0]], item_parent)
                    stack.append({'node': item})
                    if tail:
                        self.item_amount(add_amount, item, tail, page.number)
                        last_item = None
                    else:
                        last_item = item
                    if [w for w in name_words if re.search(r'[0-9]', w.text)]:
                        report['digits in item names'] += 1
                    continue
                note = self.note_kind(line)
                if note and found_numbers:
                    value, run = found_numbers[-1]
                    owner = stack[-1]['node'] if stack else parent
                    label = [w for w in line if w not in run]
                    node = add_node('注記', 1, note, None, compact(''.join(w.text for w in label)), page.number,
                                    label or run, owner)
                    add_amount(node, '注記金額', value, run, page.number, unit)
                    report[f'notes {note}'] += 1
                    continue
                if tail and last_item is not None:
                    # The amount of an item whose name wrapped onto this line.
                    last_item['name_text'] += compact(''.join(w.text for w in line if w not in tail[1]))
                    self.item_amount(add_amount, last_item, tail, page.number)
                    last_item = None
                    report['wrapped item names'] += 1
                    continue
                if tail and tail[2] is not None:
                    raise ValueError(f'Page {page.number}: an amount in 千円 at the right of a line that is no item: '
                                     f'{" ".join(w.text for w in line)}')
                last_item = None
                if any(re.search(r'[0-9]', w.text) for w in line):
                    boxed = any(r.y0 - 12 <= y <= r.y0 + 12 and r.x0 - 2 <= line[0].x0 for r in inner)
                    kind = '数量表' if boxed else '本文'
                    exclude(kind, '計上説明の文中・表中の数（単価・人数・回数・基金現在高・日付など）は事業の内訳の金額として取り込まない。'
                            '金額の内訳は番号の付いた項目と、その右端の金額（千円）だけ。', page.number, line)
                    report[f'excluded lines {kind}'] += 1
            unused_units = [u for u in units if not any(abs(a['y0'] - u.y0) <= 6 and abs(a['x1'] - u.x0) <= JOIN + 1
                                                        for a in amounts if a['physical_page'] == page.number)]
            report['units not beside an item amount'] += len(unused_units)
        report = dict(report)
        report['nodes'] = len(nodes)
        report['amounts'] = len(amounts)
        amount_columns = [{'header': header, 'x_range': list(x)} for header, x in self.SUBJECT_AMOUNTS]
        amount_columns.append({'header': self.SETSU_AMOUNT[0], 'x_range': list(self.SETSU_AMOUNT[1])})
        amount_columns.append({'header': '説明', 'x_range': [self.ITEM_AMOUNT_LEFT - 40, self.EXPLANATION[1]]})
        notes = [
            '款・項は各頁の題（款 1 議会費 項 1 議会費）から読み、項の金額は項の最後の頁の「計」の行から取った。款の金額は印字されていない。',
            '計上説明の頭と計の行の財源内訳は取り込んでいない。説明の項目は番号（1・⑴・ア…）と右端の金額（千円）で読み、'
            '文中・表中の数は取り込んでいない。印字の見出し「計上説明」の金額は共有辞書の「説明」とした。',
        ]
        if mismatched:
            notes.append(f'説明の項目の番号 {len(mismatched)} 件は、別の段の番号の形で印字されている（⑵ の位置に ２ など）。'
                         f'段は番号の印字の位置で決めた: {"・".join(mismatched)}。')
        if not nodes or not amounts:
            raise ValueError(f'{table_id}: nothing read')
        return {'nodes': nodes, 'amounts': amounts, 'words': words, 'excluded': excluded,
                'amount_columns': amount_columns, 'notes': notes, 'report': report}

    def depth_at(self, x0):
        for depth, edge in enumerate(self.MARKER_EDGES, start=1):
            if x0 < edge:
                return depth
        raise ValueError(f'An item marker at x {x0:.1f} is right of every depth')

    def marker(self, word):
        # Full-width digits are digits (`１`); the other characters as printed (NFKC makes `⑴` into `(1)`).
        text = word.text.strip().translate(FULL_WIDTH_DIGITS)
        for depth, pattern in enumerate(self.MARKERS):
            if pattern.fullmatch(text):
                return depth
        return None

    def note_kind(self, line):
        text = compact(''.join(w.text for w in line))
        for word, kind in self.NOTE_KINDS.items():
            if word in text:
                return kind
        return None

    def item_amount(self, add_amount, item, tail, page):
        value, run, unit_word = tail
        if unit_word is None:
            raise ValueError(f'Page {page}: item {item["name_text"]} prints {value} with no unit under it')
        add_amount(item, '説明', value, run, page, compact(unit_word.text))


class _Box:
    """A node's box as a word, to extend it with the words of a wrapped name."""
    def __init__(self, x0, y0, x1, y1):
        self.x0, self.y0, self.x1, self.y1 = x0, y0, x1, y1
