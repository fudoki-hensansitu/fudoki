"""Migrate declared PDF columns to printed nodes and amounts; reject ambiguous layouts."""
from __future__ import annotations

from collections import defaultdict
import csv
from dataclasses import dataclass
from functools import cache
import hashlib
import json
import math
import re
import unicodedata
from pathlib import Path

import duckdb

from shared.amount import is_fiscal_year_notation, number, parse_amount
from ingestion.lib.parquet import ParquetColumn, write_parquet

NODE_COLUMNS = tuple(ParquetColumn(name, kind) for name, kind in (
    ('node_key', 'VARCHAR'), ('parent_node_key', 'VARCHAR'), ('axis_header', 'VARCHAR'),
    ('depth', 'BIGINT'), ('level_header', 'VARCHAR'), ('code_text', 'VARCHAR'),
    ('name_text', 'VARCHAR'), ('physical_page', 'BIGINT'),
    ('x0', 'DOUBLE'), ('y0', 'DOUBLE'), ('x1', 'DOUBLE'), ('y1', 'DOUBLE')))
# Amount positions are nullable: unknown pages never inherit a label position.
AMOUNT_COLUMNS = tuple(ParquetColumn(name, kind) for name, kind in (
    ('node_key', 'VARCHAR'), ('header_path', 'VARCHAR'), ('amount_text', 'VARCHAR'),
    ('unit_text', 'VARCHAR'), ('physical_page', 'BIGINT'),
    ('x0', 'DOUBLE'), ('y0', 'DOUBLE'), ('x1', 'DOUBLE'), ('y1', 'DOUBLE')))
MIGRATION_NOTE = ('旧変換器は未読・所属未確認を数えていない。件数は移行時に検出できた原文の未読と親の未解決を数え、'
                  '0の根拠は段階を解決できる印字金額の親子について全段の子の和の一致である。原典の未抽出箇所が無いことの証明ではない。')


def read_rows(path: Path) -> list[dict]:
    with duckdb.connect() as con:
        cursor = con.execute('select * from read_parquet(?, hive_partitioning=false)', [str(path)])
        names = [item[0] for item in cursor.description]
        return [dict(zip(names, row)) for row in cursor.fetchall()]


@dataclass
class NodeTables:
    nodes: list[dict]
    amounts: list[dict]
    unread_amount_count: int = 0
    unresolved_parent_count: int = 0
    issues: list[str] | None = None


def _position(row, prefix):
    def value(*suffixes):
        for suffix in suffixes:
            key = prefix + suffix
            if row.get(key) is not None:
                return row[key]
        return None
    return {'physical_page': value('物理頁', '原典物理頁'),
            'x0': value('左端', '原典xMin', 'xMin'), 'y0': value('上端', '原典yMin', 'yMin'),
            'x1': value('右端', '原典xMax', 'xMax'), 'y1': value('下端', '原典yMax', 'yMax')}


def _amount_position(row, column, context):
    """Use only coordinates owned by the amount column, never its node's label."""
    position = _position(row, column + '_')
    if position['physical_page'] is None and 'amount_position_prefix' in context:
        position = _position(row, context['amount_position_prefix'])
    if position['physical_page'] is None:
        return dict.fromkeys(position)
    return position


AMOUNT_POSITION_SUFFIXES = ('物理頁', '左端', '上端', '右端', '下端')


def amount_position_fields(column, page, boxes):
    """Printed page and word union box for one wide-table amount column.

    Converters call this with the physical page and the character-layer word
    boxes that form the amount's text. Migration reads `<column>_物理頁/_左端/
    _上端/_右端/_下端` as the amount's own position and never inherits the
    node's label position, so every amount row keeps its printed place.
    boxes are (left, top, right, bottom) display-page tuples; page mapping
    (spread shifts, left/right facing pages) stays with the caller. Absent
    amounts need no fields: without text no amount row is created.
    """
    if not isinstance(column, str) or not column:
        raise ValueError('Amount column must be a nonempty name')
    if type(page) is not int or page < 1:
        raise ValueError('Amount position requires a positive physical page')
    boxes = list(boxes)
    if not boxes:
        raise ValueError('Amount position requires at least one printed word box')
    for box in boxes:
        if (len(box) != 4 or any(type(v) not in (int, float) or not math.isfinite(v) for v in box)
                or not (box[0] < box[2] and box[1] < box[3])):
            raise ValueError('Amount word boxes must be four finite numbers with positive extent')
    return {column + '_' + suffix: value for suffix, value in zip(
        AMOUNT_POSITION_SUFFIXES,
        (page, min(b[0] for b in boxes), min(b[1] for b in boxes),
         max(b[2] for b in boxes), max(b[3] for b in boxes)), strict=True)}


def null_position_fields(column):
    """Absent-amount placeholder: keys keep wide rows homogeneous, NULLs create no row.

    Migration skips NULL amount cells before reading positions, so an absent
    amount never becomes a positionless amount row. Use only when the printed
    cell itself is absent; a printed amount always uses amount_position_fields.
    """
    if not isinstance(column, str) or not column:
        raise ValueError('Amount column must be a nonempty name')
    return {column + '_' + suffix: None for suffix in AMOUNT_POSITION_SUFFIXES}


def _coverage_word(word):
    """Accept (page, bbox, text) tuples, shared {page, bbox, text} mappings
    or Poppler-style word dicts."""
    if isinstance(word, (tuple, list)):
        page, box, text = word
        return page, tuple(box), text
    if 'bbox' in word:
        page, box, text = word['page'], tuple(word['bbox']), word['text']
    else:
        page = word.get('page')
        box = tuple(word[k] for k in ('xMin', 'yMin', 'xMax', 'yMax'))
        text = word.get('text', word.get('raw_text'))
    return page, box, text




def _word_key(text):
    return re.sub(r'\s+', '', unicodedata.normalize('NFKC', str(text)))


# Jurisdiction-common non-amount prints: a printed folio, or an era/year/date
# word. Bare years and bare counts never match: without 年/月/日/年度 they are
# indistinguishable from amounts and stay uncovered for the converter to fix.
NON_AMOUNT_WORD = re.compile(
    r'(?:[－―—–-][0-9０-９, ]+[－―—–-]'
    r'|(?:令和|平成|昭和|大正|明治|[RHS])?[0-9０-９]+(?:年度|年(?:[0-9０-９]+月(?:[0-9０-９]+日)?)?|月|日)'
    r'|第[0-9０-９]+(?:款|項|目|節)'
    r'|[(（]?[0-9]{1,4}[.．](?:0?[1-9]|1[0-2])[.．](?:0?[1-9]|[12][0-9]|3[01])[)）]?)')




COVERAGE_SIDECAR_SUFFIX = '.coverage.json'


# Out-of-scope table kinds, one shared vocabulary. Exclusion declarations
# transcribe an existing "table excluded" decision with a kind from here
# plus a free-text reason; an unknown kind or a missing reason stops the
# save. Kinds are never invented per table: proposing a new table to exclude
# goes through ask first.
EXCLUSION_KINDS = frozenset({
    '総括', '財源内訳', '節の一覧', '経費内訳', '数量表', '法定節の観測', '本文',
    '予備費の充用', '職員', '貸付金', '反復見出し', '親の繰り返し',
})


def validate_exclusions(exclusions):
    """Every exclusion carries a known kind and a nonempty reason.

    Two shapes: a zone ({pages, x_range}) for column-separated tables, or a
    precise box ({page, bbox}) for blocks the converter identified row by row.
    A straddling word stays in scope either way.
    """
    items = list(exclusions or [])
    for entry in items:
        if entry.get('kind') not in EXCLUSION_KINDS:
            raise ValueError(f"Unknown coverage exclusion kind: {entry.get('kind')!r}; "
                             f'choose from {sorted(EXCLUSION_KINDS)} or ask for a new table decision')
        if not isinstance(entry.get('reason'), str) or not entry['reason'].strip():
            raise ValueError(f'Coverage exclusion without a reason: {entry!r}')
        if 'bbox' in entry:
            box = entry['bbox']
            if (type(entry.get('page')) is not int or entry['page'] < 1 or len(box) != 4
                    or any(type(v) not in (int, float) or not math.isfinite(v) for v in box)
                    or not (box[0] < box[2] and box[1] < box[3])):
                raise ValueError(f'Coverage exclusion needs a page and a positive box: {entry!r}')
        else:
            if not entry.get('pages'):
                raise ValueError(f'Coverage exclusion needs observed page ranges: {entry!r}')
            for span in entry['pages']:
                if (len(span) != 2 or any(type(v) is not int for v in span) or span[0] < 1
                        or span[1] < span[0]):
                    raise ValueError(f'Coverage exclusion needs ascending page ranges: {entry!r}')
            xrange = entry.get('x_range')
            if xrange is not None and (len(xrange) != 2
                                       or any(type(v) not in (int, float) or not math.isfinite(v) for v in xrange)
                                       or not xrange[0] < xrange[1]):
                raise ValueError(f'Coverage exclusion needs an increasing x_range: {entry!r}')
    return items


def coverage_regions(words, *, kind, reason):
    """Describe read-but-unadopted words with their measured boxes.

    Callers supply words from their existing observation-only parser routes;
    neither page numbers nor rectangle edges are editorial declarations.
    """
    return [{'kind': kind, 'reason': reason, 'page': page, 'bbox': list(box)}
            for page, box, _ in map(_coverage_word, words)]


def coverage_sidecar(wide_path):
    """Scope sidecar next to a converter's wide table."""
    path = Path(wide_path)
    return path.with_name(path.stem + COVERAGE_SIDECAR_SUFFIX)


def write_coverage_words(wide_path, words, *, amount_columns=(), excluded_regions=(), plain_names=()):
    """Write the processed word scope beside a wide table for the pre-save check.

    words are (physical page, display-page box, printed text) tuples in the
    converter's native order. amount_columns are the converter's existing
    amount-column geometries as {header, x_range} entries in display-page x
    (spread converters unshift right-page edges back, like their amount
    boxes); bands are built from them when present, else fall back to
    clustering adopted amount rows (reported per table). Converters without
    fixed amount columns (free-positioned business or note amounts) omit them.
    excluded_regions are read-but-not-adopted blocks the converter identified
    itself, each with a shared-vocabulary kind and a reason ({kind, reason}
    plus {pages, x_range} or {page, bbox}); hand-written entries stay in code
    next to the layout decision that skips them. Kind/reason validation
    stops the save when missing.
    """
    normalized = []
    for word in words:
        page, box, text = _coverage_word(word)
        if not isinstance(text, str):
            raise ValueError('Coverage words require printed text')
        normalized.append({'page': page, 'bbox': list(box), 'text': text})
    columns = []
    for entry in amount_columns:
        xrange = entry['x_range']
        if len(xrange) != 2 or not xrange[0] < xrange[1]:
            raise ValueError(f'Amount columns need increasing x ranges: {entry!r}')
        columns.append({'header': entry.get('header'), 'x_range': list(xrange)})
    regions = []
    for entry in validate_exclusions(excluded_regions):
        record = {'kind': entry['kind'], 'reason': entry['reason']}
        if 'bbox' in entry:
            record.update({'page': entry['page'], 'bbox': list(entry['bbox'])})
        else:
            record.update({'pages': [list(span) for span in entry['pages']],
                           'x_range': list(entry['x_range']) if entry.get('x_range') else None})
        regions.append(record)
    sidecar = coverage_sidecar(wide_path)
    content = {'words': normalized, 'amount_columns': columns, 'excluded_regions': regions}
    if plain_names:  # names the document's settings declare to be items although they hold a note word
        content['plain_names'] = sorted(set(plain_names))
    sidecar.write_text(json.dumps(content, ensure_ascii=False) + '\n')
    return {'sidecar': str(sidecar), 'words': len(normalized),
            'amount_columns': len(columns), 'excluded_regions': len(regions)}


def combine_coverage_tables(tables):
    """Collect adopted prints from one original, retaining each print once.

    Coverage uses positions only; node keys from separate trees are unrelated.
    Duplicate ancestors must not duplicate amounts during split-word matching.
    """
    nodes, amounts = {}, {}
    for table in tables:
        for node in table.nodes:
            key = tuple(node.get(k) for k in ('physical_page', 'x0', 'y0', 'x1', 'y1',
                                             'code_text', 'name_text'))
            nodes[key] = node
        for amount in table.amounts:
            key = tuple(amount.get(k) for k in ('physical_page', 'x0', 'y0', 'x1', 'y1', 'amount_text'))
            amounts[key] = amount
    return NodeTables(list(nodes.values()), list(amounts.values()))


def check_table_coverage(wide_path, tables, *, require=True, control_tables=(), recheck=None):
    """Pre-save digit coverage next to the tree check.

    Reads the converter's scope sidecar beside its wide table and requires
    every printed digit in scope to be an amount row or a known non-amount.
    Uncovered prints fail loudly with counts and page/box/text examples.
    require=False (scan PDFs, out of this change's scope) reports without
    tables instead of failing on a missing scope. recheck (a
    digit_recheck.Recheck) adds Jev stops for weakly passed and out-of-band
    digits; it never clears a stop.
    """
    sidecar = coverage_sidecar(wide_path)
    if not sidecar.is_file():
        if require:
            raise ValueError(f'Digit coverage scope missing beside {wide_path}')
        return {'passed': True, 'counts': {}, 'digit_words': 0, 'uncovered': [],
                'status': '対象外', 'reason': '文字層の処理対象外'}
    scope = json.loads(sidecar.read_text())
    # Imported here: the check module reads the shared helpers of this one.
    from ingestion.lib.coverage_checks import check_digit_coverage
    result = check_digit_coverage(scope['words'], tables, control_tables=control_tables,
                                  exclusions=scope.get('excluded_regions', ()),
                                  amount_columns=scope.get('amount_columns', ()), recheck=recheck)
    sidecar.with_name(sidecar.name.removesuffix(COVERAGE_SIDECAR_SUFFIX)
                      + '.coverage-uncovered.json').write_text(
        json.dumps({'counts': result['counts'], 'digit_words': result['digit_words'],
                    'uncovered': result['uncovered'], 'reported': result['reported'],
                    'bands_from': result['bands_from'], 'exclusions': result['exclusions'],
                    'jev': result['jev'], 'elapsed': result['elapsed']}, ensure_ascii=False) + '\n')
    if result['uncovered']:
        examples = ', '.join(
            f"p{u['page']}@{u['bbox'][0]:.1f},{u['bbox'][1]:.1f}={u['text']!r}"
            + (f" jev={u['jev']:.2f}" if u.get('jev') is not None else '')
            for u in result['uncovered'][:10])
        stopped = sum(1 for u in result['uncovered'] if u.get('rule'))
        raise ValueError(f"Uncovered printed digits: {result['counts']}, "
                         f"{len(result['uncovered'])} blocked ({stopped} by Jev) of {result['digit_words']} "
                         f"({len(result['reported'])} reported prose) e.g. {examples}")
    return result


def _contains(outer, inner, tolerance):
    return (outer[0] - tolerance <= inner[0] and outer[1] - tolerance <= inner[1]
            and inner[2] <= outer[2] + tolerance and inner[3] <= outer[3] + tolerance)








DOCUMENT_NUMBER = re.compile(
    r'[・．.、,]?(?:(?:令和|平成|昭和|大正|明治)[0-9]+年)?第[0-9]+号'
    r'(?:[・．.、,](?:(?:令和|平成|昭和|大正|明治)[0-9]+年)?第?[0-9]+号)*'
    r'(?:議案)?(?:(?:市|区|町|村)?議会議決|区議会)?'
    r'[・．.、,]?'  # a list that goes on in the next line ends in its separator (`令和６年第６号・`)
    r'|[0-9]+[^0-9,円△▲\-]+第[0-9]+号(?:市|区|町|村)長決定')


def _notation_context(words, matches, strong=None, strong_boxes=None):
    """Locate whole, spatially adjacent notation fragments without exempting a row.

    strong (optional) is a stricter predicate; the boxes of its matches are
    also added to strong_boxes.
    """
    lines = defaultdict(list)
    for raw in words:
        page, box, text = _coverage_word(raw)
        lines[(page, round(box[1]))].append((box, _word_key(text)))
    matched = set()
    merged_lines = {}
    for (page, y), line in sorted(lines.items()):
        if not merged_lines or page != anchor[0] or y - anchor[1] > 2:
            anchor = (page, y)
            merged_lines[anchor] = []
        merged_lines[anchor].extend(line)
    for (page, _), line in merged_lines.items():
        line.sort(key=lambda item: item[0][0])
        for start in range(len(line)):
            joined = ''
            for end in range(start, min(start + 16, len(line))):
                if end > start and line[end][0][0] - line[end - 1][0][2] > 12:
                    break
                joined += line[end][1]
                if matches(joined):
                    matched.update((page, tuple(box)) for box, _ in line[start:end + 1])
                    if strong is not None and strong(joined):
                        strong_boxes.update((page, tuple(box)) for box, _ in line[start:end + 1])
    return matched, lines, merged_lines


def _document_notation(text):
    return (NON_AMOUNT_WORD.fullmatch(text) or DOCUMENT_NUMBER.fullmatch(text)
            or is_fiscal_year_notation(text))




def _exclusion_hit(word, exclusions, tolerance):
    """Match a word against declared non-ingested table regions.

    Zone form: the word's page sits in the entry's page ranges and its box
    lies fully inside the x_range. Box form: same page and full containment
    in the entry's box. A straddling word stays in scope either way.
    Returns the entry index for hit counting.
    """
    for index, entry in enumerate(exclusions):
        if not isinstance(word['page'], int):
            continue
        if 'bbox' in entry:
            if word['page'] != entry['page']:
                continue
            if not _contains(tuple(entry['bbox']), tuple(word['bbox']), tolerance):
                continue
            return index
        if not any(first <= word['page'] <= last for first, last in entry['pages']):
            continue
        xrange = entry.get('x_range')
        if xrange is not None:
            left, top, right, bottom = word['bbox']
            if not (xrange[0] - tolerance <= left and right <= xrange[1] + tolerance):
                continue
        return index
    return None


















def quantity_regions(rows, metadata):
    """Use existing typed quantity cells and their own measured positions."""
    monetary = {c for item in metadata.get('units', [])
                if item['text'] in ('円', '千円') and item['scope']['kind'] == 'columns'
                for c in item['scope']['columns']}
    kinds = ('件数', '人数', '回数', '人口', '数量', '対象者数', '受給者数', '延人数',
             '世帯数', '児童数', '園児数', '教員数', '学級数', '生徒数', '事業所数', '者数', '施工数')
    regions = {}
    for row in rows:
        for column, value in row.items():
            if value is None or column in monetary or not (re.sub(r'（[^）]*）|等$', '', column).endswith(kinds) or column.startswith('数量表_')):
                continue
            pos = _position(row, column + '_')
            if None in pos.values():
                continue
            key = tuple(pos.values())
            regions[key] = {'kind': '数量表', 'reason': '既存の数量セルの印字位置。金額の欄ではない。',
                            'page': pos['physical_page'], 'bbox': [pos[k] for k in ('x0', 'y0', 'x1', 'y1')]}
    return list(regions.values())


def with_annotations(wide_path, tables, *, raw_rows=(), adopted=None):
    """Add non-additive annotation rows only when text-PDF scope is available."""
    from ingestion.lib.annotations import add_annotations
    sidecar = coverage_sidecar(wide_path)
    return add_annotations(tables, json.loads(sidecar.read_text()), raw_rows=raw_rows, adopted=adopted) if sidecar.exists() else tables


def migrate_rows(rows: list[dict], metadata: dict) -> NodeTables:
    """Deduplicate repeated ancestors by declared grain and parent, never by name.

    Unsupported column groups fail explicitly instead of silently dropping print.
    A grouped context is split by column prefixes. Without per-level positions,
    consecutive equal level values under one parent identify a repeated ancestor.
    """
    contexts = metadata.get('column_contexts', [])
    if not contexts:
        raise ValueError('段の column_contexts がない')
    columns = set(rows[0]) if rows else set()
    units = {}
    for item in metadata.get('units', []):
        for column in columns if item['scope']['kind'] == 'table' else item['scope']['columns']:
            units[column] = item['text']
    specs = []
    for context in contexts:
        names = [c for c in context['columns'] if c.endswith('_名称') and c.count('_') == 1]
        if not names:
            specs.append((context, None))
            continue
        for name in names:
            prefix = name.removesuffix('名称')
            path = context['header_path']
            if not path:
                raise ValueError(f'段の見出し不明: {prefix}')
            own = dict(context)
            if len(names) > 1:
                own['columns'] = [c for c in context['columns'] if c.startswith(prefix)]
                level = prefix[:-1]
                own['header_path'] = path[:path.index(level) + 1] if level in path else [*path, level]
                # Shared row coordinates describe the leaf, not its ancestors.
                own['grain_columns'] = [c for c in context['grain_columns'] if c.startswith(prefix)]
                positions = [c for c in own['columns'] if c.endswith(('物理頁', '上端', '原典yMin', 'yMin'))]
                if positions:
                    own['grain_columns'] = positions
                own['_contiguous'] = not positions
            elif any(c.endswith('_名称') for c in context['grain_columns']):
                own['_contiguous'] = True
            specs.append((own, prefix))
    principal_axis = next((c['header_path'][0] for c, p in specs if p is not None
                           and any(r.get(p + '名称') is not None or r.get(p + '番号') is not None for r in rows)), None)
    runs = {}
    nodes, amounts, seen, amount_seen = [], [], {}, {}
    issues = []
    unread = unresolved = 0
    unread_seen = set()
    used = set()
    for row_index, row in enumerate(rows):
        active = {}
        previous_by_axis = {}
        subject = branch = None
        for context_index, (context, prefix) in enumerate(specs):
            if prefix is None:
                continue
            name, code = row.get(prefix + '名称'), row.get(prefix + '番号')
            if name is None and code is None:
                continue
            path = context['header_path']
            axis = path[0]
            # A header inside a leaf's amount breakdown is an amount, not another node.
            breakdown = context.get('amount_breakdown')
            if breakdown and name in breakdown['headers']:
                parent = active.get(breakdown['parent_prefix'])
                if parent is None:
                    unresolved += 1; issues.append(f'金額内訳の親がない: {breakdown["parent_prefix"]}')
                    continue
                column = prefix + '金額'
                _add_amount(amounts, amount_seen, unread_seen, parent, '／'.join([p for p in path[:-1] if not p.isdigit()] + [name]),
                            row.get(column), units.get(column), _amount_position(row, column, context), issues)
                used.add(column)
                continue
            parent = previous_by_axis.get(axis)
            if axis == principal_axis:
                parent = subject
            elif parent is None:
                # Statutory setsu are an independent breakdown; other successive
                # explanation axes continue the previously printed explanation.
                parent = subject if axis == '節' or context.get('semantic_role') == 'setsu' else branch or subject
            own_grain = [row.get(c) for c in context['grain_columns']]
            if context.get('_contiguous'):
                signature = (parent, tuple(row.get(c) for c in context['columns']))
                previous = runs.get(context_index)
                first_row = previous[2] if previous and previous[:2] == (signature, row_index - 1) else row_index
                runs[context_index] = (signature, row_index, first_row)
                own_grain = [first_row]
            if not own_grain or all(v is None for v in own_grain):
                unresolved += 1; issues.append(f'{prefix}: 項目の識別位置がない')
                continue
            identity = (context_index, parent, *own_grain)
            key = 'n-' + hashlib.sha256(json.dumps(identity, ensure_ascii=False, default=str).encode()).hexdigest()[:24]
            pos = _position(row, prefix)
            if pos['physical_page'] is None and len(context['grain_columns']) and prefix not in ('款_', '項_', '目_'):
                # Legacy leaves often expose only one unprefixed position.
                pos = _position(row, '')
            depth = 1 if parent is None or seen[parent]['axis_header'] != axis else seen[parent]['depth'] + 1
            level = path[-1] if len(path) > 1 else None
            if path[-1].isdigit():
                level = None  # The old context uses a generated depth, not a printed heading.
            node = {'node_key': key, 'parent_node_key': parent, 'axis_header': axis,
                    'depth': depth, 'level_header': level, 'code_text': code, 'name_text': name, **pos}
            if key in seen:
                if any(seen[key][field] != node[field] for field in ('code_text', 'name_text')):
                    issues.append(f'反復した項目の名称・番号が一致しない: {key}')
            else:
                if parent is None and axis != principal_axis:
                    unresolved += 1; issues.append(f'{prefix}: 科目の親がない')
                seen[key] = node; nodes.append(node)
            active[prefix] = key
            previous_by_axis[axis] = key
            if axis == principal_axis:
                subject = key
            elif axis != '節' and context.get('semantic_role') != 'setsu':
                branch = key
            for column in context['columns']:
                if column not in units or column in context['grain_columns'] or column.endswith(('番号', '名称')):
                    continue
                used.add(column)
                if row.get(column) is None:
                    continue
                suffix = column.removeprefix(prefix)
                if suffix == '金額':
                    header = '／'.join(p for p in path if not p.isdigit()) if axis != '節' else '節／金額'
                elif suffix.startswith('備考_') and suffix.endswith('金額'):
                    # The declared owner path distinguishes annotations from the
                    # executed breakdown. No annotation text or table ID is needed.
                    header = '／'.join([*context['header_path'], *suffix.split('_')])
                elif suffix == '計':
                    header = '予算現額／計'
                elif suffix in ('当初予算額', '補正予算額', '継続費及び繰越事業費繰越額', '予備費支出及び流用増減'):
                    header = '予算現額／' + suffix
                else:
                    header = suffix
                _add_amount(amounts, amount_seen, unread_seen, key, header,
                            row.get(column), units[column], _amount_position(row, column, context), issues)
        for context_index, (context, prefix) in enumerate(specs):
            if prefix is not None:
                continue
            candidates = [n for p, n in active.items()
                          if all(c.startswith(p) for c in context['grain_columns'])]
            owned = [c for c in context['columns'] if c in units and row.get(c) is not None]
            if owned and len(candidates) != 1:
                issues.append(f'金額のみの欄の所属を決められない: {context["header_path"]}')
            for column in owned:
                used.add(column)
                if len(candidates) == 1:
                    path = context['header_path']
                    if not path:
                        issues.append(f'金額の見出し不明: {column}'); continue
                    _add_amount(amounts, amount_seen, unread_seen, candidates[0], '／'.join([*path, column.split('_')[-1]]),
                                row[column], units[column], _amount_position(row, column, context), issues)
    unused = [c for c in units if c not in used and any(r.get(c) is not None for r in rows)]
    if unused:
        issues.append(f'金額の所属・見出しを解決できない列: {unused}')
    return NodeTables(nodes, amounts, len(unread_seen), unresolved, sorted(set(issues)))


def _add_amount(amounts, seen, unread, key, header, text, unit, pos, issues):
    if text is None:
        return
    if not header or not unit:
        issues.append(f'金額の見出し・単位不明: {key}'); return
    if number(text) is None:
        unread.add((key, header, text)); return
    identity = (key, header)
    record = {'node_key': key, 'header_path': header, 'amount_text': text, 'unit_text': unit, **pos}
    if identity in seen:
        if seen[identity]['amount_text'] != text:
            issues.append(f'反復した金額が一致しない: {key}/{header}')
        return
    seen[identity] = record; amounts.append(record)


@cache
def phase_dictionary() -> dict[tuple[str, str], str]:
    path = Path(__file__).resolve().parents[2] / 'shared/fiscal_amount_map.csv'
    with path.open() as stream:
        return {(row['document_kind'], row['header']): row['phase'] for row in csv.DictReader(stream)}


def amount_phase(header: str, document_kind: str, axis: str, level: str | None) -> str | None:
    header = header.replace('/', '／')
    last = header.split('／')[-1]
    dictionary = phase_dictionary()
    for kind, label in ((document_kind, header), (document_kind, last), ('', header), ('', last)):
        if (kind, label) in dictionary:
            return dictionary[kind, label] or None
    # An amount labelled with its own declared level inherits the axis's
    # dictionary meaning (e.g. current year inside a project breakdown).
    if header.startswith(axis + '／') and last == level:
        return dictionary.get((document_kind, axis), dictionary.get(('', axis))) or None
    # A trailing Japanese-era year/period word (e.g. past-year breakdown columns)
    # names no current-year phase. Keep after inheritance so the current year keeps
    # the axis meaning; keep the same rule in dbt SQL (see FISCAL_YEAR_PATTERN).
    if is_fiscal_year_notation(last):
        return None
    return None




def write_tables(directory: Path, table_id: str, tables: NodeTables, document_kind: str = 'settlement',
                declared: list[dict] | None = None) -> dict[str, Path]:
    """Write a verified candidate pair; failed tables never become saved candidates."""
    if not tables.nodes or not tables.amounts:
        raise ValueError('Empty node/amount output is not supported')
    from ingestion.lib.tree_checks import check_tree  # imported here: the check module reads amount_phase of this one
    check = check_tree(tables.nodes, tables.amounts, document_kind, declared)
    if tables.issues or tables.unread_amount_count or tables.unresolved_parent_count or not check['passed']:
        raise ValueError(f'Table failed node migration/tree check: {tables.issues}; '
                         f'unread={tables.unread_amount_count}; unresolved={tables.unresolved_parent_count}; '
                         f'{check["counts"]}; {check["issues"]}')
    paths = {kind: directory / f'{table_id}-{kind}.parquet' for kind in ('nodes', 'amounts')}
    write_parquet(paths['nodes'], tables.nodes, columns=NODE_COLUMNS)
    try:
        write_parquet(paths['amounts'], tables.amounts, columns=AMOUNT_COLUMNS)
    except BaseException:
        paths['nodes'].unlink(missing_ok=True)
        raise
    return paths
