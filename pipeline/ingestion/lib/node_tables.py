"""Migrate declared PDF columns to printed nodes and amounts; reject ambiguous layouts."""
from __future__ import annotations

from collections import Counter, defaultdict
import csv
from dataclasses import dataclass
from functools import cache
import hashlib
import json
import math
import re
import time
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


def _word_digits(text):
    return re.sub(r'[^0-9]', '', unicodedata.normalize('NFKC', str(text)))


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


# Printed control totals. Every settlement prints its aggregate total row; the
# adopted tables keep it as an observation, not as amount rows, and every
# converter asserts its shape. Digits sharing the total row's baseline are
# classified as control totals, counted visibly, never silently passed.
TOTAL_LABELS = frozenset({'歳出合計', '歳出総計'})


COVERAGE_SIDECAR_SUFFIX = '.coverage.json'


# Out-of-scope table kinds, one shared vocabulary. Exclusion declarations
# transcribe an existing "table excluded" decision with a kind from here
# plus a free-text reason; an unknown kind or a missing reason stops the
# save. Kinds are never invented per table: proposing a new table to exclude
# goes through ask first.
EXCLUSION_KINDS = frozenset({
    '総括', '財源内訳', '節の一覧', '経費内訳', '数量表', '法定節の観測', '本文',
    '予備費の充用', '職員', '貸付金', '反復見出し',
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


def write_coverage_words(wide_path, words, *, amount_columns=(), excluded_regions=()):
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
    sidecar.write_text(json.dumps({'words': normalized, 'amount_columns': columns,
                                   'excluded_regions': regions}, ensure_ascii=False) + '\n')
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


# A glued percent sign is never an adopted amount: converters keep rates as
# text or drop them, and parse_amount rejects suffixed values. Bare 円 glue is
# excluded: 円-suffixed prints are adopted amounts and must join their row.
PERCENT_WORD = re.compile(r'[△▲\-－―—]?[0-9][0-9,\.]*[％%]|[(（][0-9][0-9,\.]*[％%][)）]')


# A digit-leading word glued to non-amount characters (codes and counters:
# １０款, １管, 11役, 1報, 1項). 円 glue is excluded (adopted amounts join
# their row); dots and brackets are excluded (versions, decimals, annotations).
CODE_WORD = re.compile(r'[0-9０-９]+[^0-9０-９,△▲\-－―—\.\(\)（）<>＜＞％%円]+')


QUANTITY_PHRASE = re.compile(
    r'(?:[^0-9円]|[0-9][0-9,]*(?:人|名|件|食|回|日|個|台|戸|世帯|本|床|箇所|校|番|丁目|歳|か月|号|基|m2|㎡|km|m|ｍ|月|路線))+')
ORDINAL_PHRASE = re.compile(r'(?:[^0-9,円]|第[0-9]+(?:款|項|目|節|土曜日|ブロック|期))+')


DOCUMENT_NUMBER = re.compile(
    r'[・．.、,]?(?:(?:令和|平成|昭和|大正|明治)[0-9]+年)?第[0-9]+号'
    r'(?:[・．.、,](?:(?:令和|平成|昭和|大正|明治)[0-9]+年)?第?[0-9]+号)*'
    r'(?:(?:市|区|町|村)?議会議決)?'
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


# Bare folios live in the footer strip. All processed PDFs are ~842pt tall
# with body bottoms at or below 800 (converters read body bands only, and no
# adopted amount prints with top > 795); a bare integer below the strip is an
# amount or a code, never a folio. Revisit if a taller page scope arrives.
FOOTER_TOP = 795.0


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


LEVEL_MARKS = ('款', '項', '目', '節')


def _level_marks(code, level):
    """A subject's own code printed with its level mark: 1項, 第1項, （目）2."""
    if not code or level not in LEVEL_MARKS:
        return ()
    return (f'{code}{level}', f'第{code}{level}', f'({level}){code}')


# An amount-shaped token is never a label, even inside a node box and even
# when it substrings the name: grouping separators, 円 glue and leading
# signs mark prints, while bare codes stay label-eligible.
def _amount_shaped(key):
    return bool(re.search(r'[0-9]+(?:,[0-9]+)+|[0-9,]+円|[△▲\-－―—][0-9]', key))


def _verified_total_boxes(words, tables, amount_columns, tolerance, candidate_baselines):
    """Confirm unlabeled totals using direct siblings in one adopted tree.

    An unlabeled row requires two independent nonzero columns, after all
    their siblings. An explicit total label still requires the exact
    sum, including zero. Match each column's complete print; a lone zero cannot establish a total.
    """
    baselines = defaultdict(list)
    total_labels = defaultdict(list)
    for raw in words:
        page, box, text = _coverage_word(raw)
        if _word_key(text) in ('計', '合計', '小計') or _word_key(text) in TOTAL_LABELS:
            total_labels[page, round(box[1])].append(box)
        if (page, round(box[1])) in candidate_baselines and re.fullmatch(r'[0-9,△▲\-－―—]+', _word_key(text)):
            baselines[page, round(box[1])].append((box, text))
    verified = set()
    for table in tables:
        nodes = {n['node_key']: n for n in table.nodes}
        siblings = defaultdict(list)
        amount_lookup = defaultdict(list)
        parent_amounts = defaultdict(list)
        for amount in table.amounts:
            node = nodes.get(amount['node_key'])
            if (node is None or node['axis_header'] == '注記' or any(amount[k] is None for k in ('physical_page', 'x0', 'y0', 'x1', 'y1'))
                    or number(amount['amount_text']) is None):
                continue
            identity = (node['parent_node_key'], node['axis_header'], node['level_header'],
                        amount['header_path'], amount['unit_text'])
            siblings[identity].append(amount)
            amount_lookup[amount['node_key'], amount['header_path'], amount['unit_text']].append(amount)
            parent_amounts[amount['node_key'], amount['unit_text']].append(amount)
        # Missing zero leaf cells have no amount rows. As in check_tree,
        # their contribution is zero, but only an explicit 計 row may verify
        # the zero and the header must exist on this same axis/level.
        node_groups = defaultdict(list)
        headers = defaultdict(set)
        for node in table.nodes:
            if node['axis_header'] != '注記':
                node_groups[node['parent_node_key'], node['axis_header'], node['level_header']].append(node)
        for identity in siblings:
            headers[identity[1:3]].add(identity[-2:])
        zero_groups = []
        for identity, children in node_groups.items():
            located = [n for n in children if n['physical_page'] is not None and n['y1'] is not None]
            if not located:
                continue
            for header, unit in headers[identity[1:]]:
                if (*identity, header, unit) in siblings:
                    continue
                columns = [c['x_range'] for c in amount_columns
                           if c.get('header') in (header, header.split('／')[-1])]
                if len(columns) == 1:
                    zero_groups.append(((*identity, header, unit), 0,
                                        max((n['physical_page'], n['y1']) for n in located),
                                        *columns[0], len(children), None))
        groups = list(siblings.items())
        for identity, amounts in siblings.items():
            pages = defaultdict(list)
            for amount in amounts:
                pages[amount['physical_page']].append(amount)
            if len(pages) > 1:
                groups.extend(((*identity[:-2], 'page', page, *identity[-2:]), values)
                              for page, values in pages.items())
        # Multiple printed subtables can share one parent. Their explicit
        # 計 rows delimit the sibling segments; keep each header independent.
        for identity, amounts in siblings.items():
            for page in {a['physical_page'] for a in amounts}:
                values = [a for a in amounts if a['physical_page'] == page]
                left = min(a['x0'] for a in values)
                stops = sorted(y for (p, y), labels in total_labels.items()
                               if p == page and any(b[2] <= left for b in labels))
                previous = float('-inf')
                for stop in stops:
                    segment = [a for a in values if previous < a['y0'] < stop]
                    if segment:
                        groups.append(((*identity[:-2], 'segment', page, stop, *identity[-2:]), segment))
                    previous = stop
        totals = zero_groups
        for identity, amounts in groups:
            header = identity[-2]
            columns = [entry['x_range'] for entry in amount_columns
                       if entry.get('header') in (header, header.split('／')[-1])]
            aligned = [span for span in columns if all(span[0] - tolerance <= (a['x0'] + a['x1']) / 2 <= span[1] + tolerance for a in amounts)]
            if len(aligned) == 1:
                left, right = aligned[0]
            else:
                left, right = min(a['x0'] for a in amounts), max(a['x1'] for a in amounts)
            expected = sum(number(a['amount_text']) for a in amounts)
            parent_prints = [a for a in amount_lookup[identity[0], header, identity[-1]]
                             if number(a['amount_text']) == expected and a['x0'] is not None
                             and a['x0'] < right + tolerance and left - tolerance < a['x1']]
            if parent_prints:
                left = min(left, min(a['x0'] for a in parent_prints))
                right = max(right, max(a['x1'] for a in parent_prints))
            totals.append((identity, expected,
                           max((a['physical_page'], a['y1']) for a in amounts), left, right, len(amounts),
                           {p:min(nodes[a['node_key']]['y0'] for a in amounts
                                   if a['physical_page'] == p and nodes[a['node_key']]['y0'] is not None)
                            for p in {a['physical_page'] for a in amounts}
                            if any(a['physical_page'] == p and nodes[a['node_key']]['y0'] is not None for a in amounts)}))
        named_lines = defaultdict(list)
        for raw in words:
            p, b, text = _coverage_word(raw)
            named_lines[p, round(b[1])].append((b, _word_key(text)))
        balance_cache = {(identity[0], expected, identity[-1]):
                         any(number(a['amount_text']) == expected for a in parent_amounts[identity[0], identity[-1]])
                         for identity, expected, *_ in totals}
        matched_rows = []
        established = defaultdict(list)
        for (page, y), row in baselines.items():
            matches = defaultdict(list)
            for identity, expected, last, left, right, sibling_count, first in totals:
                leading = first is not None and page in first and 0 < first[page] - y <= 30
                after = (page, y) > last
                parent_balance = balance_cache[identity[0], expected, identity[-1]]
                if not after and not leading:
                    label_possible = total_labels[page, y] or any(
                        _word_key(identity[-2].split('／')[-1]) == text for _, text in named_lines[page, y])
                    if not parent_balance or not label_possible:
                        continue
                parts = sorted(((box, text) for box, text in row
                                if box[0] < right + tolerance and left - tolerance < box[2]),
                               key=lambda item: item[0][0])
                runs = []
                for part in parts:
                    if not runs or part[0][0] - runs[-1][-1][0][2] > 12:
                        runs.append([])
                    runs[-1].append(part)
                # A complete money word can touch an adjacent column's span.
                # Match complete contiguous words, never a digit substring.
                exact = [run[start:end] for run in runs
                         for start in range(len(run)) for end in range(start + 1, len(run) + 1)
                         if number(''.join(text for _, text in run[start:end])) == expected]
                parts = exact[0] if len(exact) == 1 else []
                labeled = parts and any(box[2] <= parts[0][0][0] for box in total_labels[page, y])
                if parts and any(_word_key(identity[-2].split('／')[-1]) == text and box[2] <= parts[0][0][0]
                                 for box, text in named_lines[page, y]):
                    labeled = True
                # In a multi-column page an explicit 計 can precede some
                # siblings vertically while following them in reading order.
                # Require the same balanced adopted parent to prove the sum.
                if not after and not leading and not (labeled and parent_balance):
                    continue
                if leading:
                    parent = nodes.get(identity[0])
                    known = amount_lookup[identity[0], identity[-2], identity[-1]]
                    if parent is None or len(known) != 1 or number(known[0]['amount_text']) != expected:
                        continue
                    # Only a continuation total of the same balanced parent
                    # directly above its first child can repeat before leaves.
                    labeled = True
                if (parts and (sibling_count >= 2 or labeled)
                        and number(''.join(text for _, text in parts)) == expected):
                    if (leading or labeled) and expected != 0:
                        verified.update((page, tuple(box)) for box, _ in parts)
                    matches[identity[:-2]].append((identity[-2], expected, parts))
            for identity, group in matches.items():
                nonzero = [(header, {tuple(box) for box, _ in parts})
                           for header, expected, parts in group if expected != 0]
                independent = any(left_header != right_header and not left_boxes.intersection(right_boxes)
                                  for index, (left_header, left_boxes) in enumerate(nonzero)
                                  for right_header, right_boxes in nonzero[index + 1:])
                labeled = any(any(label[2] <= parts[0][0][0]
                                                    for label in total_labels[page, y])
                              for _, expected, parts in group)
                if independent or labeled:
                    verified.update((page, tuple(box)) for _, expected, parts in group
                                    if independent or labeled for box, _ in parts)
                    height = max(box[3] - box[1] for _, _, parts in group for box, _ in parts)
                    established[page, identity].append((y, height))
            matched_rows.append((page, y, matches))
        # A wrapped total cell can print one row below the established total.
        # Its nonzero value must match the same sibling group's sum exactly.
        for page, y, matches in matched_rows:
            for identity, group in matches.items():
                if any(0 < y - top <= 3 * height for top, height in established[page, identity]):
                    verified.update((page, tuple(box)) for _, expected, parts in group
                                    if expected != 0 for box, _ in parts)
    return verified


def _continued_subject_boxes(words, control_tables, tolerance):
    """Confirm repeated 款/項/目 codes against an adopted ancestor chain."""
    by_page = defaultdict(list)
    for raw in words:
        page, box, text = _coverage_word(raw)
        by_page[page].append((box, _word_key(text)))
    page_headers = {}
    page_codes = {}
    for page, printed in by_page.items():
        headers = [(box, text) for box, text in printed
                   if text.strip('()（）') in ('款', '項', '目', '款項', '款項目')]
        if {'款', '項', '目'} <= set(''.join(text.strip('()（）') for _, text in headers)):
            page_headers[page] = headers
            numeric = defaultdict(list)
            # A code can be split into touching glyphs (10 -> 1, 0).
            digits = sorted(((box, text) for box, text in printed if re.fullmatch(r'[0-9]+', text)), key=lambda item: (round(item[0][1]), item[0][0]))
            for start, (box, text) in enumerate(digits):
                numeric[text].append((box, [box]))
                joined, parts = text, [box]
                for next_box, next_text in digits[start + 1:start + 3]:
                    if abs(next_box[1] - box[1]) > 2 or not -tolerance <= next_box[0] - parts[-1][2] <= tolerance:
                        break
                    joined += next_text
                    parts.append(next_box)
                    union = (box[0], min(b[1] for b in parts), next_box[2], max(b[3] for b in parts))
                    numeric[joined].append((union, list(parts)))
            fragments = {tuple(part) for values in numeric.values() for _, parts in values
                         if len(parts) > 1 for part in parts}
            page_codes[page] = {text:[(box, parts) for box, parts in values
                                     if len(parts) > 1 or tuple(box) not in fragments]
                                for text, values in numeric.items()}
    matched = set()
    for table in control_tables:
        nodes = {n['node_key']: n for n in table.nodes}
        code_columns = defaultdict(set)
        for node in table.nodes:
            if node['level_header'] not in ('款', '項', '目') or node['x0'] is None:
                continue
            for box, text in by_page.get(node['physical_page'], ()):
                if text and _word_digits(text) and not _amount_shaped(text) and _word_key(str(node['code_text'] or '') + str(node['name_text'] or '')).startswith(text) and abs(box[0] - node['x0']) <= tolerance and node['y0'] - tolerance <= box[1] <= node['y1'] + tolerance:
                    code_columns[node['level_header']].add(round(box[0], 1))
        for moku in table.nodes:
            if moku['level_header'] != '目':
                continue
            chain = [moku]
            while chain[-1]['parent_node_key'] in nodes:
                chain.append(nodes[chain[-1]['parent_node_key']])
            chain.reverse()
            if [n['level_header'] for n in chain] != ['款', '項', '目'] or any(
                    n['code_text'] is None or n['x0'] is None for n in chain):
                continue
            for page, headers in page_headers.items():
                candidates = [[(box, parts) for box, parts in page_codes[page].get(_word_key(n['code_text']), ())
                               if any(abs(box[0] - x) <= max(tolerance, (box[2] - box[0]) / 2)
                                      for x in code_columns[n['level_header']])] for n in chain]
                for first, first_parts in candidates[0]:
                    if not any(0 < first[1] - header[1] <= 6 * (header[3] - header[1])
                               for header, _ in headers):
                        continue
                    row = list(first_parts)
                    for column in candidates[1:]:
                        hits = [(box, parts) for box, parts in column if abs(box[1] - first[1]) <= 2]
                        if len(hits) != 1:
                            break
                        row.extend(hits[0][1])
                    # A printed hierarchy header can carry a prefix (款/項)
                    # while 目 starts on its own line. Match only observed
                    # ancestor codes in their adopted column positions.
                    matched.update((page, tuple(box)) for box in row)
    return matched


# Digits a weak rule passed or that no band owns: the only ones Jev is asked.
RECHECKED = ('non_amount', 'reported')


def _apply_recheck(normalized, words, amount_columns, recheck):
    """Stop weakly passed and out-of-band digits Jev reads as amounts to ingest.

    Mutates covered to 'jev_blocked' (never the other way) and attaches the
    probability as 'jev'. Returns the persistable answers and a short summary.
    """
    index = recheck.context_index((_coverage_word(w) for w in words), amount_columns)

    def context(w):
        return index.context(w['page'], w['bbox'], w['text'])
    asked = [w for w in normalized if w['covered'] in RECHECKED and w.get('form') != 'document_number']
    blocked = [w for w in normalized if w['covered'] == 'blocked']
    contexts = [context(w) for w in asked]
    try:
        probabilities = recheck.answers(contexts)
    except recheck.unavailable:
        # A table with a band stop fails anyway, and the stop is the clearer reason.
        if not blocked:
            raise
        asked, contexts, probabilities = [], [], []
    answers, stopped = {}, 0
    for w, c, p in zip(asked, contexts, probabilities):
        answers[recheck.fingerprint(c)] = p
        w['jev'] = p
        if p >= recheck.threshold:
            w['rule'], w['covered'] = w['covered'], 'jev_blocked'
            stopped += 1
    hints = recheck.answers([context(w) for w in blocked], required=False) if blocked else []
    for w, p in zip(blocked, hints):
        if p is not None:
            w['jev'] = p
    return {'answers': answers, 'asked': len(asked), 'stopped': stopped,
            'hinted': sum(p is not None for p in hints)}


def check_digit_coverage(words, tables, *, tolerance=0.5, exclusions=(), amount_columns=(), control_tables=(),
                         recheck=None):
    """Every printed digit in scope is an amount row or a known non-amount.

    words are the printed words of the pages and regions the converter
    processed. tables are migrated node tables whose amount rows carry their
    own printed positions. Amount-column bands are built commonly from the
    converter's amount-column geometry, with row spans as a visible fallback.
    A digit word is covered when (a) it sits inside an amount's own box as
    part of that print, (b) it sits inside its node's box and reads as the
    node's code or name, (c) it fullmatches a jurisdiction-common non-amount
    pattern (folio, era/year/date, glued percent, code glued to characters,
    footer folio, percent pair), (d) it shares a control-total baseline, or
    (e) a merged word split into adopted amounts rejoins exactly, or (f) its
    value is a verified sibling total. control_tables retain independent
    trees for total arithmetic when tables contains pooled coverage prints.
    Leftovers split by band: inside an amount band they are BLOCKED prints
    (a dropped amount in amount territory stops the save); outside bands
    they are REPORTED prose (counted with examples, never blocking).
    Excluded regions (declared non-ingested tables with a kind and a reason)
    are skipped with visible counts but never block. Amount bands come from
    the converter's amount-column heading positions when supplied, else fall
    back to clustering adopted amount rows. Returns
    the elapsed seconds alongside the verdict for per-table timing reports.
    Overhanging fragments require exact digit reconstruction; nearby unmatched prints stay uncovered.
    recheck (digit_recheck.Recheck) asks Jev about exactly two kinds of digit:
    those a weak rule passed (non_amount) and those reported outside every
    band. An answer at or above its threshold stops the save ('jev_blocked',
    listed with the rule that passed it); a lower one clears nothing. Digits
    explained by adopted amounts, labels, totals or declared exclusions are
    never asked, and a digit already blocked in a band stays blocked whatever
    Jev says (its probability is only attached as a hint).
    """
    started = time.perf_counter()
    if tolerance < 0 or not math.isfinite(tolerance):
        raise ValueError('Coverage tolerance must be a nonnegative finite number')
    exclusions = validate_exclusions(exclusions)
    exclusion_counts = [0] * len(exclusions)
    exclusions_by_page = defaultdict(list)
    for index, entry in enumerate(exclusions):
        pages = [entry['page']] if 'bbox' in entry else [
            page for first, last in entry['pages'] for page in range(first, last + 1)]
        for page in pages:
            exclusions_by_page[page].append((index, entry))
    normalized = []
    for word in words:
        page, box, text = _coverage_word(word)
        digits = _word_digits(text)
        if digits:
            normalized.append({'page': page, 'bbox': list(box), 'text': text,
                               'digits': digits, 'key': _word_key(text), 'covered': None})
    positioned = [a for a in tables.amounts
                  if a['physical_page'] is not None and None not in (a['x0'], a['y0'], a['x1'], a['y1'])]
    positioned_by_page = defaultdict(list)
    for a in positioned:
        positioned_by_page[a['physical_page']].append(a)
    # Amount-column bands from heading positions when the converter supplies
    # them, else from adopted rows. Per-header spans never merge across
    # headers; adopted rows cluster by overlap. Unlabeled fallback stays
    # visible so converters without fixed columns are listed, not hidden.
    bands, bands_from = [], 'rows'
    if amount_columns:
        bands_from = 'columns'
        grouped = defaultdict(list)
        for entry in amount_columns:
            grouped[entry.get('header')].append(tuple(entry['x_range']))
        for spans in grouped.values():
            merged = []
            for left, right in sorted(spans):
                if merged and left <= merged[-1][1] + 10:
                    merged[-1][1] = max(merged[-1][1], right)
                else:
                    merged.append([left, right])
            bands.extend(merged)
    else:
        for left, right in sorted((a['x0'], a['x1']) for a in positioned):
            if bands and left <= bands[-1][1] + 10:
                bands[-1][1] = max(bands[-1][1], right)
            else:
                bands.append([left, right])

    def in_band(word):
        center = (word['bbox'][0] + word['bbox'][2]) / 2
        return any(left - tolerance <= center <= right + tolerance for left, right in bands)

    words_by_page = defaultdict(list)
    for w in normalized:
        words_by_page[w['page']].append(w)
    for amount in positioned:
        box = (amount['x0'], amount['y0'], amount['x1'], amount['y1'])
        inside = sorted(
            (w for w in words_by_page.get(amount['physical_page'], [])
             if w['covered'] is None and _contains(box, w['bbox'], tolerance)),
            key=lambda w: (w['bbox'][1], w['bbox'][0]))
        # Words inside an amount's own box are part of that print. The tree
        # check owns value correctness; coverage owns the print's presence.
        for w in inside:
            w['covered'] = 'amount'
    # Poppler glyph boxes can overhang a converter's cell boundary. Cover
    # those fragments only when the complete overlapping print rejoins the
    # adopted amount's digits exactly. A nearby extra digit fails this match.
    for amount in positioned:
        box = (amount['x0'], amount['y0'], amount['x1'], amount['y1'])
        parts = sorted((w for w in words_by_page.get(amount['physical_page'], ())
                        if w['bbox'][0] < box[2] + tolerance and box[0] - tolerance < w['bbox'][2]
                        and min(box[3], w['bbox'][3]) - max(box[1], w['bbox'][1])
                        >= min(box[3] - box[1], w['bbox'][3] - w['bbox'][1]) / 2),
                       key=lambda w: (w['bbox'][0], w['bbox'][1]))
        if parts and ''.join(w['digits'] for w in parts) == _word_digits(amount['amount_text']):
            for word in parts:
                if word['covered'] is None:
                    word['covered'] = 'amount_fragments'
    # A word merged across two printed cells is covered when the amounts it
    # was split into sit inside its box and rejoin its digits exactly. Both
    # split amounts must exist as adopted rows; coincidence cannot cover.
    for word in normalized:
        if word['covered'] is not None:
            continue
        parts = sorted(
            (a for a in positioned_by_page.get(word['page'], [])
             if _contains(tuple(word['bbox']), (a['x0'], a['y0'], a['x1'], a['y1']), tolerance)),
            key=lambda a: (a['x0'], a['y0']))
        if len(parts) >= 2 and ''.join(_word_digits(a['amount_text']) for a in parts) == word['digits']:
            word['covered'] = 'split_amount'
    boxed_by_page = defaultdict(list)
    for n in tables.nodes:
        if n['physical_page'] is not None and None not in (n['x0'], n['y0'], n['x1'], n['y1']):
            boxed_by_page[n['physical_page']].append(n)
    for word in normalized:
        if word['covered'] is not None:
            continue
        for node in boxed_by_page.get(word['page'], []):
            if not _contains((node['x0'], node['y0'], node['x1'], node['y1']), word['bbox'], tolerance):
                continue
            code = _word_key(str(node.get('code_text') or ''))
            printed = code + _word_key(str(node.get('name_text') or ''))
            if word['key'] and not _amount_shaped(word['key']) and (
                    word['key'] in printed or word['key'] in _level_marks(code, node.get('level_header'))):
                word['covered'] = 'label'
                break
    # Adopted prints take precedence over an auxiliary block. An exclusion
    # may span the same baseline, but must never hide adopted amounts/labels.
    for word in normalized:
        if word['covered'] is None:
            candidates = exclusions_by_page.get(word['page'], ())
            hit = _exclusion_hit(word, [entry for _, entry in candidates], tolerance)
            if hit is not None:
                word['covered'] = 'excluded'
                exclusion_counts[candidates[hit][0]] += 1
    for word in normalized:
        if word['covered'] is None and NON_AMOUNT_WORD.fullmatch(_word_key(word['text'])):
            word['covered'] = 'non_amount'
    for word in normalized:
        if word['covered'] is None and PERCENT_WORD.fullmatch(_word_key(word['text'])):
            word['covered'] = 'non_amount'
    for word in normalized:
        if word['covered'] is None and CODE_WORD.fullmatch(_word_key(word['text'])):
            word['covered'] = 'non_amount'
    for word in normalized:
        if word['covered'] is None and re.fullmatch(r'[0-9０-９]+', _word_key(word['text'])) \
                and isinstance(word['page'], int) and word['bbox'][3] > FOOTER_TOP:
            word['covered'] = 'non_amount'
    # Printed document numbers and dates can be split by Poppler. Match an
    # exact, spatially adjacent sequence; never exempt all digits on its row.
    # A resolution/decision number (令和7年第7号・第54号) cannot read as an
    # amount, so it is explained outright instead of being left for recheck.
    document_boxes = set()
    non_amount_boxes, lines, merged_lines = _notation_context(
        words, lambda text: _document_notation(text) or QUANTITY_PHRASE.fullmatch(text) or ORDINAL_PHRASE.fullmatch(text),
        strong=lambda text: bool(DOCUMENT_NUMBER.fullmatch(text)), strong_boxes=document_boxes)
    for word in normalized:
        # A fragment (7号) may already read as a glued code; the number still explains it.
        if word['covered'] in (None, 'non_amount') and (word['page'], tuple(word['bbox'])) in document_boxes:
            word['covered'], word['form'] = 'non_amount', 'document_number'
    for word in normalized:
        if word['covered'] is None and (word['page'], tuple(word['bbox'])) in non_amount_boxes:
            word['covered'] = 'non_amount'
    for word in normalized:
        if word['covered'] is not None or not re.fullmatch(r'[0-9][0-9,]*', word['key']):
            continue
        adjacent = [part for offset in range(-2, 3)
                    for part in lines.get((word['page'], round(word['bbox'][1]) + offset), ())]
        for b, text in adjacent:
            if abs(b[1] - word['bbox'][1]) <= 2 and 0 <= b[0] - word['bbox'][2] <= 5:
                if re.match(r'(?:人|名|件|食|回|日|個|台|戸|世帯|本|床|箇所|校|番|丁目|歳|か月|号|基|㎡|km|路線)', _word_key(text)):
                    word['covered'] = 'non_amount'
                    break
    # A bare number immediately followed by a percent word on its baseline is
    # an execution rate, never an adopted amount. Percent signs carry no
    # digits, so marks come from every scope word, not only digit words.
    percent_marks = defaultdict(list)
    percent_units = defaultdict(list)
    for word in words:
        try:
            page, box, text = _coverage_word(word)
        except (KeyError, TypeError, ValueError):
            continue
        if isinstance(page, int) and re.fullmatch(r'[％%]', _word_key(text)):
            percent_marks[(page, round(box[1]))].append(box[0])
            percent_units[page].append(box)
    for word in normalized:
        if word['covered'] is not None:
            continue
        if not re.fullmatch(r'[0-9][0-9,\.]*', word['key']) or not isinstance(word['page'], int):
            continue
        for mark_x in percent_marks.get((word['page'], round(word['bbox'][1])), []):
            if 0 <= mark_x - word['bbox'][2] <= 5:
                word['covered'] = 'non_amount'
                break
    # A standalone percent unit just above the numeric cell is also an
    # execution rate. The unit and value share the printed right alignment.
    for word in normalized:
        if word['covered'] is not None or not re.fullmatch(r'[0-9]+(?:\.[0-9]+)?', word['key']):
            continue
        for box in percent_units.get(word['page'], ()):
            if (0 < word['bbox'][1] - box[1] <= 20
                    and box[0] - 5 <= word['bbox'][2] <= box[2] + tolerance):
                word['covered'] = 'non_amount'
                break
    # Control-total baselines: group every scope word by printed page and
    # baseline, and cover digits sharing a baseline with a total-dictionary
    # label. Labels may split across words, so match against the joined
    # baseline text. The label itself carries no digits, so grouping must see
    # all words, not only digit words.
    by_baseline = defaultdict(list)
    for word in words:
        try:
            page, box, text = _coverage_word(word)
        except (KeyError, TypeError, ValueError):
            continue
        if isinstance(page, int):
            by_baseline[(page, round(box[1]))].append((box, _word_key(text)))
    total_baselines = {key for key, line in merged_lines.items()
                       if any(label in ''.join(text for _, text in sorted(line)) for label in TOTAL_LABELS)}
    for word in normalized:
        if word['covered'] is None and isinstance(word['page'], int) \
                and any(p == word['page'] and abs(y - word['bbox'][1]) <= 2 for p, y in total_baselines):
            word['covered'] = 'total'
    total_boxes = _verified_total_boxes(
        words, control_tables or (tables,), amount_columns, tolerance,
        {(word['page'], round(word['bbox'][1])) for word in normalized if word['covered'] is None or word['covered'] == 'total'})
    for word in normalized:
        if word['covered'] is None and (word['page'], tuple(word['bbox'])) in total_boxes:
            word['covered'] = 'verified_total'
    repeated = _continued_subject_boxes(words, control_tables or (tables,), tolerance)
    for word in normalized:
        if word['covered'] is None and (word['page'], tuple(word['bbox'])) in repeated:
            word['covered'] = 'label'
    for word in normalized:
        if word['covered'] is None:
            word['covered'] = 'blocked' if in_band(word) else 'reported'
    jev = _apply_recheck(normalized, words, amount_columns, recheck) if recheck is not None else None

    def listed(w):
        item = {'page': w['page'], 'bbox': w['bbox'], 'text': w['text']}
        if w.get('jev') is not None:
            item['jev'] = w['jev']
        if w.get('rule'):
            item['rule'] = w['rule']
        return item
    blocked = [listed(w) for w in normalized if w['covered'] in ('blocked', 'jev_blocked')]
    reported = [listed(w) for w in normalized if w['covered'] == 'reported']
    blocked.sort(key=lambda w: (w['page'] if isinstance(w['page'], int) else 0, w['bbox'][1], w['bbox'][0]))
    reported.sort(key=lambda w: (w['page'] if isinstance(w['page'], int) else 0, w['bbox'][1], w['bbox'][0]))
    counts = dict(Counter(w['covered'] for w in normalized))
    applied = [{'kind': e['kind'], 'reason': e['reason'], 'words': n}
               for e, n in zip(exclusions, exclusion_counts)]
    return {'passed': not blocked, 'counts': counts,
            'digit_words': len(normalized), 'uncovered': blocked, 'reported': reported,
            'bands_from': bands_from, 'exclusions': applied, 'jev': jev,
            'elapsed': time.perf_counter() - started}


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


def check_tree(nodes: list[dict], amounts: list[dict], document_kind: str = 'settlement') -> dict:
    """Check every direct-child group separately by axis, printed header and unit.

    Same-axis groups compare normalized phases; independent breakdowns compare
    phases resolved in that breakdown and shared exact headers. Unprinted nodes take
    same-axis child sums, and unprinted leaves take zero. Validate links/cycles.

    A group whose children (and their same-axis descendants) print no amount at all has
    nothing to compare and is skipped: a lone 細節 that leaves its amount out because it equals
    the 節's (羽村). Zero is not what the document says there. A group where at least one
    child or descendant prints still compares in full, the unprinted ones counting zero.
    """
    by_key = {n['node_key']: n for n in nodes}
    issues, results = [], []
    if len(by_key) != len(nodes):
        issues.append('ノードキーが重複する')
    groups = defaultdict(list)
    values = defaultdict(dict)
    for node in nodes:
        parent = node['parent_node_key']
        if parent is not None:
            if parent not in by_key:
                issues.append(f'親がない: {node["node_key"]}'); continue
            groups[(parent, node['axis_header'])].append(node['node_key'])
            chain, cursor = set(), node['node_key']
            while cursor is not None and cursor in by_key:
                if cursor in chain:
                    issues.append(f'親の循環: {cursor}'); break
                chain.add(cursor); cursor = by_key[cursor]['parent_node_key']
    for amount in amounts:
        key = amount['node_key']
        if key not in by_key:
            issues.append(f'金額のノードがない: {key}'); continue
        if not amount['header_path'] or not amount['unit_text'] or number(amount['amount_text']) is None:
            issues.append(f'金額の見出し・単位・原文を解決できない: {key}'); continue
        ident = (amount['header_path'], amount['unit_text'])
        value = number(amount['amount_text'])
        if ident in values[key] and values[key][ident] != value:
            issues.append(f'同じノード・見出しの金額が一致しない: {key}')
        values[key][ident] = value

    @cache
    def comparable(key):
        result = {}
        node = by_key[key]
        for (header, unit), value in values[key].items():
            phase = amount_phase(header, document_kind, node['axis_header'], node['level_header'])
            if phase is not None:
                result[phase, unit] = result.get((phase, unit), 0) + value
        return result

    evaluating = set()

    @cache
    def value(key, axis, label, unit, exact=False):
        printed = values[key] if exact else comparable(key)
        if (label, unit) in printed:
            return printed[label, unit]
        identity = (key, axis, label, unit, exact)
        if identity in evaluating:
            return 0  # Structural cycle validation already makes the tree fail.
        evaluating.add(identity)
        total = sum(value(child, axis, label, unit, exact) for child in groups[key, axis])
        evaluating.remove(identity)
        return total

    @cache
    def descendants(key, axis):
        result = {key}
        if not cyclic:
            for child in groups[key, axis]:
                result.update(descendants(child, axis))
        return frozenset(result)

    cyclic = any('親の循環' in issue for issue in issues)
    for (parent, axis), children in list(groups.items()):
        if axis == '注記':
            continue
        same_axis = axis == by_key[parent]['axis_header']
        parent_values = comparable(parent)
        child_keys = set().union(*(descendants(child, axis) for child in children))
        if not any(values[child] for child in child_keys):
            continue
        child_phases = {label for child in child_keys for label, _ in comparable(child)}
        child_headers = {header for child in child_keys for header, _ in values[child]}
        comparisons = [(label, unit, False) for label, unit in parent_values
                       if same_axis or label in child_phases]
        comparisons += [(header, unit, True) for header, unit in values[parent]
                        if header in child_headers and
                        amount_phase(header, document_kind, by_key[parent]['axis_header'],
                                     by_key[parent]['level_header']) is None]
        for label, unit, exact in sorted(comparisons):
            expected = (values[parent] if exact else parent_values)[label, unit]
            total = sum(value(child, axis, label, unit, exact) for child in children)
            results.append({'parent_node_key': parent, 'axis_header': axis, 'header_path': label,
                            'unit_text': unit, 'children': len(children), 'parent_amount': expected,
                            'child_sum': total, 'difference': total - expected,
                            'status': '一致' if expected == total else '不一致'})

    counts = dict(Counter(r['status'] for r in results))
    return {'passed': not issues and not counts.get('不一致'), 'counts': counts,
            'issues': sorted(set(issues)), 'results': results}


def write_tables(directory: Path, table_id: str, tables: NodeTables, document_kind: str = 'settlement') -> dict[str, Path]:
    """Write a verified candidate pair; failed tables never become saved candidates."""
    if not tables.nodes or not tables.amounts:
        raise ValueError('Empty node/amount output is not supported')
    check = check_tree(tables.nodes, tables.amounts, document_kind)
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
