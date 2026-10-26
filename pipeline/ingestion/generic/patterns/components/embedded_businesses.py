from __future__ import annotations
from collections import defaultdict
import re
import subprocess
import xml.etree.ElementTree as ET
from ingestion.lib.node_tables import coverage_regions


def annual_header(self, row):
    headers = []
    active = []
    for w in row:
        if w['text'].startswith(('令和', '平成')):
            active = [w]
        elif active:
            active.append(w)
        if active and '年度' in w['text']:
            headers.append({'name': self.text(active), 'x': (active[0]['x'] + active[-1]['xe']) / 2})
            active = []
        elif w['text'] == '計' and not active:
            headers.append({'name': '計', 'x': (w['x'] + w['xe']) / 2})
    return headers


def annual_row(self, row, headers, page):
    numbers = [w for w in row if self.AMOUNT.fullmatch(w['text'].removesuffix('円'))]
    if not numbers or len(numbers) != len(headers):
        return None
    first = min(w['x'] for w in numbers)
    name = self.text([w for w in row if w['xe'] < first - 1])
    if not name:
        return None
    cells = {}
    for idx, (header, number) in enumerate(zip(headers, numbers, strict=True)):
        end = numbers[idx + 1]['x'] if idx + 1 < len(numbers) else float('inf')
        suffix = [w for w in row if w['text'] == '円' and number['xe'] <= w['x'] < end]
        words = [number, *suffix]
        cells[header['name']] = (number['text'] + (' 円' if suffix and not number['text'].endswith('円') else ''),
                                 self.coordinates(words, page))
    return name, cells


def money(self, row):
    # The rightmost currency is the actual business amount. Earlier currencies
    # can be per-person rates printed inside the business name.
    for idx, w in reversed(list(enumerate(row))):
        if w['text'].endswith('円') and self.AMOUNT.fullmatch(w['text'][:-1]):
            return {'value': w['text'], 'name_words': row[:idx], 'circle': w, 'number': w}
    circles = [(idx, w) for idx, w in enumerate(row) if w['text'] == '円']
    for idx, circle in reversed(circles):
        if idx:
            word = row[idx - 1]
            matched = re.search(r'[0-9]+(?:,[0-9]{3})*$', word['text'])
            if not matched:
                continue
            number = {**word, 'text': matched[0]}
            prefix = word['text'][:matched.start()]
            name_words = [*row[:idx - 1], *([{**word, 'text': prefix}] if prefix else [])]
            return {'value': number['text'] + ' 円', 'name_words': name_words,
                    'circle': circle, 'number': number}
    return None


def grid_lines(self, source, destination, page):
    svg = destination / f'page-{page}-grid.svg'
    subprocess.run(['pdftocairo', '-f', str(page), '-l', str(page), '-svg', str(source), str(svg)], check=True)
    horizontal, vertical = [], []
    root = ET.parse(svg).getroot()
    for path in root.findall('./{*}path'):
        if path.get('fill') != 'none':
            continue
        points = re.findall(r'[ML]\s+([-0-9.eE]+)\s+([-0-9.eE]+)', path.get('d', ''))
        transform = re.search(r'matrix\(([^)]+)\)', path.get('transform', ''))
        if len(points) != 2 or not transform:
            continue
        a, b, c, d, e, f = [float(v) for v in transform[1].split(',')]
        transformed = [(a * float(x) + c * float(y) + e, b * float(x) + d * float(y) + f) for x, y in points]
        (x1, y1), (x2, y2) = transformed
        if abs(y1 - y2) < .2:
            horizontal.append((min(x1, x2), max(x1, x2), (y1 + y2) / 2))
        if abs(x1 - x2) < .2:
            vertical.append(((x1 + x2) / 2, min(y1, y2), max(y1, y2)))
    return horizontal, vertical


def inner_header(self, row):
    joined = self.compact(self.text(row))
    profile = next((p for p in self.INNER_HEADERS if joined == ''.join(p)), None)
    if not profile:
        return None
    characters = []
    for w in row:
        for char in self.compact(w['text']):
            characters.append((char, w))
    headers = []
    at = 0
    for label in profile:
        selected = [pair[1] for pair in characters[at:at + len(label)]]
        headers.append({'name': label, 'x': (selected[0]['x'] + selected[-1]['xe']) / 2})
        at += len(label)
    return headers


def table_cells(self, words, headers, bounds, lines, page, top, bottom, start, end, *, unruled_rows=False):
    cells, locations, kept = {}, {}, []
    for item, (lower, upper) in zip(headers, bounds, strict=True):
        selected = []
        for word in words:
            x, y = (word['x'] + word['xe']) / 2, (word['y'] + word['ye']) / 2
            if not (lower < x < upper and start < y < end):
                continue
            rules = sorted({ry for x1, x2, ry in lines if x1 - .2 <= x <= x2 + .2})
            before = [ry for ry in rules if ry < y]
            after = [ry for ry in rules if ry > y]
            cell_top = max(before) if before else (top if unruled_rows else start)
            cell_bottom = min(after) if after else (bottom if unruled_rows else end)
            if cell_top < bottom - .3 and cell_bottom > top + .3 and (not unruled_rows or rules or top < y < bottom):
                selected.append(word)
        key = item.get('column', '内表_' + item['name'])
        cells[key] = '\n'.join(self.text(row) for row in self.rows(selected))
        locations[key] = self.coordinates(selected, page) if selected else None
        kept.extend(selected)
    return cells, locations, kept


def grid_table(self, words, header, headers, lines, page, *, column_bounds=None, body_rows=None,
               shared_units=(), unit_columns=()):
    if column_bounds is not None:
        words = [word for word in words if not (word['text'] in shared_units
                 and any(column_bounds[index][0] < (word['x'] + word['xe']) / 2 < column_bounds[index][1]
                         for index in unit_columns))]
        horizontal, vertical = lines
        start, end = body_rows[0][0], body_rows[-1][1]
        result = []
        for top, bottom in body_rows:
            cells, locations, kept = self.rule('table_cells')(words, headers, column_bounds, horizontal, page,
                                                  top, bottom, start, end, unruled_rows=True)
            if horizontal:
                groups = [[0]]
                center = (top + bottom) / 2
                for index in range(1, len(headers)):
                    boundary = column_bounds[index][0]
                    if any(abs(x - boundary) < .2 and first <= center <= last for x, first, last in vertical):
                        groups.append([index])
                    else:
                        groups[-1].append(index)
                for group in groups:
                    if len(group) == 1:
                        continue
                    final = group[-1]
                    merged, merged_locations, _ = self.rule('table_cells')(words, [headers[final]],
                        [(column_bounds[group[0]][0], column_bounds[final][1])], horizontal, page,
                        top, bottom, start, end, unruled_rows=True)
                    for index in group[:-1]:
                        key = headers[index]['column']
                        cells[key], locations[key] = '', None
                    cells.update(merged)
                    locations.update(merged_locations)
            if kept:
                result.append({'cells': cells, 'cell_locations': locations,
                               'location': self.coordinates(kept, page),
                               'row_bounds': {'原典物理頁': page, '原典xMin': column_bounds[0][0],
                                              '原典xMax': column_bounds[-1][1],
                                              '原典yMin': top, '原典yMax': bottom}})
        return result, end
    # This profile prints shared units above the first data glyphs inside the
    # first ruled body cell. They describe columns, not that first leaf alone.
    if headers[-1]['name'] == '給付額':
        words = [w for w in words if w['text'] not in ('件', '円')]
    horizontal, vertical = lines
    header_y = (min(w['y'] for w in header) + max(w['ye'] for w in header)) / 2
    xs = sorted(set(round(x, 2) for x, top, bottom in vertical if top - .2 <= header_y <= bottom + .2))
    if len(xs) < len(headers) + 1:
        bounds = [-float('inf'), *[(a['x'] + b['x']) / 2 for a, b in zip(headers, headers[1:])],
                  headers[-1]['x'] + 75]
        result = []
        for row in self.rows([w for w in words if w['y'] > max(w['ye'] for w in header)]):
            cells = {('内表_' + h['name']): self.text([w for w in row if bounds[idx] <= (w['x'] + w['xe']) / 2 < bounds[idx + 1]])
                     for idx, h in enumerate(headers)}
            nums = [w for w in row if bounds[-2] <= (w['x'] + w['xe']) / 2 < bounds[-1] and self.AMOUNT.fullmatch(w['text'])]
            if nums:
                kept = [w for w in row if w['x'] < bounds[-1]]
                locations = {('内表_' + h['name']): self.coordinates([w for w in row
                            if bounds[idx] <= (w['x'] + w['xe']) / 2 < bounds[idx + 1]], page)
                            for idx, h in enumerate(headers)
                            if any(bounds[idx] <= (w['x'] + w['xe']) / 2 < bounds[idx + 1] for w in row)}
                result.append({'cells': cells, 'location': self.coordinates(kept, page),
                               'cell_locations': locations, 'money_location': self.coordinates(nums[-1:], page)})
                if self.compact(cells['内表_' + headers[0]['name']]) == '計':
                    return result, max(w['ye'] for w in row)
        raise ValueError(f'Unruled monetary table has no total on page {page}')
    column_bounds = []
    for item in headers:
        lower = max(x for x in xs if x < item['x'])
        upper = min(x for x in xs if x > item['x'])
        column_bounds.append((lower, upper))
    left, right = column_bounds[0][0], column_bounds[-1][1]
    # Follow the outside rule through adjacent stroke segments to the table end.
    outer = sorted((top, bottom) for x, top, bottom in vertical if abs(x - right) < .2)
    end = header_y
    for top, bottom in outer:
        if top <= end + .3 and bottom > end:
            end = bottom
    header_bottom = min(y for x1, x2, y in horizontal if x1 < headers[-1]['x'] < x2 and y > header_y)
    money_left, money_right = column_bounds[-1]
    monetary = [w for w in words if money_left < (w['x'] + w['xe']) / 2 < money_right
                and header_bottom < (w['y'] + w['ye']) / 2 < end
                and self.AMOUNT.fullmatch(w['text'])]
    result = []
    for number in sorted(monetary, key=lambda w: w['y']):
        center = (number['x'] + number['xe']) / 2
        ycenter = (number['y'] + number['ye']) / 2
        ys = sorted(set(y for x1, x2, y in horizontal if x1 - .2 <= center <= x2 + .2))
        top = max(y for y in ys if y < ycenter)
        bottom = min(y for y in ys if y > ycenter)
        # A printed monetary cell can span finer quantity/phase rows. Preserve
        # those rows, repeating the original monetary glyph and its bbox.
        quantity_center = sum(column_bounds[-2]) / 2
        cuts = sorted({top, bottom, *(y for x1, x2, y in horizontal
                       if x1 - .2 <= quantity_center <= x2 + .2 and top + .3 < y < bottom - .3)})
        for row_top, row_bottom in zip(cuts, cuts[1:]):
            cells, cell_locations, kept = self.rule('table_cells')(words, headers, column_bounds, horizontal, page,
                                                       row_top, row_bottom, header_bottom, end)
            result.append({'cells': cells, 'location': self.coordinates(kept, page),
                           'money_location': self.coordinates([number], page), 'cell_locations': cell_locations,
                           'row_bounds': {'原典物理頁': page, '原典xMin': left, '原典xMax': right,
                                          '原典yMin': row_top, '原典yMax': row_bottom}})
    return result, end


def node_context(self, node):
    chain = []
    at = node
    while at:
        chain.append(at)
        at = at['parent']
    result = dict(node['context'])
    for at in reversed(chain):
        prefix = self.LEVELS[at['rank']]
        result[prefix + '_番号'] = at['number']
        result[prefix + '_名称'] = at['name']
        result[prefix + '_金額'] = at['amount']
        for key, value in at['amount_location'].items():
            result[prefix + '_金額_' + key] = value
        for key, value in at['location'].items():
            result[prefix + '_' + key] = value
        result[prefix + '_所属'] = at['department']
    return result


def unexplained_sections(self, pages, parent, following, last):
    records = []
    start_page = parent['原典物理頁']
    end_page = following['原典物理頁'] if following else last
    for page in range(start_page, end_page + 1):
        lower = parent['原典yMax'] if page == start_page else 60
        upper = following['原典yMin'] if following and page == end_page else 790
        words = [w for w in pages[page] if lower < w['y'] < upper]
        numbers = [w for w in words if 650 < w['x'] < 680 and re.fullmatch(r'[0-9]+', w['text'])]
        for number in numbers:
            y = number['y']
            name_words = [w for w in words if 680 < w['x'] < 735 and abs(w['y'] - y) < 11]
            values = sorted([w for w in words if 735 < w['x'] < 990 and abs(w['y'] - y) < 4.1
                             and self.AMOUNT.fullmatch(w['text'])], key=lambda w: w['x'])
            if len(values) != 4 or not name_words:
                raise ValueError(f'Incomplete unexplained section: page={page}, number={number["text"]}')
            department = [w for w in words if 390 < w['x'] < 650 and abs(w['y'] - y) < 4.1]
            location = self.coordinates([number, *name_words, *values], page)
            records.append({**parent['parents'], '節_番号': number['text'],
                            '節_名称': '\n'.join(self.text(r) for r in self.rows(name_words)),
                            **dict(zip(['節_金額', '節_支出済額', '節_翌年度繰越額', '節_不用額'],
                                       [w['text'] for w in values], strict=True)),
                            **{k2: v
                               for k, w in zip(['節_金額', '節_支出済額', '節_翌年度繰越額', '節_不用額'], values)
                               for k2, v in self.origin_position(k, page, [w]).items()},
                            '節_所属': self.text(department) or None,
                            **{'節_' + key: value for key, value in location.items()}, **location})
    return records


def nonfinancial_facts(self, pages, nodes, source, destination, grids, handled, all_parents, declared):
    controls, observations, regions, office_headings, excluded = [], [], [], [], []
    ordered = sorted(nodes, key=lambda node: self.reading_position(node['location']))
    mokus = [p for p in all_parents if p['level'] == '目']

    def owner_at(page, pane, y):
        key = (page, pane, y)
        available = [node for node in ordered if self.reading_position(node['location']) <= key]
        if not available:
            raise ValueError(f'Nonfinancial original fact has no source heading: page={page}, y={y}')
        return available[-1]

    def governing_moku(page, pane, y):
        governing = [p for p in mokus
                     if (p['原典物理頁'], 0, p['原典yMin']) < (page, pane, y)]
        if not governing:
            raise ValueError(f'Measured prose has no fiscal subject: page={page}, y={y}')
        moku = max(governing, key=lambda p: (p['原典物理頁'], p['原典yMin']))
        return tuple(moku['parents'].get(level + '_番号') for level in ('款', '項', '目'))

    def measured_owner(page, pane, y):
        # The fiscal subject is the original moku in force at the measured
        # position, never the nearest preceding amount under another moku.
        wanted = governing_moku(page, pane, y)
        candidates = [node for node in ordered
                      if tuple(node['context'].get(level + '_番号')
                               for level in ('款', '項', '目')) == wanted]
        before = [node for node in candidates if self.reading_position(node['location']) <= (page, pane, y)]
        if before:
            return before[-1], None
        if candidates:
            # The line precedes every business of its moku, like an office or
            # department heading: it belongs to the moku's own context, not
            # to the coming first business.
            return None, wanted
        raise ValueError(f'Measured prose has no business under its fiscal subject: page={page}, y={y}')

    for page, pane, header_y, data_y, end, title, fields, xs, units, unruled in declared['auxiliary_tables']:
        if page not in pages:
            continue
        words = [word for word in pages[page] if int(word['x'] >= 650) == pane]
        body = [word for word in words if data_y - 7 < word['y'] < end
                and xs[0] < (word['x'] + word['xe']) / 2 < xs[-1]]
        if page not in grids:
            grids[page] = self.rule('grid_lines')(source, destination, page)
        horizontal = [] if unruled else grids[page][0]
        anchors = [word for word in body if xs[-2] < (word['x'] + word['xe']) / 2 < xs[-1]
                   and re.search(r'[0-9]|－', word['text']) and word['y'] >= data_y - 1]
        body_rows = []
        for line in self.rows(anchors):
            center = (min(word['y'] for word in line) + max(word['ye'] for word in line)) / 2
            x = (line[0]['x'] + line[0]['xe']) / 2
            rules = sorted({y for x1, x2, y in horizontal if x1 - .2 <= x <= x2 + .2})
            before, after = [y for y in rules if y < center], [y for y in rules if y > center]
            top = max(before) if before else min(word['y'] for word in line) - .5
            bottom = min(after) if after else max(word['ye'] for word in line) + .5
            interval = (max(top, data_y - 7), min(bottom, end))
            if interval not in body_rows:
                body_rows.append(interval)
        if not body_rows:
            raise ValueError(f'No original quantity rows in measured table: page={page}, title={title}')
        headers = [{'name': field, 'column': '数量表_' + title + '_' + field} for field in fields]
        items, _ = self.rule('grid_table')(body, [], headers, (horizontal, grids[page][1]), page,
                              column_bounds=list(zip(xs, xs[1:])), body_rows=body_rows, shared_units=units,
                              unit_columns=[index for index, field in enumerate(fields)
                                            if field not in ('区分', '施設名', '保育所名', '児童館名',
                                                             '健康診査等内訳', '対象者', '委員会区分',
                                                             '委員会名', '施工', '工種')])
        owner = owner_at(page, pane, data_y)
        heading_words = [word for word in words if header_y - 1 <= word['y'] < data_y - 7
                         and xs[0] < (word['x'] + word['xe']) / 2 < xs[-1]]
        heading = '\n'.join(self.text(row) for row in self.rows(heading_words)) or None
        records = []
        date = None
        for item in items:
            if any(self.compact(value) == '計' for value in item['cells'].values()):
                controls.append({**self.rule('node_context')(owner), **item['cells'], **item['location']})
                match = re.search(r'（[^）]*）', '\n'.join(item['cells'].values()))
                if match:
                    date = match[0]
                continue
            record = {**self.rule('node_context')(owner), **item['cells'], '数量表_見出し': heading,
                      '数量表_現在日': None, **item['row_bounds']}
            for column, location in item['cell_locations'].items():
                if location:
                    record.update({column + '_' + key: value for key, value in location.items()})
            records.append(record)
            observations.append(item)
        if date is None and heading:
            match = re.search(r'（[^）]*[0-9][^）]*）', heading)
            date = match[0] if match else None
        for record in records:
            record['数量表_現在日'] = date
        owner['annual_rows'].extend(records)
        owner['has_children'] = True
        regions.append((page, pane, header_y - 1, end, xs[0], xs[-1]))
        # Data rows only: the heading strip can share its baseline with an
        # adopted business amount just above the ruled body.
        excluded.append({**self.QUANTITY_EXCLUSION, 'page': page,
                         'bbox': [xs[0], data_y - 7, xs[-1], end]})

    # These are original prose rows within the current printed monetary heading,
    # not allocation or a join to the independent legal section column.
    for page, words in pages.items():
        statement = any('当初予算額' in word['text'] for word in words)
        for pane in range(1 if statement else 2):
            for line in self.rows([word for word in words if int(word['x'] >= 650) == pane
                              and 60 < word['y'] < 790]):
                value = self.text(line)
                joined = self.compact(value)
                measured = any(p == page and pn == pane
                               and abs(min(w['y'] for w in line) - y) < 2.5
                               for p, pn, y in declared['prose_lines'])
                office = any(p == page and pn == pane
                             and abs(min(w['y'] for w in line) - y) < 2.5
                             for p, pn, y in declared['office_headings'])
                if not (measured or office):
                    if self.rule('money')(line) or joined.startswith(('計', '（款）', '（項）', '（目）', '令和', '平成')):
                        continue
                    if not (re.match(r'^(所在地|場所|規模|完成|完了|工事延長|区域|区間|［備考］|※|（)', joined)
                            or re.search(r'[0-9][^円]*?(人|件|回|園|事業所|事業主|クラブ|世帯|基|㎡|ｍ|km|番|号|箇所|公園|児童遊園)', joined)):
                        continue
                location = self.coordinates(line, page)
                if office:
                    # An office/department heading is a native moku-level
                    # scalar whose scope runs in reading order to the next
                    # office or moku heading: assembly repeats it on the finest
                    # rows inside that scope by origin position.
                    office_headings.append({'moku_path': governing_moku(page, pane, location['原典yMin']),
                                            'pos': (page, pane, location['原典yMin']),
                                            'text': value, 'location': location})
                    continue
                center = (location['原典yMin'] + location['原典yMax']) / 2
                if any(pg == page and half == pane and top <= center <= bottom
                       for pg, half, top, bottom, *_ in [*regions, *handled]):
                    continue
                if measured:
                    owner, moku_path = measured_owner(page, pane, location['原典yMin'])
                    if owner is None:
                        # A measured line preceding every business of its moku
                        # is handled by the same office-heading mechanism.
                        office_headings.append({'moku_path': moku_path,
                                                'pos': (page, pane, location['原典yMin']),
                                                'text': value, 'location': location})
                        continue
                else:
                    owner = owner_at(page, pane, location['原典yMin'])
                if '給与費' in self.compact(owner['name']) and re.fullmatch(r'.+\s*[0-9]+\s*人\s*(（[^）]*）)?', value):
                    continue
                # A prose line is annotation, not a decomposition of the
                # printed amount: the monetary parent row stays a leaf and
                # is preserved once while the line repeats its context.
                owner['annual_rows'].append({**self.rule('node_context')(owner), '補足_本文': value, **location})
    return controls, observations, office_headings, excluded


def assemble(self, pages, first, last, *, source, destination, reserve_kan='11', personnel_breakdown=False,
             unexplained_section_detail=False, nonfinancial_breakdown=False, remark_column=False,
             remark_min_x=1024, remark_merged_cells=False, row_tolerance=4.1, measured):
    parents = {}
    nodes = []
    current = {}
    all_parents = []
    totals = []
    annual_controls = []
    annual_names = set()
    inner_controls = []
    inner_cells = []
    personnel_controls = []
    lending = []
    grids = {}
    reserve = []
    reserve_path = {}
    reserve_total = None
    annual = None
    awaiting_header = False
    pending = []
    pending_department = []
    reserve_pending = []
    handled = []
    excluded = []

    for page in range(first, last + 1):
        words = pages[page]
        # A financial statement spread has section/budget columns on the right;
        # a continuation spread instead uses both halves for business details.
        has_statement = any('当初予算額' in self.compact(self.text(row)) for row in self.rows(words))
        halves = [([w for w in words if w['x'] < 650], 0)]
        if has_statement:
            retained = {id(w) for w in halves[0][0]}
            skipped = [w for w in words if id(w) not in retained]
            excluded.extend(coverage_regions(
                [(page, (w['x'], w['y'], w['xe'], w['ye']), w['text']) for w in skipped],
                **self.SECTION_EXCLUSION))
        else:
            halves.append(([w for w in words if w['x'] >= 650], 646))
        for half_words, offset in halves:
            skip_until = 0
            for row in self.rows(half_words, tolerance=row_tolerance):
                if min(w['y'] for w in row) < 60 or min(w['y'] for w in row) > 790:
                    continue
                if offset == 0:
                    full_row = [w for w in words if abs(w['y'] - row[0]['y']) <= 4.1]
                    parent = self.rule('parent_event')(sorted(full_row, key=lambda w: w['x']), page, words)
                    if parent:
                        level = parent['level']
                        if level in ('款', '項'):
                            for child in (['項', '目'] if level == '款' else ['目']):
                                parents.pop(child, None)
                        parents[level] = parent
                        all_parents.append(parent | {'parents': self.context(parents)})
                        if level == '目':
                            current = {}
                            annual = None
                            awaiting_header = False
                        pending = []
                        pending_department = []
                        continue
                if '目' not in parents:
                    if parents.get('款', {}).get('番号') == reserve_kan:
                        handled.append((page, int(offset != 0),
                                        min(w['y'] for w in row), max(w['ye'] for w in row)))
                    continue
                if min(w['y'] for w in row) < skip_until:
                    continue
                value = self.text(row)
                stripped = self.compact(value)
                if parents['款']['番号'] == reserve_kan:
                    # Reserve appropriations are a distinct explanation, not
                    # executed business detail under the zero-expense reserve.
                    # The main prose pass must not borrow these lines either;
                    # they are already retained in the reserve transfer table.
                    handled.append((page, int(offset != 0),
                                    min(w['y'] for w in row), max(w['ye'] for w in row)))
                    reserve_page, reserve_box = self.rowbox(row, page)
                    excluded.append({**self.RESERVE_EXCLUSION, 'page': reserve_page,
                                     'bbox': reserve_box})
                    payment = self.rule('money')(row)
                    if not payment:
                        reserve_pending.append(value)
                        continue
                    title = self.text(payment['name_words'])
                    if '充用した科目' in self.compact(title):
                        reserve_total = payment['value']
                        reserve_pending = []
                        continue
                    if reserve_pending and re.match(r'^第\s*[0-9０-９]+\s*[款項目]', reserve_pending[0]):
                        title = '\n'.join([*reserve_pending, title])
                    match = re.match(r'^第\s*([0-9０-９]+)\s*([款項目])\s*(.*)$', title, re.DOTALL)
                    if match:
                        lev = match[2]
                        if lev in ('款', '項'):
                            for child in (['項', '目'] if lev == '款' else ['目']):
                                for k in list(reserve_path):
                                    if k.startswith(child + '_'):
                                        reserve_path.pop(k)
                        reserve_path.update({lev + '_番号': match[1], lev + '_名称': match[3],
                                             lev + '_金額': payment['value']})
                    elif reserve_path and (title or reserve_pending):
                        reserve.append({**self.context(parents), '充用した科目（事業）及び金額': reserve_total,
                                        **{'充用先_' + k: v for k, v in reserve_path.items()},
                                        '充用先_事業': '\n'.join(reserve_pending + ([title] if title else [])),
                                        '充用先_金額': payment['value'], **self.coordinates(row, page)})
                    reserve_pending = []
                    continue
                headers = self.rule('inner_header')(row)
                if headers:
                    if page not in grids:
                        grids[page] = self.rule('grid_lines')(source, destination, page)
                    items, skip_until = self.rule('grid_table')(half_words, row, headers, grids[page], page)
                    if not current:
                        raise ValueError(f'Monetary inner table without owner on page {page}')
                    is_lending = [h['name'] for h in headers] == ['区分', '件数', '金額']
                    handled_top = min(word['y'] for word in row)
                    title_rows = []
                    if is_lending:
                        # The ［備考］ caption is retained in the lending status
                        # table itself, not in the preceding business detail.
                        captions = [min(w['y'] for w in r) for r in pending
                                    if '［備考］' in self.compact(self.text(r))]
                        if captions:
                            handled_top = min(handled_top, *captions)
                    else:
                        # A measured original caption line directly above a
                        # monetary inner table is that table's title or
                        # eligibility note: hold it as scalar on the table's
                        # own rows, never as normal-benefit prose.
                        title_rows = [r for r in pending
                                      if any(p == page and pn == int(offset != 0)
                                             and abs(min(w['y'] for w in r) - y) < 2.5
                                             for p, pn, y in measured['prose_lines'])]
                        if title_rows:
                            handled_top = min(handled_top,
                                              min(min(w['y'] for w in r) for r in title_rows))
                    handled.append((page, int(offset != 0), handled_top, skip_until))
                    title = '\n'.join(self.text(r) for r in title_rows) or None
                    title_location = (self.coordinates([w for r in title_rows for w in r], page)
                                      if title_rows else None)
                    amount_column = '内表_' + headers[-1]['name']
                    if is_lending:
                        owner = current.get(1, current[max(current)])
                    else:
                        owner = current[max(current)]
                        owner['has_children'] = True
                    for item in items:
                        inner_cells.append({'cells': item['cells'], 'location': item['location'],
                                            'cell_locations': item.get('cell_locations'),
                                            'row_bounds': item.get('row_bounds'),
                                            'money_location': item['money_location'],
                                            'title': title})
                        record = {**self.rule('node_context')(owner), **item['cells'], **item['location'],
                                  **{amount_column + '_' + k: v for k, v in item['money_location'].items()}}
                        for column, location in (item.get('cell_locations') or {}).items():
                            if location:
                                record.update({column + '_' + key: value for key, value in location.items()})
                                if column != amount_column and re.sub(r'（[^）]*）|等$', '', column).endswith(('件数', '数量', '者数', '児童数', '施工数')):
                                    excluded.append({**self.QUANTITY_EXCLUSION, 'page': page,
                                        'bbox': [location[k] for k in self.coordinates_keys()[1:]]})
                        if title:
                            # The caption's own measured position travels with
                            # the inner table's finest rows as a native title.
                            record['内表_表題'] = title
                            record.update({'内表_表題_' + k: v
                                           for k, v in title_location.items()})
                        non_amount = ''.join(self.compact(v) for k, v in item['cells'].items() if k != amount_column)
                        if '計' in non_amount and not any(c for c in non_amount.replace('計', '') if not c.isdigit() and c not in ',－件人'):
                            inner_controls.append(record)
                            if is_lending:
                                loc = item['location']
                                excluded.append({**self.LENDING_EXCLUSION, 'page':page,
                                    'bbox':[loc[k] for k in self.coordinates_keys()[1:]]})
                        elif is_lending:
                            lending.append(record)
                            loc = item['location']
                            excluded.append({**self.LENDING_EXCLUSION, 'page': page,
                                             'bbox': [loc['原典xMin'], loc['原典yMin'],
                                                      loc['原典xMax'], loc['原典yMax']]})
                        else:
                            owner['annual_rows'].append(record)
                    pending = []
                    continue
                year_headers = self.rule('annual_header')(row)
                if (year_headers and any('年度' in h['name'] for h in year_headers)
                        and ('区分' in stripped) and not awaiting_header):
                    awaiting_header = True
                if '施工概要' in stripped:
                    awaiting_header = True
                    annual = None
                    pending = []
                    continue
                if awaiting_header:
                    headers = year_headers
                    if headers and any('年度' in h['name'] for h in headers):
                        if not current:
                            raise ValueError(f'施工概要 without a business parent on page {page}')
                        owner = current[max(current)]
                        owner['has_children'] = True
                        annual = {'headers': headers, 'owner': owner}
                        annual['source_start'] = (page, int(offset != 0), min(word['y'] for word in row))
                        annual_names.update(h['name'] for h in headers)
                        awaiting_header = False
                    continue
                if annual:
                    item = self.rule('annual_row')(row, annual['headers'], page)
                    if item:
                        name, cells = item
                        record = {**self.rule('node_context')(annual['owner']), '施工概要_区分': name,
                                  **{('施工概要_' + key): val for key, (val, _) in cells.items()},
                                  **{('施工概要_' + key + '_' + k): v
                                     for key, (_, loc) in cells.items() for k, v in loc.items()},
                                  **self.coordinates(row, page)}
                        if self.compact(name) == '計':
                            annual_controls.append(record)
                            start_page, half, top = annual['source_start']
                            if start_page == page:
                                handled.append((page, half, top, max(word['ye'] for word in row)))
                            annual = None
                        else:
                            annual['owner']['annual_rows'].append(record)
                        continue
                    if not self.rule('money')(row):
                        continue
                    annual = None
                payment = self.rule('money')(row)
                if not payment:
                    if personnel_breakdown and current:
                        owner = current[max(current)]
                        if '給与費' in self.compact(owner['name']):
                            count = re.fullmatch(r'(.+?)\s*([0-9]+)\s*人', value)
                            if count:
                                owner['has_children'] = True
                                owner['annual_rows'].append({**self.rule('node_context')(owner), '職員_区分': count[1].rstrip(),
                                                             '職員_人数': value[count.start(2):],
                                                             '職員_現在日': None, **self.coordinates(row, page)})
                                staff_page, staff_box = self.rowbox(row, page)
                                excluded.append({**self.PERSONNEL_EXCLUSION, 'page': staff_page,
                                                 'bbox': staff_box})
                                pending = []
                                continue
                            total = re.fullmatch(r'計\s*([0-9]+)\s*人\s*(（.*）)', value)
                            if total and owner['annual_rows']:
                                for record in owner['annual_rows']:
                                    record['職員_現在日'] = total[2]
                                personnel_controls.append({'parents': self.rule('node_context')(owner), 'value': value,
                                                           **self.coordinates(row, page)})
                                staff_page, staff_box = self.rowbox(row, page)
                                excluded.append({**self.PERSONNEL_EXCLUSION, 'page': staff_page,
                                                 'bbox': staff_box})
                                pending = []
                                continue
                            dated = re.fullmatch(r'(?!計)(.+?)\s*([0-9]+)\s*人\s*(（[^）]*）)', value)
                            if dated:
                                owner['has_children'] = True
                                owner['annual_rows'].append({**self.rule('node_context')(owner), '職員_区分': dated[1].rstrip(),
                                                             '職員_人数': dated[2] + ' 人',
                                                             '職員_現在日': dated[3], **self.coordinates(row, page)})
                                staff_page, staff_box = self.rowbox(row, page)
                                excluded.append({**self.PERSONNEL_EXCLUSION, 'page': staff_page,
                                                 'bbox': staff_box})
                                pending = []
                                continue
                    if value.startswith('［') and min(w['x'] for w in row) > offset + 395:
                        project = current.get(0)
                        if project:
                            project['department'] = (project['department'] or '') + '\n' + value
                        else:
                            pending_department.append({'page': page,
                                                       'y': min(w['y'] for w in row), 'value': value})
                        continue
                    if (current and current[max(current)]['number']
                            and current[max(current)]['number'].startswith('(')
                            and not pending and value.startswith(('「', 'の'))
                            and min(w['x'] for w in row) < offset + 125):
                        active = current[max(current)]
                        active['name'] += '\n' + value
                        active['location'] = {**active['location'], '原典yMax': max(active['location']['原典yMax'], max(w['ye'] for w in row))}
                        continue
                    if value and not set(stripped) <= {'円', '％'}:
                        pending.append(row)
                    continue
                names = payment['name_words']
                name_text = self.text(names)
                if self.compact(name_text) == '計':
                    totals.append({'parents': self.context(parents), 'value': payment['value'], **self.coordinates(row, page)})
                    pending = []
                    continue
                # Names can precede a standalone monetary line or wrap below a
                # numbered heading. Do not borrow unrelated staffing/count rows.
                pending_marker = [r for r in pending if re.match(r'^\([0-9]+\)\s+', self.text(r))]
                if pending_marker and self.compact(name_text).startswith(('所在地', '完了', '完成')):
                    names = pending_marker[-1]
                    name_text = self.text(names)
                elif not name_text or len(self.compact(name_text)) < 3:
                    relevant = [r for r in pending if min(w['x'] for w in r) < payment['number']['x']
                                and len(self.compact(self.text(r))) >= 3
                                and not any(w['text'] == '円' for w in r)
                                and (('（' in self.text(r) or '(' in self.text(r))
                                     or not any(w['text'] in ('人', '件', '学級', '個', '基', '㎡', '回', 'ｍ') for w in r))]
                    if relevant:
                        last_left = min(w['x'] for w in relevant[-1])
                        relevant = [r for r in relevant if min(w['x'] for w in r) <= last_left + 10]
                        names = [*sum(relevant[-2:], []), *names]
                        name_text = '\n'.join(self.text(r) for r in relevant[-2:]) + ('\n' + name_text if name_text else '')
                marker = re.match(r'^([0-9]+|\([0-9]+\))\s+(.*)$', name_text, re.DOTALL)
                number = marker[1] if marker else None
                department = self.text([w for w in row if w['x'] > payment['circle']['xe'] and ('［' in w['text'] or '］' in w['text'] or w['x'] < offset + 650)]) or None
                name = marker[2] if marker else name_text
                name_x = payment['name_words'][0]['x'] - offset if payment['name_words'] else None
                if number and not number.startswith('(') and names[0]['x'] - offset < 52:
                    rank = 0
                elif number and number.startswith('('):
                    rank = 1
                else:
                    right = payment['circle']['x'] - offset
                    rank = 3 if right < 220 else (2 if right < 290 else 1)
                    if names and names[0]['x'] - offset >= 55:
                        rank = max(rank, 2)
                    if name_x is not None and current:
                        deepest = current[max(current)]
                        dn = deepest.get('name_x')
                        # Indent is relative: a row printed deeper than the open
                        # detail is its child, and a row at the same indent is a
                        # sibling at that same level regardless of the absolute
                        # amount column thresholds above.
                        if dn is not None:
                            if name_x > dn + 6:
                                rank = max(rank, deepest['rank'] + 1)
                            elif rank < deepest['rank'] and name_x >= dn - 4:
                                rank = deepest['rank']
                for depth in list(current):
                    if depth >= rank:
                        current.pop(depth)
                parent_node = current[max(current)] if current else None
                if rank and parent_node is None:
                    raise ValueError(f'Orphan monetary detail on page {page}: {name_text} row={self.text(row)}')
                if parent_node:
                    parent_node['has_children'] = True
                node = {'rank': rank, 'number': number, 'name': name, 'amount': payment['value'],
                        'department': department, 'name_x': name_x,
                        'amount_location': self.coordinates([payment['number'], payment['circle']], page),
                        'location': self.coordinates([*row, *names], page), 'parent': parent_node,
                        'context': self.context(parents), 'has_children': False, 'annual_rows': []}
                if pending_department and rank == 0:
                    # A department mark can print one line above the business
                    # row it belongs to (same ruled band); it is not a section
                    # department and never crosses a page or a subject heading.
                    near = [d for d in pending_department
                            if d['page'] == page and node['location']['原典yMin'] - 25 < d['y'] < node['location']['原典yMax'] + 10]
                    if near:
                        node['department'] = '\n'.join([*[d['value'] for d in near],
                                                        *([department] if department else [])])
                    pending_department = []
                nodes.append(node)
                current[rank] = node
                pending = []
    quantity_controls, quantity_cells, office_headings, quantity_excluded = (
        self.rule('nonfinancial_facts')(pages, nodes, source, destination, grids, handled, all_parents, measured)
        if nonfinancial_breakdown else ([], [], [], []))
    excluded.extend(quantity_excluded)
    records = []
    for node in nodes:
        records.extend(node['annual_rows'])
        if not node['has_children']:
            records.append({**self.rule('node_context')(node), '明細金額': node['amount'], **node['location']})
    # No business expenditure is printed for the reserve; retain its finest
    # available printed moku row, including the actual zero and all budget cells.
    represented_moku = {(n['context']['目_原典物理頁'], n['context']['目_原典yMin']) for n in nodes}
    for index, parent in enumerate(all_parents):
        if parent['level'] == '目' and (parent['原典物理頁'], parent['原典yMin']) not in represented_moku:
            if unexplained_section_detail:
                following = all_parents[index + 1] if index + 1 < len(all_parents) else None
                sections = self.rule('unexplained_sections')(pages, parent, following, last)
                if sections:
                    records.extend(sections)
                    continue
            records.append({**parent['parents'], **{k: parent[k] for k in self.coordinates_keys()}})
    # An office/department heading is handed to its rows at construction time:
    # every finest row inside its reading-order scope — from the heading to the
    # next office or moku heading within the same moku — carries the scalar and
    # the heading's own origin position, so no downstream pass has to re-derive
    # the correspondence and repeated business names cannot misplace it.
    for record in records:
        path = tuple(record.get(level + '_番号') for level in ('款', '項', '目'))
        pos = (record.get('原典物理頁'), int((record.get('原典xMin') or 0) >= 650),
               record.get('原典yMin'))
        applicable = [h for h in office_headings
                      if h['moku_path'] == path and h['pos'] <= pos]
        if applicable:
            heading = max(applicable, key=lambda h: h['pos'])
            record.update({'目_機関部署見出し': heading['text'],
                           **{'目_機関部署見出し_' + k: v
                              for k, v in heading['location'].items()}})
    if remark_column:
        # The printed remark column (備考, x>1024) is an independent scalar of
        # the fiscal row whose ruled band contains the line: row boundaries are
        # the horizontal rules spanning the whole fiscal table, while inner
        # quantity tables rule only their own fragments and never reach both
        # edges. Each remark line must resolve to exactly one printed row.
        remarks = {}
        entities = [(p['level'], p, p) for p in all_parents]
        entities += [(self.LEVELS[n['rank']], n['location'], n) for n in nodes]
        for page, words in pages.items():
            marks = [w for w in words if w['x'] > remark_min_x and 60 < w['y'] < 790]
            lines = [line for line in self.rows(marks) if self.compact(self.text(line)) not in ('備', '考', '備考')]
            if not lines:
                continue
            if page not in grids:
                grids[page] = self.rule('grid_lines')(source, destination, page)
            coverage = defaultdict(list)
            for x1, x2, y in grids[page][0]:
                coverage[round(y, 1)].append((x1, x2))
            edges = sorted(y for y, seg in coverage.items()
                           if min(x1 for x1, _ in seg) < 45 and max(x2 for _, x2 in seg) > 480)
            for line in lines:
                center = (min(w['y'] for w in line) + max(w['ye'] for w in line)) / 2
                hits = []
                for level, loc, entity in entities:
                    if loc['原典物理頁'] != page:
                        continue
                    middle = (loc['原典yMin'] + loc['原典yMax']) / 2
                    lower = max((y for y in edges if y < middle), default=60)
                    upper = min((y for y in edges if y > middle), default=790)
                    if lower < center < upper:
                        hits.append((level, loc, entity))
                # A remark cell merged down a band of rows belongs to every
                # row of the band; the document declares that it prints one.
                if not hits or len(hits) > 1 and not remark_merged_cells:
                    raise ValueError(f'Remark line has {len(hits)} owning rows: page={page}, {self.text(line)}')
                for level, loc, _ in hits:
                    key = (level, page, round(loc['原典yMin'], 1))
                    remarks.setdefault(key, []).append(self.text(line))
        for record in [*records, *reserve, *lending]:
            for level in ['款', '項', '目', *self.LEVELS]:
                page = record.get(level + '_原典物理頁')
                top = record.get(level + '_原典yMin')
                if page is None or top is None:
                    continue
                found = remarks.get((level, page, round(top, 1)))
                if found:
                    record[level + '_備考'] = '\n'.join(found)
    for record in records:
        for key in sorted(annual_names):
            record.setdefault('施工概要_' + key, None)
    observations = {'parents': all_parents, 'business_nodes': [
        {k: v for k, v in node.items() if k not in ('parent', 'annual_rows')} |
        {'parent_location': node['parent']['location'] if node['parent'] else None}
        for node in nodes], 'business_totals': totals, 'annual_totals': annual_controls, 'inner_totals': inner_controls,
        'inner_cells': inner_cells,
        'coordinate_system': 'Poppler bbox-layout, upright top-left origin, pt; physical pages'}
    if personnel_breakdown:
        observations['personnel_totals'] = personnel_controls
    if nonfinancial_breakdown:
        observations['quantity_totals'] = quantity_controls
        observations['quantity_cells'] = quantity_cells
    return records, reserve, lending, observations, excluded

FUNCTIONS = {
    'annual_header': annual_header,
    'annual_row': annual_row,
    'assemble': assemble,
    'grid_lines': grid_lines,
    'grid_table': grid_table,
    'inner_header': inner_header,
    'money': money,
    'node_context': node_context,
    'nonfinancial_facts': nonfinancial_facts,
    'table_cells': table_cells,
    'unexplained_sections': unexplained_sections,
}
