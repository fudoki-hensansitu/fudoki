"""A budget statement printed as spreads, with labelled budget rows and a summary of 款・項 (目黒区の予算書).

The account opens with a summary (`款 | 項 | 金額`): each 款 and 項 with its 本年度 amount, and the 歳出合計 at the
end. Then each spread prints, on its left page, the 款 and 項 on one title line above the frame
(`１款 議会費  １項 議会費`) and a frame of four columns: the 目 (its code and name), the 予算額 cell whose lines are
labelled (`本年度 580,802` / `前年度 555,718` / `比較 25,084` / `増減率(%) 4.5`), the 本年度の財源内訳 and the 節
(区分・金額). The right page is one 説明 column: for each 目, its items numbered `1`・`(1)` with their amount at the
right end. The rules across the left frame that close a 目 are drawn at the same heights across the right frame, so
an explanation line belongs to the 目 whose cell it stands in; a cell with no 目 continues the 目 of the page before.
The 項 prints its total in a `計` cell after its last 目.

The reading builds the printed tree directly: the 款・項 of the summary (the detail's titles must name them), the 目
under the 項 of their title, the 節 and the 説明 items under the 目. The 項 takes its amounts from its `計` cell; the
summary's amount of the 項 is the same and is described as a coverage exclusion (総括), as are the 財源内訳, the
増減率 lines, the titles and the numbers of the explanation's text and quantity lines.

Some volumes draw a frame's top edge and right edge as one stroked path (a curve with straight segments), which the
shared observation does not take as rules: the axis-parallel segments of such paths are read here as rules too.
"""
from __future__ import annotations

from collections import defaultdict
import hashlib
import json
import re
import unicodedata
from pathlib import Path

from ingestion.fiscal.manifest import sha_file
from ingestion.generic.observe import Page, Rule, Word, merge_rules, observe
from ingestion.generic.reading import Reading
from ingestion.lib.node_tables import AMOUNT_COLUMNS, NODE_COLUMNS, write_coverage_words
from ingestion.lib.parquet import write_parquet

AMOUNT = re.compile(r'^[△▲]?(?:[0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)$')
CODE = re.compile(r'^([0-9]+)(.*)$')
TITLE = re.compile(r'^([0-9]+)款(.+?)([0-9]+)項(.+)$')
LINE = 2.5    # points: words of one printed line
JOIN = 3.0    # points: fragments of one printed number abut
EDGE = 3.0    # points: rules at the same place
UNITS = ('千円', '円')


def compact(value: str) -> str:
    return re.sub(r'\s+', '', unicodedata.normalize('NFKC', value))


def lines(words, tolerance=LINE):
    result = []
    for word in sorted(words, key=lambda w: (w.y0, w.x0)):
        if result and abs(word.y0 - result[-1][0].y0) <= tolerance:
            result[-1].append(word)
        else:
            result.append([word])
    return [sorted(line, key=lambda w: w.x0) for line in result]


def text_of(line):
    return compact(''.join(w.text for w in line))


def box(words):
    return (min(w.x0 for w in words), min(w.y0 for w in words), max(w.x1 for w in words), max(w.y1 for w in words))


def middle_in(word, x_range):
    middle = (word.x0 + word.x1) / 2
    return x_range[0] <= middle < x_range[1]


def numbers(words):
    """Runs of abutting amount fragments in a line (`562,` `750` → `562,750`), each with its words."""
    runs = []
    for previous, word in zip([None, *words], words):
        if previous is not None and previous.text in ('△', '▲') and re.match(r'[0-9]', word.text) \
                and word.x0 - previous.x1 <= JOIN:
            raise ValueError(f'A sign printed apart from its amount: {previous.text} {word.text}')
        if runs and runs[-1] is not None and word.x0 - runs[-1][-1].x1 <= JOIN and re.fullmatch(r'[0-9,]+', word.text) \
                and runs[-1][-1].text.endswith(','):
            runs[-1].append(word)
        elif re.fullmatch(r'[△▲]?[0-9,]+', word.text):
            runs.append([word])
        else:
            runs.append(None)
    return [(''.join(w.text for w in run), run) for run in runs
            if run is not None and AMOUNT.fullmatch(''.join(w.text for w in run))]


def node_key(page, x0, y0, axis):
    return 'n-' + hashlib.sha256(f'{page}:{x0:.2f}:{y0:.2f}:{axis}'.encode()).hexdigest()[:24]


def path_rules(pdf: Path, number: int) -> list[Rule]:
    """The axis-parallel segments of the stroked paths of a page (a frame's top and right edges drawn as one path)."""
    import pdfplumber
    found = []
    with pdfplumber.open(pdf) as document:
        page = document.pages[number - 1]
        for curve in page.curves:
            if not curve.get('stroke'):
                continue
            points = curve['pts']
            for (ax, ay), (bx, by) in zip(points, points[1:]):
                if abs(ax - bx) < .5 and abs(ay - by) > 20:
                    found.append(Rule(ax, min(ay, by), ax, max(ay, by)))
                elif abs(ay - by) < .5 and abs(ax - bx) > 20:
                    found.append(Rule(min(ax, bx), ay, max(ax, bx), ay))
        page.close()
    return found


class Reader(Reading):
    REQUIRED_RULES = []

    def __init__(self, profile, workflow):
        super().__init__(profile, workflow)
        self.HEADERS = profile['headers']
        self.BUDGET_LABELS = profile['budget_labels']
        self.RATE = profile['rate_line']
        self.SUMMARY_AMOUNT = profile['summary_amount']
        self.SETSU_AMOUNT = profile['setsu_amount']
        self.EXPLANATION_AMOUNT = profile['explanation_amount']
        self.MARKERS = [re.compile(pattern) for pattern in profile['markers']]
        self.MARKER_REACH = profile['marker_reach']
        self.ITEM_AMOUNT_REACH = profile['item_amount_reach']
        self.TOTAL = profile['total_label']
        self.GRAND_TOTAL = profile['grand_total_label']

    # ---- page geometry -------------------------------------------------------------------------------------------
    def geometry(self, page):
        """The frame of a page: its full-height column rules, its top and bottom, and the rules across it."""
        horizontals = [r for r in page.rules if not r.vertical and r.x1 - r.x0 > 150]
        if not horizontals:
            return None
        verticals_all = [r for r in page.rules if r.vertical]
        longest = max((r.y1 - r.y0 for r in verticals_all), default=0)
        tall = [r for r in verticals_all if r.y1 - r.y0 > .6 * longest and longest > 60]
        if len(tall) < 2:
            return None
        x0, x1 = min(r.x0 for r in tall), max(r.x0 for r in tall)
        across = sorted(r.y0 for r in horizontals if r.x0 <= x0 + EDGE and r.x1 >= x1 - EDGE)
        if len(across) < 2:
            return None
        top, bottom = across[0], across[-1]
        columns = []
        for rule in sorted(tall, key=lambda r: r.x0):
            if not columns or rule.x0 - columns[-1] > EDGE:
                columns.append(rule.x0)
        return {'x0': x0, 'x1': x1, 'top': top, 'bottom': bottom, 'columns': columns, 'across': across,
                'horizontals': horizontals}

    def heading_bottom(self, page, geo, first_heading):
        """The rule closing the column headings: the first rule across the frame below the heading words."""
        heading = [w for w in page.words if geo['top'] < w.y0 and compact(w.text) == first_heading
                   and geo['x0'] <= w.x0 <= geo['x1']]
        if not heading:
            return None
        y = min(w.y1 for w in heading)
        below = [a for a in geo['across'] if a >= y - 1]
        return below[0] if below else None

    def kind(self, page, geo):
        n = len(geo['columns'])
        words = [w for w in page.words if geo['top'] < (w.y0 + w.y1) / 2 and geo['x0'] <= w.x0 <= geo['x1']]
        head = compact(''.join(w.text for w in words if w.y0 < geo['top'] + 60))
        if n == 6 and head.startswith(self.HEADERS['subject']) and self.HEADERS['budget'] in head:
            return 'left'
        if n == 2 and head.startswith(self.HEADERS['explanation']):
            return 'right'
        if n == 4 and all(h in head for h in self.HEADERS['summary']):
            return 'summary'
        raise ValueError(f'Page {page.number}: no known page ({n} column rules, headings {head[:30]!r})')

    # ---- conversion ----------------------------------------------------------------------------------------------
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
        numbers_ = [p for span in scopes[0]['pages'] for p in range(span['start'], span['end'] + 1)] \
            if isinstance(scopes[0]['pages'][0], dict) else \
            [p for first, last in scopes[0]['pages'] for p in range(first, last + 1)]
        pdf = Path(source['path'])
        observed = []
        for page in observe(pdf, numbers_):
            rules = merge_rules([*page.rules, *path_rules(pdf, page.number)])
            observed.append(Page(page.number, page.width, page.height, [w for w in page.words if w.text.strip()], rules))
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
        column_ranges = defaultdict(list)   # amount heading → x ranges of the pages
        state = {'kan': None, 'kou': None, 'moku': None, 'setsu': None, 'stack': [], 'stack_moku': None,
                 'waiting': None, 'cells': None}
        summary = {}       # (款 code, 款 name) → {'node', '項': {(code, name): (node, value, run, page)}}
        totals = {}        # 項 node key → (value, run, page) of the 本年度 in its 計 cell
        unit = None

        def add_node(axis, depth, level, code, name, page, glyphs, parent):
            x0, y0, x1, y1 = box(glyphs)
            node = {'node_key': node_key(page, x0, y0, axis), 'parent_node_key': parent['node_key'] if parent else None,
                    'axis_header': axis, 'depth': depth, 'level_header': level, 'code_text': code,
                    'name_text': name or None, 'physical_page': page, 'x0': x0, 'y0': y0, 'x1': x1, 'y1': y1}
            nodes.append(node)
            return node

        def extend(node, line):
            node['name_text'] = (node['name_text'] or '') + text_of(line)
            node['x0'], node['y0'], node['x1'], node['y1'] = box([*line, _Box(node['x0'], node['y0'], node['x1'], node['y1'])])

        def add_amount(node, header, value, run, page, unit_text):
            if unit_text not in UNITS:
                raise ValueError(f'Page {page}: no unit for {header} {value}')
            x0, y0, x1, y1 = box(run)
            amounts.append({'node_key': node['node_key'], 'header_path': header, 'amount_text': value,
                            'unit_text': unit_text, 'physical_page': page, 'x0': x0, 'y0': y0, 'x1': x1, 'y1': y1})

        def exclude(kind, reason, page, glyphs):
            excluded.extend({'kind': kind, 'reason': reason, 'page': page, 'bbox': list(box([w]))} for w in glyphs
                            if re.search(r'[0-9]', unicodedata.normalize('NFKC', w.text)))

        def page_unit(body, x_range, page):
            found = {compact(w.text) for w in body if middle_in(w, x_range) and compact(w.text) in UNITS}
            if len(found) > 1:
                raise ValueError(f'Page {page}: two units in one column')
            return found.pop() if found else None

        for page in pages:
            geo = self.geometry(page)
            if geo is None:
                if any(re.search(r'[0-9]', compact(w.text)) for w in page.words if w.y0 < page.height * .9):
                    raise ValueError(f'Page {page.number}: digits on a page without a frame')
                continue
            kind = self.kind(page, geo)
            report[f'pages {kind}'] += 1
            in_frame = [w for w in page.words if geo['x0'] - 1 <= (w.x0 + w.x1) / 2 <= geo['x1'] + 1
                        and geo['top'] < (w.y0 + w.y1) / 2 < geo['bottom']]
            if kind == 'summary':
                unit = self.summary_page(page, geo, in_frame, summary, add_node, extend, report, column_ranges, unit, words,
                                         pending=state)
            elif kind == 'left':
                unit = self.left_page(page, geo, in_frame, summary, totals, state, add_node, extend, add_amount, exclude,
                                      page_unit, report, column_ranges, unit, words)
            else:
                self.right_page(page, geo, in_frame, state, add_node, extend, add_amount, exclude, page_unit, report,
                                column_ranges, words)

        # The 款 take the summary's amount; a 項 its 計 cell's, the summary's being the same (or the summary's when
        # the 項 prints no 計).
        for entry in summary.values():
            value, run, page, unit_text = entry['amount']
            add_amount(entry['node'], self.SUMMARY_AMOUNT, value, run, page, unit_text)
            for kou, value, run, page, unit_text in entry['項'].values():
                if kou['node_key'] in totals:
                    printed, total_run, total_page = totals[kou['node_key']]
                    if printed != value:
                        raise ValueError(f'{kou["name_text"]}: the 計 {printed} differs from the summary {value}')
                    exclude('総括', '総括の頁に印字した項の金額は、明細の項の「計」の本年度と同じ額の再掲。項の金額は「計」から取った。',
                            page, run)
                else:
                    add_amount(kou, self.SUMMARY_AMOUNT, value, run, page, unit_text)
                    report['項 amounts from the summary'] += 1
        used = {n['parent_node_key'] for n in nodes}
        unused = [n['name_text'] for n in nodes if n['level_header'] == '項' and n['node_key'] not in used]
        if unused:
            raise ValueError(f'{table_id}: 項 of the summary with no detail: {unused}')
        report = dict(report)
        report['nodes'] = len(nodes)
        report['amounts'] = len(amounts)
        amount_columns = [{'header': header, 'x_range': [round(min(r[0] for r in ranges), 2), round(max(r[1] for r in ranges), 2)]}
                          for header, ranges in column_ranges.items()]
        notes = [
            '款・項とその本年度の金額は総括の頁から読み、明細の各頁の題（１款 議会費 １項 議会費）で目を項に結んだ。'
            '項の金額は項の最後の「計」の欄から取った（総括の項の金額は同じ額の再掲）。',
            '予算額の欄の本年度・前年度・比較は共有辞書の本年度予算額・前年度予算額・比較とし、増減率(%)・本年度の財源内訳は取り込んでいない。'
            '説明は番号（1・(1)）と右端の金額（千円）で読み、文中・数量の数は取り込んでいない。',
        ]
        if not nodes or not amounts:
            raise ValueError(f'{table_id}: nothing read')
        return {'nodes': nodes, 'amounts': amounts, 'words': words, 'excluded': excluded,
                'amount_columns': amount_columns, 'notes': notes, 'report': report}

    # ---- summary -------------------------------------------------------------------------------------------------
    def summary_page(self, page, geo, in_frame, summary, add_node, extend, report, column_ranges, unit, words, pending):
        c = geo['columns']
        kan_range, kou_range, amount_range = (c[0], c[1]), (c[1], c[2]), (c[2], c[3])
        body_top = self.heading_bottom(page, geo, self.HEADERS['summary'][0])
        if body_top is None:
            raise ValueError(f'Page {page.number}: no headings of the summary')
        body = [w for w in in_frame if (w.y0 + w.y1) / 2 > body_top]
        words.extend((page.number, box([w]), w.text) for w in body)
        found_unit = {compact(w.text) for w in body if middle_in(w, amount_range) and compact(w.text) in UNITS}
        unit = found_unit.pop() if found_unit else unit
        column_ranges[self.SUMMARY_AMOUNT].append(amount_range)
        last = pending.setdefault('summary_last', None)
        for line in lines([w for w in body if compact(w.text) not in UNITS]):
            label = [w for w in line if not middle_in(w, amount_range)]
            money = numbers([w for w in line if middle_in(w, amount_range)])
            text = text_of(label)
            if compact(text) == self.GRAND_TOTAL:
                report['grand total'] += 1
                continue
            found = CODE.match(text)
            if found and found.group(2) and money and len(money) == 1:
                value, run = money[0]
                if all(middle_in(w, kan_range) for w in label):
                    node = add_node('科目', 1, '款', found.group(1), found.group(2), page.number, label, None)
                    summary[(found.group(1), found.group(2))] = {'node': node, 'amount': (value, run, page.number, unit), '項': {}}
                    pending['summary_kan'] = (found.group(1), found.group(2))
                    last = node
                elif all(middle_in(w, kou_range) for w in label):
                    if pending.get('summary_kan') is None:
                        raise ValueError(f'Page {page.number}: a 項 before every 款 of the summary')
                    entry = summary[pending['summary_kan']]
                    node = add_node('科目', 2, '項', found.group(1), found.group(2), page.number, label, entry['node'])
                    entry['項'][(found.group(1), found.group(2))] = (node, value, run, page.number, unit)
                    last = node
                else:
                    raise ValueError(f'Page {page.number}: summary line across the columns: {text!r}')
            elif not money and not found and last is not None and text:
                # A name that wraps under its line.
                extend(last, label)
                report['wrapped summary names'] += 1
            else:
                raise ValueError(f'Page {page.number}: unread summary line {text!r} {[v for v, _ in money]}')
        pending['summary_last'] = last
        return unit

    # ---- left page -----------------------------------------------------------------------------------------------
    def title(self, page, top):
        """`１款 議会費  １項 議会費` above the frame: the 款 and 項 codes and names, with their words."""
        for line in lines([w for w in page.words if w.y1 <= top + 1]):
            found = TITLE.match(text_of(line))
            unnumbered = re.fullmatch(r'\(([^()]+)\)\(([^()]+)\)', text_of(line))
            if unnumbered:
                # A 款・項 of the year before with no budget this year, printed with no code in parentheses.
                return (None, unnumbered.group(1), None, unnumbered.group(2)), line
            if not found:
                continue
            return found.groups(), line
        raise ValueError(f'Page {page.number}: no 款・項 title above the frame')

    def left_page(self, page, geo, in_frame, summary, totals, state, add_node, extend, add_amount, exclude, page_unit,
                  report, column_ranges, unit, words):
        c = geo['columns']
        subject, budget, funding, setsu, setsu_amount = (c[0], c[1]), (c[1], c[2]), (c[2], c[3]), (c[3], c[4]), (c[4], c[5])
        body_top = self.heading_bottom(page, geo, self.HEADERS['subject'])
        if body_top is None:
            raise ValueError(f'Page {page.number}: no headings above the 目 column')
        (kan_code, kan_name, kou_code, kou_name), title_line = self.title(page, geo['top'])
        if kan_code is None:
            # Not in the summary: the 款・項 are the title's, and the 項 takes every amount of its 計 cell.
            unlisted = state.setdefault('unlisted', {})
            if (kan_name, kou_name) not in unlisted:
                kan_words = [w for w in title_line if w.x0 < title_line[0].x0 + (title_line[-1].x1 - title_line[0].x0) / 2]
                kou_words = [w for w in title_line if w not in kan_words] or kan_words
                kan_node = add_node('科目', 1, '款', None, kan_name, page.number, kan_words, None)
                unlisted[(kan_name, kou_name)] = add_node('科目', 2, '項', None, kou_name, page.number, kou_words, kan_node)
                report['款・項 not in the summary'] += 1
            kou = unlisted[(kan_name, kou_name)]
        else:
            entry = summary.get((kan_code, kan_name))
            if entry is None:
                raise ValueError(f'Page {page.number}: the title 款 {kan_code} {kan_name} is not in the summary')
            kou_entry = entry['項'].get((kou_code, kou_name))
            if kou_entry is None:
                raise ValueError(f'Page {page.number}: the title 項 {kou_code} {kou_name} is not in the summary')
            kou = kou_entry[0]
        if state['kou'] is not kou:
            if kou['node_key'] in state.setdefault('closed', set()):
                raise ValueError(f'Page {page.number}: the 項 {kou_name} returns after another')
            if state['kou'] is not None:
                state['closed'].add(state['kou']['node_key'])
            state.update(kou=kou, moku=None, setsu=None, stack=[], stack_moku=None, waiting=None)
        words.extend((page.number, box([w]), w.text) for w in title_line)
        exclude('反復見出し', '明細の各頁に印字する款・項の題。款・項は総括の頁から読み、題はその再掲として目を項に結ぶのに使った。',
                page.number, title_line)
        body = [w for w in in_frame if (w.y0 + w.y1) / 2 > body_top]
        words.extend((page.number, box([w]), w.text) for w in body)
        unit = page_unit(body, budget, page.number) or unit
        setsu_unit = page_unit(body, setsu_amount, page.number) or unit
        body = [w for w in body if compact(w.text) not in UNITS]
        column_ranges['予算額'].append(budget)
        column_ranges[self.SETSU_AMOUNT].append(setsu_amount)
        # The cells of the 目 column: rules across it below the headings.
        mid = (subject[0] + subject[1]) / 2
        rules = sorted({round(r.y0, 1) for r in geo['horizontals'] if r.x0 - 1 <= mid <= r.x1 + 1
                        and body_top - 1 <= r.y0 <= geo['bottom'] + 1})
        merged = []
        for y in rules:
            if not merged or y - merged[-1] > 2:
                merged.append(y)
        cells = []   # (top, bottom, owner node or None for a 計 cell, is_total)
        for upper, lower in zip(merged, merged[1:]):
            inside = lambda w: upper < (w.y0 + w.y1) / 2 < lower
            subject_lines = lines([w for w in body if inside(w) and middle_in(w, subject)])
            budget_lines = lines([w for w in body if inside(w) and middle_in(w, budget)])
            texts = [text_of(l) for l in subject_lines]
            if not subject_lines and not budget_lines and not any(inside(w) for w in body):
                cells.append((upper, lower, state['moku'], False))
                continue
            if texts == [self.TOTAL]:
                owner, total = kou, True
            elif subject_lines and CODE.match(texts[0]) and CODE.match(texts[0]).group(2):
                found = CODE.match(texts[0])
                owner = add_node('科目', 3, '目', found.group(1), found.group(2), page.number, subject_lines[0], kou)
                for more in subject_lines[1:]:
                    extend(owner, more)
                state.update(moku=owner, setsu=None)
                total = False
            elif not subject_lines or (state['moku'] is not None and ''.join(texts).startswith('(')
                                       and ''.join(texts).endswith(')')
                                       and ''.join(texts)[1:-1] == state['moku']['name_text']):
                # A cell that continues the 目 of the page before (its name printed again in parentheses).
                if subject_lines:
                    exclude('反復見出し', '続きの頁に括弧で再び印字した目の名前。', page.number, [w for l in subject_lines for w in l])
                    report['repeated 目 names'] += 1
                if state['moku'] is None:
                    raise ValueError(f'Page {page.number}: a cell with no 目 opens the 項')
                owner, total = state['moku'], False
                report['cells continuing a 目'] += 1
            elif ''.join(texts).startswith('(') and ''.join(texts).endswith(')'):
                # A 目 printed with no code, its name in parentheses (`（退職被保険者等療養給付費）`): a 目 of the year
                # before with no budget this year.
                owner = add_node('科目', 3, '目', None, ''.join(texts), page.number, subject_lines[0], kou)
                for more in subject_lines[1:]:
                    extend(owner, more)
                owner['name_text'] = ''.join(texts)
                state.update(moku=owner, setsu=None)
                total = False
                report['目 without a code'] += 1
            else:
                raise ValueError(f'Page {page.number}: unread 目 cell {texts}')
            cells.append((upper, lower, owner, total))
            # 予算額: labelled lines.
            for line in budget_lines:
                money = numbers(line)
                label = text_of([w for w in line if not money or w not in money[-1][1]])
                if re.fullmatch(re.escape(self.RATE['label']) + r'(?:[△▲]?[0-9][0-9,]*\.[0-9]+|皆増|皆減|-|－|―)', text_of(line)):
                    exclude(self.RATE['kind'], self.RATE['reason'], page.number, line)
                    report['rate lines'] += 1
                    continue
                if label not in self.BUDGET_LABELS or len(money) != 1:
                    raise ValueError(f'Page {page.number}: unread 予算額 line {text_of(line)!r}')
                value, run = money[0]
                header = self.BUDGET_LABELS[label]
                if total and header == self.SUMMARY_AMOUNT and kan_code is not None:
                    if owner['node_key'] in totals:
                        raise ValueError(f'Page {page.number}: two 計 cells of the 項 {kou_name}')
                    totals[owner['node_key']] = (value, run, page.number)
                add_amount(owner, header, value, run, page.number, unit)
        state['cells'] = (page.number, cells)
        # 本年度の財源内訳: read, not taken in.
        funding_words = [w for w in body if middle_in(w, funding)]
        exclude('財源内訳', '目の行と計の行に印字する本年度の財源内訳（特定財源・一般財源と財源の種類ごとの額）は取り込まない。'
                '目の本年度予算額を財源で分けた別の切り口のため。', page.number, funding_words)
        report['funding words'] += len(funding_words)

        def cell_owner(y):
            for upper, lower, owner, total in cells:
                if upper - 1 <= y <= lower + 1:
                    return owner, total
            raise ValueError(f'Page {page.number}: a line at {y:.1f} outside every cell')

        # 節: a code line opens one, the lines below without a code continue its name.
        starts = []
        for line in lines([w for w in body if middle_in(w, setsu)]):
            text = text_of(line)
            owner, total = cell_owner((line[0].y0 + line[0].y1) / 2)
            if total:
                raise ValueError(f'Page {page.number}: a 節 in the 計 cell')
            found = CODE.match(text)
            if found and found.group(2):
                state['setsu'] = add_node('節', 1, None, found.group(1), found.group(2), page.number, line, owner)
                starts.append((line[0].y0, state['setsu']))
            elif state['setsu'] is not None and state['setsu']['parent_node_key'] == owner['node_key'] and not found:
                extend(state['setsu'], line)
            else:
                raise ValueError(f'Page {page.number}: unread 節 line {text!r}')
        for line in lines([w for w in body if middle_in(w, setsu_amount)]):
            for value, run in numbers(line):
                found = [s for y, s in starts if y <= run[0].y0 + LINE]
                if not found:
                    raise ValueError(f'Page {page.number}: 節 amount {value} above every 節 of the page')
                add_amount(found[-1], self.SETSU_AMOUNT, value, run, page.number, setsu_unit)
        return unit

    # ---- right page ----------------------------------------------------------------------------------------------
    def right_page(self, page, geo, in_frame, state, add_node, extend, add_amount, exclude, page_unit, report,
                   column_ranges, words):
        if state['cells'] is None or state['cells'][0] != page.number - 1:
            raise ValueError(f'Page {page.number}: an explanation page with no left page before it')
        cells = state['cells'][1]
        body_top = self.heading_bottom(page, geo, self.HEADERS['explanation'][0])
        if body_top is None:
            raise ValueError(f'Page {page.number}: no 説明 heading')
        # The rules across the explanation close the same cells as the left page's.
        lefts = {round(c[0]) for c in cells} | {round(c[1]) for c in cells}
        for y in geo['across']:
            if body_top + 1 < y < geo['bottom'] - 1 and not any(abs(y - l) <= EDGE for l in lefts):
                raise ValueError(f'Page {page.number}: a rule at {y:.1f} that closes no cell of the left page')
        body = [w for w in in_frame if (w.y0 + w.y1) / 2 > body_top]
        words.extend((page.number, box([w]), w.text) for w in body)
        unit = page_unit(body, (geo['x0'], geo['x1']), page.number) or state.get('explanation_unit')
        state['explanation_unit'] = unit
        body = [w for w in body if compact(w.text) not in UNITS]
        right_edge = geo['x1']
        column_ranges[self.EXPLANATION_AMOUNT].append((right_edge - self.ITEM_AMOUNT_REACH, right_edge))

        def owner_at(y):
            for upper, lower, owner, total in cells:
                if upper - 1 <= y <= lower + 1:
                    return owner, total
            raise ValueError(f'Page {page.number}: explanation line at {y:.1f} outside every cell')

        for line in lines(body):
            owner, total = owner_at((line[0].y0 + line[0].y1) / 2)
            if total or owner is None:
                raise ValueError(f'Page {page.number}: an explanation line in a cell with no 目: {text_of(line)!r}')
            if state['stack_moku'] is not owner:
                state.update(stack=[], waiting=None, stack_moku=owner)
            found = numbers(line)
            tail = None
            if found and found[-1][1][-1] is line[-1] and line[-1].x1 >= right_edge - self.ITEM_AMOUNT_REACH:
                tail = found[-1]
            marker = self.marker(line[0])
            if marker is not None and line[0].x0 <= geo['x0'] + self.MARKER_REACH:
                depth = marker + 1
                stack = state['stack']
                if depth > len(stack) + 1:
                    raise ValueError(f'Page {page.number}: explanation item {text_of([line[0]])} skips a level')
                del stack[depth - 1:]
                name_words = [w for w in line[1:] if not tail or w not in tail[1]]
                parent = stack[-1] if stack else owner
                item = add_node('説明', depth, None, compact(line[0].text), text_of(name_words), page.number,
                                [line[0], *name_words] if name_words else [line[0]], parent)
                stack.append(item)
                if tail:
                    add_amount(item, self.EXPLANATION_AMOUNT, tail[0], tail[1], page.number, unit)
                    state['waiting'] = None
                else:
                    state['waiting'] = item
                if any(re.search(r'[0-9]', w.text) for w in name_words):
                    report['digits in item names'] += 1
                continue
            waiting = state['waiting']
            if waiting is not None:
                # The name of an item that wraps: the amount is on its last line.
                extend(waiting, [w for w in line if not tail or w not in tail[1]])
                report['wrapped item names'] += 1
                if tail:
                    add_amount(waiting, self.EXPLANATION_AMOUNT, tail[0], tail[1], page.number, unit)
                    state['waiting'] = None
                continue
            if tail:
                raise ValueError(f'Page {page.number}: an amount at the right end of a line that is no item: {text_of(line)!r}')
            if any(re.search(r'[0-9]', unicodedata.normalize('NFKC', w.text)) for w in line):
                exclude('数量表', '説明の項目の下に印字する人数・回数・か所・面積などの数量と単価は、事業の内訳の金額として取り込まない。'
                        '金額の内訳は番号の付いた項目と、その右端の金額（千円）だけ。', page.number, line)
                report['excluded quantity lines'] += 1

    def marker(self, word):
        text = compact(word.text)
        for depth, pattern in enumerate(self.MARKERS):
            if pattern.fullmatch(text):
                return depth
        return None


class _Box:
    """A node's box as a word, to extend it with the words of a wrapped name."""
    def __init__(self, x0, y0, x1, y1):
        self.x0, self.y0, self.x1, self.y1 = x0, y0, x1, y1
