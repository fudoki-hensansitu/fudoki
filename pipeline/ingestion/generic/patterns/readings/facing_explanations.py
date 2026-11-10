"""A budget statement printed on spreads: the subjects and 節 on the left page, the explanation on the facing page.

The left page draws one frame. Its subject column is a staircase of 款・項・目: each level's code starts in its own
narrow column (`1議会費` in the 款 column, then in the 項 column, then in the 目 column), and every 款・項・目 prints
its own row with its amounts (本年度・前年度・比較). The 財源内訳 column prints, beside each row, the source names over
their amounts; the 節 区分・金額 columns print the 節 of each 目. The facing page draws a frame of one column, the
説明, whose rows stand level with the rows of the left page: for each 目, a line of what it pays for, then the
explanation items, each kind at its own indent (a 4-digit policy code with its name, a numbered 事業 with its amount
at the right, a `・` item with its amount a little further left), and between them lines of prose and quantities.

A 目 that runs on to the next spread prints its name again at the top of the next left page, without its code, wrapped
over as many lines as it needs (`社会福祉` / `総務費`). Some originals draw every word twice, the copy a fixed
distance to the side and leaving no ink (the shared observation drops such copies only on pages with many words);
the reading drops the copy that shows no ink on the rendered page and reports each dropped word.

The reading builds the printed tree directly (科目・節・説明) and hands the node and amount tables with the
digit-coverage scope to the shared checks. What it reads but does not take in (the 財源内訳, the quantities and prose
of the explanation) is described as coverage exclusions from where it found them. The column edges, relative to the
frame's left rule, and the indents of the explanation items are the profile's.
"""
from __future__ import annotations

from collections import Counter, defaultdict
import hashlib
import json
import re
import subprocess
import tempfile
import unicodedata
from pathlib import Path

from ingestion.fiscal.manifest import sha_file
from ingestion.generic.observe import Page, Word, observe
from ingestion.generic.reading import Reading
from ingestion.lib.node_tables import AMOUNT_COLUMNS, NODE_COLUMNS, write_coverage_words
from ingestion.lib.parquet import write_parquet

AMOUNT = re.compile(r'^[△▲]?(?:[0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)$')
CODE = re.compile(r'^([0-9]+)(.*)$')
DIGIT = re.compile(r'[0-9０-９]')
LINE = 2.5    # points: words of one printed line
JOIN = 1.5    # points: fragments of one printed number abut
EDGE = 2.0    # points: a rule at a column edge of the profile
ROW = 3.0     # points: a line of the facing page level with a row of the left page


def compact(value: str) -> str:
    return re.sub(r'\s+', '', unicodedata.normalize('NFKC', value))


def mid(word):
    """The middle of a word's height: a line's words share it (a `・` drawn small sits low in its box)."""
    return (word.y0 + word.y1) / 2


def lines(words, tolerance=LINE):
    result = []
    for word in sorted(words, key=lambda w: (mid(w), w.x0)):
        if result and abs(mid(word) - mid(result[-1][0])) <= tolerance:
            result[-1].append(word)
        else:
            result.append([word])
    return [sorted(line, key=lambda w: w.x0) for line in result]


def box(words):
    return (min(w.x0 for w in words), min(w.y0 for w in words), max(w.x1 for w in words), max(w.y1 for w in words))


def text_of(words):
    return compact(''.join(w.text for w in words))


def node_key(page, x0, y0, axis):
    return 'n-' + hashlib.sha256(f'{page}:{x0:.2f}:{y0:.2f}:{axis}'.encode()).hexdigest()[:24]


def hidden_copies(pdf: Path, page: Page, report: dict) -> Page:
    """Drop the copies of characters a page draws twice, the copy a fixed distance to the side and leaving no ink.

    The copies are found among the drawn characters, not Poppler's words: a copy that falls beside a printed word
    is read into it (`2,352` beside `1報酬` reads `,31報酬`). A character drawn outside its text object's clip is
    dropped first (some originals clip the copy away). Of the rest, pairs are the same character on one baseline at the page's
    most common distance. On a page where at least a third of the characters have such a twin, the page is rendered;
    the side (first or second copy) whose characters show more ink on most of the pairs that differ keeps its
    characters, and the other side's character of every pair is dropped (a spread is drawn once on both of its
    pages, each page showing its own half: the left page keeps the first copies, the facing page the second). A copy
    often falls on the next printed character, so the ink of one pair alone does not tell the sides apart. When a
    character was dropped, the page's words are built again from the characters left, never across a vertical rule.
    """
    import pypdfium2 as pdfium
    from ingestion.generic.repair import _glyphs
    document = pdfium.PdfDocument(str(pdf))
    try:
        glyphs, _ = _glyphs(document, page.number)
    finally:
        document.close()
    glyphs = [g for g in glyphs if g[0][2] > 0 and g[0][0] < page.width and g[0][3] > 0 and g[0][1] < page.height]
    # A copy drawn outside its text object's clip is invisible by the PDF's own account (2024's originals).
    clipped_away = sum(1 for g in glyphs if not g[2])
    glyphs = [(b, c) for b, c, visible in glyphs if visible]
    by_line: dict[tuple, list[int]] = defaultdict(list)
    for index, (b, c) in enumerate(glyphs):
        by_line[c, round(b[1])].append(index)
    shifts = Counter()
    for members in by_line.values():
        for a in members:
            for b in members:
                gap = glyphs[b][0][0] - glyphs[a][0][0]
                if 5 < gap < 80 and abs(glyphs[b][0][1] - glyphs[a][0][1]) < .3:
                    shifts[round(gap, 1)] += 1
    shift, count = shifts.most_common(1)[0] if shifts else (None, 0)
    if count < max(3, len(glyphs) / 3):
        if clipped_away:
            return rebuilt(page, glyphs, set(), shift, Counter(), clipped_away, report)
        return page
    pairs = [(a, b) for members in by_line.values() for a in members for b in members
             if abs(glyphs[b][0][0] - glyphs[a][0][0] - shift) < .3 and abs(glyphs[b][0][1] - glyphs[a][0][1]) < .3]
    import numpy as np
    from PIL import Image
    with tempfile.TemporaryDirectory() as directory:
        subprocess.run(['pdftoppm', '-f', str(page.number), '-l', str(page.number), '-r', '144', '-gray', '-png',
                        str(pdf), str(Path(directory) / 'page')], check=True)
        image = np.array(Image.open(next(Path(directory).glob('page*.png'))).convert('L'))
    scale = image.shape[1] / page.width

    def ink(index: int) -> float:
        x0, y0, x1, y1 = glyphs[index][0]
        region = image[int(y0 * scale):int(y1 * scale) + 1, int(x0 * scale):int(x1 * scale) + 1]
        return float((region < 160).mean()) if region.size else 0.

    votes = Counter()
    for a, b in pairs:
        difference = ink(a) - ink(b)
        if abs(difference) > .06:
            votes['first' if difference > 0 else 'second'] += 1
    if votes['first'] > 2 * votes['second']:
        dropped = {b for _, b in pairs}
    elif votes['second'] > 2 * votes['first']:
        dropped = {a for a, _ in pairs}
    else:
        raise ValueError(f'Page {page.number}: characters drawn twice and no side shows the ink ({dict(votes)})')
    return rebuilt(page, glyphs, dropped, shift, votes, clipped_away, report)


def rebuilt(page, glyphs, dropped, shift, votes, clipped_away, report):
    """The page's words built again from the characters left, never across a vertical rule."""
    from ingestion.generic.repair import Report, words_from_glyphs
    kept = [g for i, g in enumerate(glyphs) if i not in dropped]
    words = [w for w in words_from_glyphs(kept, Report(), page.rules) if w.text.strip()]
    report['hidden copies dropped'] += len(dropped) + clipped_away
    report.setdefault('hidden copies by page', {})[page.number] = {
        'clipped away': clipped_away, 'shift': shift, 'votes': dict(votes), 'characters dropped by ink': len(dropped),
        'characters kept': len(kept),
        'examples': ''.join(glyphs[i][1] for i in sorted(dropped, key=lambda i: glyphs[i][0][1:2] + glyphs[i][0][0:1]))[:40]}
    return Page(page.number, page.width, page.height, words, page.rules)


def clipped(cell, right, report):
    """A cell's words without a separator the text layer places across the column's right rule after a whole amount
    (`40,663,133` `,`): the page clips it at the rule and prints no ink there."""
    if len(cell) > 1 and cell[-1].text in (',', '，') and cell[-1].x1 > right and AMOUNT.fullmatch(''.join(w.text for w in cell[:-1])):
        report['separators clipped at a column rule'] += 1
        return cell[:-1]
    return cell


def number_at_end(line, left):
    """The amount printed at the right end of a line: its abutting fragments (`96,` `000`) joined, right of `left`."""
    run = []
    for word in reversed(line):
        if re.fullmatch(r'[△▲]?[0-9,]+', word.text) and (not run or run[0].x0 - word.x1 <= JOIN):
            run.insert(0, word)
        else:
            break
    while run and not AMOUNT.fullmatch(''.join(w.text for w in run)):
        run.pop(0)
    before = line[:line.index(run[0])] if run else []
    if before and before[-1].text in ('△', '▲') and run[0].x0 - before[-1].x1 <= JOIN:
        raise ValueError(f'A sign printed apart from its amount: {before[-1].text} {run[0].text}')
    if not run or run[-1].x1 < left:
        return None
    return ''.join(w.text for w in run), run


class Reader(Reading):
    REQUIRED_RULES = []

    def __init__(self, profile, workflow):
        super().__init__(profile, workflow)
        left = profile['left']
        self.WIDTH = left['width']
        self.LEVELS = [(name, tuple(x)) for name, x in left['levels']]
        self.SUBJECT = (self.LEVELS[0][1][0], self.LEVELS[-1][1][1])
        self.SUBJECT_AMOUNTS = [(c['header'], tuple(c['x'])) for c in left['subject_amounts']]
        self.FUNDING = tuple(left['funding'])
        self.SETSU = tuple(left['setsu'])
        self.SETSU_AMOUNT = (left['setsu_amount']['header'], tuple(left['setsu_amount']['x']))
        right = profile['right']
        self.RIGHT_WIDTH = right['width']
        self.ITEMS = [{'pattern': re.compile(i['pattern']), 'x': tuple(i['x']), 'amount': i['amount'],
                       'bullet': i.get('bullet'), 'code': re.compile(i['code']) if 'code' in i else CODE}
                      for i in right['items']]
        self.AMOUNT_LEFT = right['amount_left']
        self.PROSE_INDENT = right['prose_indent']
        self.ASIDE = re.compile(right['aside_heading'])
        self.UNITS = profile['units']
        self.ABOLISHED = profile['abolished_mark']
        self.DIVIDER = profile['divider_text']

    # --- frames -----------------------------------------------------------------------------------------------

    def frame(self, page):
        """('left' | 'right', left x, top, heading bottom, bottom) of the page's frame, or None."""
        long = sorted({round(r.x0, 1) for r in page.rules if r.vertical and r.y1 - r.y0 > page.height * .4})
        for kind, width in (('left', self.WIDTH), ('right', self.RIGHT_WIDTH)):
            for x0 in long:
                if not any(abs(x - x0 - width) <= EDGE for x in long):
                    continue
                inner = [x for x in long if x0 + EDGE < x < x0 + width - EDGE]
                if kind == 'left':
                    edges = [e for _, (e, _) in self.SUBJECT_AMOUNTS] + [self.FUNDING[0], self.SETSU[0], self.SETSU_AMOUNT[1][0]]
                    if not all(any(abs(x - x0 - e) <= EDGE for x in inner) for e in edges[:4]):
                        continue
                elif inner:
                    continue
                full = sorted(r.y0 for r in page.rules if not r.vertical and r.x0 <= x0 + EDGE and r.x1 >= x0 + width - EDGE)
                if len(full) < 3:
                    continue
                top, bottom = full[0], full[-1]
                heading = next((y for y in full[1:] if y - top > 20), None)
                if heading is None:
                    raise ValueError(f'Page {page.number}: no heading rule in the frame')
                return kind, x0, top, heading, bottom
        return None

    # --- conversion -------------------------------------------------------------------------------------------

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
        report = defaultdict(int)
        pdf = Path(source['path'])
        observed = [hidden_copies(pdf, Page(p.number, p.width, p.height, [w for w in p.words if w.text.strip()], p.rules), report)
                    for p in observe(pdf, numbers_)]
        folder = Path(destination)
        table_id = options['table_id']
        built = self.build(observed, table_id, report)
        nodes_path = folder / f'{table_id}-nodes.parquet'
        amounts_path = folder / f'{table_id}-amounts.parquet'
        write_parquet(nodes_path, [{c.name: n[c.name] for c in NODE_COLUMNS} for n in built['nodes']], columns=NODE_COLUMNS)
        write_parquet(amounts_path, [{c.name: a[c.name] for c in AMOUNT_COLUMNS} for a in built['amounts']],
                      columns=AMOUNT_COLUMNS)
        write_coverage_words(folder / f'{table_id}.parquet', built['words'], amount_columns=built['amount_columns'],
                             excluded_regions=built['excluded'])
        (folder / f'{table_id}.reading.json').write_text(json.dumps(built['report'], ensure_ascii=False, indent=1) + '\n')
        return {table_id: {'nodes': nodes_path, 'amounts': amounts_path, 'notes': built['notes']}}

    def build(self, pages, table_id, report):
        nodes, amounts, words, excluded = [], [], [], []
        open_ = {'款': None, '項': None, '目': None}
        explained = {'moku': None, 'stack': [], 'pending': None, 'aside': None}
        amount_columns = {}
        spread = None   # (left page, frame, 目 starts on it, the 目 open before it)

        def add_node(axis, depth, level, code, name, page, glyphs, parent):
            x0, y0, x1, y1 = box(glyphs)
            node = {'node_key': node_key(page, x0, y0, axis), 'parent_node_key': parent['node_key'] if parent else None,
                    'axis_header': axis, 'depth': depth, 'level_header': level, 'code_text': code,
                    'name_text': name or None, 'physical_page': page, 'x0': x0, 'y0': y0, 'x1': x1, 'y1': y1}
            nodes.append(node)
            return node

        def grow(node, glyphs, text):
            node['name_text'] = (node['name_text'] or '') + text
            x0, y0, x1, y1 = box([*glyphs, Word('', node['x0'], node['y0'], node['x1'], node['y1'])])
            node.update(x0=x0, y0=y0, x1=x1, y1=y1)

        def add_amount(node, header, value, run, page, unit):
            x0, y0, x1, y1 = box(run)
            amounts.append({'node_key': node['node_key'], 'header_path': header, 'amount_text': value,
                            'unit_text': unit, 'physical_page': page, 'x0': x0, 'y0': y0, 'x1': x1, 'y1': y1})

        def exclude(kind, reason, page, glyphs):
            excluded.extend({'kind': kind, 'reason': reason, 'page': page, 'bbox': list(box([w]))} for w in glyphs
                            if DIGIT.search(w.text))

        def column(page_words, x0, x_range):
            return [w for w in page_words if x0 + x_range[0] <= (w.x0 + w.x1) / 2 < x0 + x_range[1]]

        pending_left = []   # amounts of a left page wait for the unit its facing page prints
        for page in pages:
            frame = self.frame(page)
            if frame is None:
                text = compact(''.join(w.text for w in page.words if page.height * .1 < w.y0 < page.height * .9))
                if DIGIT.search(text):
                    # A divider page (`(3) 歳出`) prints digits but no table; any other page without a frame stops.
                    if not re.fullmatch(self.DIVIDER, text):
                        raise ValueError(f'Page {page.number}: digits on a page without a frame: {text[:40]!r}')
                    report['divider pages'] += 1
                continue
            kind, x0, top, heading, bottom = frame
            width = self.WIDTH if kind == 'left' else self.RIGHT_WIDTH
            in_frame = [w for w in page.words if x0 - 1 <= (w.x0 + w.x1) / 2 <= x0 + width + 1 and top < (w.y0 + w.y1) / 2 < bottom]
            words.extend((page.number, box([w]), w.text) for w in in_frame)
            body = [w for w in in_frame if (w.y0 + w.y1) / 2 > heading]
            if kind == 'left':
                if pending_left:
                    raise ValueError(f'Page {page.number}: a left page follows a left page with no facing page')
                spread = self.left_page(page, x0, body, open_, add_node, grow, exclude, column, report, pending_left)
                for header, x_range in [*self.SUBJECT_AMOUNTS, self.SETSU_AMOUNT]:
                    amount_columns.setdefault(('left', header), [x0 + x_range[0], x0 + x_range[1]])
                continue
            if spread is None or spread['page'] != page.number - 1:
                raise ValueError(f'Page {page.number}: an explanation page with no left page before it')
            unit = self.unit(page, top)
            for args in pending_left:
                add_amount(*args, unit)
            pending_left.clear()
            self.right_page(page, x0, body, spread, explained, add_node, grow, add_amount, exclude, unit, report)
            amount_columns.setdefault(('right', '説明'), [x0 + self.AMOUNT_LEFT - 60, x0 + width])
            spread = None
        if pending_left:
            raise ValueError('The last left page has no facing page')
        report = dict(report)
        report['nodes'] = len(nodes)
        report['amounts'] = len(amounts)
        if not nodes or not amounts:
            raise ValueError(f'{table_id}: nothing read')
        notes = [
            '款・項・目は左頁の科目の欄から、それぞれの行の本年度・前年度・比較の金額とともに読んだ。印字の見出し「本年度」「前年度」'
            '「比較増(△)減」は共有辞書の「本年度予算額」「前年度予算額」「比較」とした。',
            '財源内訳の欄は取り込んでいない。説明は向かいの頁から、施策（4桁の番号）・事業（番号と右端の金額）・「・」の項目'
            '（右端の金額）を字下げで読み、文中の数（人数・回数など）は取り込んでいない。',
        ]
        return {'nodes': nodes, 'amounts': amounts, 'words': words, 'excluded': excluded,
                'amount_columns': [{'header': header, 'x_range': x} for (_, header), x in amount_columns.items()],
                'notes': notes, 'report': report}

    def unit(self, page, top):
        found = text_of(sorted((w for w in page.words if top - 25 < w.y0 < top), key=lambda w: w.x0))
        unit = ('千円' if '千円' in found else '円' if '円' in found else None) if '単位' in found else None
        if unit not in self.UNITS:
            raise ValueError(f'Page {page.number}: no unit above the explanation frame ({found!r})')
        return unit

    def level_of(self, word, x0):
        offset = word.x0 - x0
        for name, (low, high) in self.LEVELS:
            if low - EDGE <= offset < high:
                return name
        return None

    def left_page(self, page, x0, body, open_, add_node, grow, exclude, column, report, pending):
        continuing = open_['目']
        starts = []          # (y, node) of the subjects that open on this page
        repeat_text = ''     # the name of the open 目 printed again at the top of the page
        repeat_lines = []
        subject_lines = lines(column(body, x0, self.SUBJECT))
        amounts_by_line = []
        for line in subject_lines:
            text = text_of(line)
            found = CODE.match(text)
            row_amounts = []
            for header, x_range in self.SUBJECT_AMOUNTS:
                cell = sorted((w for w in column(body, x0, x_range) if abs(mid(w) - mid(line[0])) <= LINE), key=lambda w: w.x0)
                cell = clipped(cell, x0 + x_range[1], report)
                if cell:
                    value = ''.join(w.text for w in sorted(cell, key=lambda w: w.x0))
                    if not AMOUNT.fullmatch(value):
                        raise ValueError(f'Page {page.number}: unread {header} {value!r}')
                    row_amounts.append((header, value, cell))
            level = self.level_of(line[0], x0)
            abolished = text.startswith(self.ABOLISHED) and not found
            if (found and found.group(2)) or abolished:
                code, name = (found.group(1), found.group(2)) if found else (None, text[len(self.ABOLISHED):])
                if level is None:
                    raise ValueError(f'Page {page.number}: subject {text!r} starts in no level column')
                depth = [n for n, _ in self.LEVELS].index(level) + 1
                parent = None if depth == 1 else open_[self.LEVELS[depth - 2][0]]
                if depth > 1 and parent is None:
                    raise ValueError(f'Page {page.number}: {level} {text!r} with no open parent')
                open_node = open_[level]
                if open_node is not None and open_node['code_text'] == code and code is not None \
                        and open_node['name_text'] == name and open_node['parent_node_key'] == (parent or {}).get('node_key'):
                    raise ValueError(f'Page {page.number}: {level} {text!r} printed again')
                node = add_node('科目', depth, level, code, name, page.number, line, parent)
                if abolished:
                    report['subjects with the abolished mark'] += 1
                open_[level] = node
                for deeper, _ in self.LEVELS[depth:]:
                    open_[deeper] = None
                starts.append((mid(line[0]), node))
                for header, value, cell in row_amounts:
                    pending.append((node, header, value, cell, page.number))
                if not row_amounts:
                    raise ValueError(f'Page {page.number}: subject {text!r} prints no amount')
                continue
            if row_amounts:
                raise ValueError(f'Page {page.number}: amounts beside a line with no code {text!r}')
            if not starts:
                # The name of the 目 that runs on, printed again over one or more lines.
                if continuing is None:
                    raise ValueError(f'Page {page.number}: {text!r} at the top with no open 目')
                repeat_text += text
                repeat_lines.append(line)
                continue
            grow(starts[-1][1], line, text)   # a name that wraps
        if repeat_text:
            if repeat_text != continuing['name_text']:
                raise ValueError(f'Page {page.number}: {repeat_text!r} at the top is not the name of the open 目 '
                                 f'{continuing["name_text"]!r}')
            report['repeated 目 names'] += 1
            exclude('反復見出し', '頁をまたぐ目の名前を次の頁の頭に番号なしで印字した再掲。最初の頁の目を項目にした。',
                    page.number, [w for line in repeat_lines for w in line])
        moku_starts = [(y, n) for y, n in starts if n['level_header'] == '目']

        def owner_at(y):
            found = [n for top_y, n in moku_starts if top_y <= y + ROW]
            if found:
                return found[-1]
            # Above every 目 that opens here: the 目 that runs on, unless a 款・項 opened above the line.
            if any(top_y <= y + ROW for top_y, n in starts):
                return None
            return continuing

        # 財源内訳
        funding = column(body, x0, self.FUNDING)
        exclude('財源内訳', '科目の行ごとに印字する財源内訳（財源の名前と金額）は取り込まない。財源の種類ごとの額で、'
                '本年度の金額の内訳の別の切り口のため。', page.number, funding)
        report['funding words'] += len(funding)
        # 節
        setsu = None
        setsu_starts = []
        for line in lines(column(body, x0, self.SETSU)):
            text = text_of(line)
            found = CODE.match(text)
            parent = owner_at(mid(line[0]))
            if parent is None:
                raise ValueError(f'Page {page.number}: 節 {text!r} belongs to no 目')
            if found and found.group(2):
                setsu = {'node': add_node('節', 1, None, found.group(1), found.group(2), page.number, line, parent),
                         'parent': parent}
                setsu_starts.append((mid(line[0]), setsu['node']))
            elif setsu is not None and setsu['parent'] is parent and not found:
                grow(setsu['node'], line, text)
            else:
                raise ValueError(f'Page {page.number}: unread 節 line {text!r}')
        header, x_range = self.SETSU_AMOUNT
        for line in lines(column(body, x0, x_range)):
            line = clipped(line, x0 + x_range[1], report)
            value = ''.join(w.text for w in line)
            if not AMOUNT.fullmatch(value):
                raise ValueError(f'Page {page.number}: unread 節 amount {value!r}')
            owner = [n for top_y, n in setsu_starts if abs(top_y - mid(line[0])) <= LINE]
            if not owner:
                raise ValueError(f'Page {page.number}: 節 amount {value} beside no 節')
            pending.append((owner[0], header, value, line, page.number))
        return {'page': page.number, 'owner_at': owner_at}

    def right_page(self, page, x0, body, spread, explained, add_node, grow, add_amount, exclude, unit, report):
        owner_at = spread['owner_at']
        for line in lines(body):
            y = mid(line[0])
            owner = owner_at(y)
            text = text_of(line)
            if owner is None:
                raise ValueError(f'Page {page.number}: explanation {text!r} beside a 款・項 row')
            if owner is not explained['moku']:
                explained.update(moku=owner, stack=[], pending=None, aside=None)
            stack = explained['stack']
            offset = line[0].x0 - x0
            item = next((i for i in self.ITEMS if i['x'][0] <= offset < i['x'][1] and i['pattern'].match(text)), None)
            tail = number_at_end(line, x0 + self.AMOUNT_LEFT)
            if item is not None:
                rank = self.ITEMS.index(item)
                # The depth is the item's rank among the kinds open above it (a 事業 with no policy over it is at 1).
                while stack and stack[-1]['rank'] >= rank:
                    stack.pop()
                depth = len(stack) + 1
                parent = stack[-1]['node'] if stack else owner
                name_words = [w for w in line if not tail or w not in tail[1]]
                name = text_of(name_words)
                if item['bullet']:
                    code = None   # the mark stays in the name, as printed (`・報酬`)
                else:
                    found = item['code'].match(name)
                    if found is None:
                        raise ValueError(f'Page {page.number}: no code in the item {name!r}')
                    code, name = found.group(1), found.group(2)
                node = add_node('説明', depth, None, code, name, page.number, name_words, parent)
                stack.append({'node': node, 'rank': rank})
                explained['pending'] = None
                explained['aside'] = None
                if tail:
                    if not item['amount']:
                        raise ValueError(f'Page {page.number}: an amount beside {text!r}')
                    add_amount(node, '説明', tail[0], tail[1], page.number, unit)
                elif item['amount']:
                    explained['pending'] = node
                continue
            if self.ASIDE.fullmatch(text):
                explained['aside'] = text
                explained['pending'] = None
                report['aside breakdowns'] += 1
                continue
            if explained.get('aside'):
                # Under `（選挙執行内訳）`: the item above cut another way (its amount again, by election), not taken in.
                exclude('経費内訳', '項目の下に括弧の見出し（選挙執行内訳など）を付けて印字する、同じ金額の別の切り口の内訳は取り込まない。'
                        '上の項目の金額と重ねて足さないため。', page.number, line)
                report['aside lines'] += 1
                continue
            if tail and explained['pending'] is not None:
                # The amount of an item whose name wrapped onto this line.
                node = explained['pending']
                grow(node, [w for w in line if w not in tail[1]], text_of([w for w in line if w not in tail[1]]))
                add_amount(node, '説明', tail[0], tail[1], page.number, unit)
                explained['pending'] = None
                report['wrapped item names'] += 1
                continue
            if tail:
                raise ValueError(f'Page {page.number}: an amount at the right of a line that is no item: {text!r}')
            if DIGIT.search(text):
                kind = '数量表' if offset >= self.PROSE_INDENT else '本文'
                exclude(kind, '説明の文中の数（人数・回数・面積・日付など）は事業の内訳の金額として取り込まない。'
                        '金額の内訳は番号の付いた事業と「・」の項目の右端の金額だけ。', page.number, line)
                report[f'excluded lines {kind}'] += 1
        if explained['pending'] is not None:
            report['items with no amount on their page'] += 1
