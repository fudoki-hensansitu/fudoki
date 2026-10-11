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
    r'|(?:令和|平成|昭和|大正|明治|[RHS])?[0-9０-９]+(?:年度|年|月|日))')


# Printed control totals. Every settlement prints its aggregate total row; the
# adopted tables keep it as an observation, not as amount rows, and every
# converter asserts its shape. Digits sharing the total row's baseline are
# classified as control totals, counted visibly, never silently passed.
TOTAL_LABELS = frozenset({'歳出合計', '歳出総計'})


COVERAGE_SIDECAR_SUFFIX = '.coverage.json'


def coverage_sidecar(wide_path):
    """Scope sidecar next to a converter's wide table."""
    path = Path(wide_path)
    return path.with_name(path.stem + COVERAGE_SIDECAR_SUFFIX)


def write_coverage_words(wide_path, words):
    """Write the processed word scope beside a wide table for the pre-save check.

    words are (physical page, display-page box, printed text) tuples in the
    converter's native order. The digit coverage check reads this scope back
    in run.py next to the tree check; converters declare scope by what they
    write. Scope is normally every character-layer word read in the processed
    pages and regions. A table adopting a declared subset (a 款項表 without
    its narrative body) writes exactly the lines that formed adopted rows and
    says so in its notes; narrowed-out digits stay visible as scope counts.
    """
    normalized = []
    for word in words:
        page, box, text = _coverage_word(word)
        if not isinstance(text, str):
            raise ValueError('Coverage words require printed text')
        normalized.append({'page': page, 'bbox': list(box), 'text': text})
    sidecar = coverage_sidecar(wide_path)
    sidecar.write_text(json.dumps({'words': normalized}, ensure_ascii=False) + '\n')
    return {'sidecar': str(sidecar), 'words': len(normalized)}


def check_table_coverage(wide_path, tables, *, require=True):
    """Pre-save digit coverage next to the tree check.

    Reads the converter's scope sidecar beside its wide table and requires
    every printed digit in scope to be an amount row or a known non-amount.
    Uncovered prints fail loudly with counts and page/box/text examples.
    require=False (scan PDFs, out of this change's scope) reports without
    tables instead of failing on a missing scope.
    """
    sidecar = coverage_sidecar(wide_path)
    if not sidecar.is_file():
        if require:
            raise ValueError(f'Digit coverage scope missing beside {wide_path}')
        return {'passed': True, 'counts': {}, 'digit_words': 0, 'uncovered': [],
                'status': '対象外', 'reason': '文字層の処理対象外'}
    words = json.loads(sidecar.read_text())['words']
    result = check_digit_coverage(words, tables)
    sidecar.with_name(sidecar.name.removesuffix(COVERAGE_SIDECAR_SUFFIX)
                      + '.coverage-uncovered.json').write_text(
        json.dumps({'counts': result['counts'], 'digit_words': result['digit_words'],
                    'uncovered': result['uncovered'], 'reported': result['reported']},
                   ensure_ascii=False) + '\n')
    if result['uncovered']:
        examples = ', '.join(
            f"p{u['page']}@{u['bbox'][0]:.1f},{u['bbox'][1]:.1f}={u['text']!r}"
            for u in result['uncovered'][:10])
        raise ValueError(f"Uncovered printed digits: {result['counts']}, "
                         f"{len(result['uncovered'])} blocked of {result['digit_words']} "
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


# Bare folios live in the footer strip. All processed PDFs are ~842pt tall
# with body bottoms at or below 800 (converters read body bands only, and no
# adopted amount prints with top > 795); a bare integer below the strip is an
# amount or a code, never a folio. Revisit if a taller page scope arrives.
FOOTER_TOP = 795.0


def check_digit_coverage(words, tables, *, tolerance=0.5):
    """Every printed digit in scope is an amount row or a known non-amount.

    words are the printed words of the pages and regions the converter
    processed. tables are migrated node tables whose amount rows carry their
    own printed positions. Amount-column bands are built commonly from the
    adopted amount rows' horizontal spans (no per-table declarations).
    A digit word is covered when (a) it sits inside an amount's own box as
    part of that print, (b) it sits inside its node's box and reads as the
    node's code or name, (c) it fullmatches a jurisdiction-common non-amount
    pattern (folio, era/year/date, glued percent, code glued to characters,
    footer folio, percent pair), (d) it shares a control-total baseline, or
    (e) a merged word split into adopted amounts rejoins exactly.
    Leftovers split by band: inside an amount band they are BLOCKED prints
    (a dropped amount in amount territory stops the save); outside bands
    they are REPORTED prose (counted with examples, never blocking).
    Never guesses: words sticking out of amount boxes stay uncovered.
    """
    if tolerance < 0 or not math.isfinite(tolerance):
        raise ValueError('Coverage tolerance must be a nonnegative finite number')
    normalized = []
    for word in words:
        page, box, text = _coverage_word(word)
        digits = _word_digits(text)
        if digits:
            normalized.append({'page': page, 'bbox': list(box), 'text': text,
                               'digits': digits, 'key': _word_key(text), 'covered': None})
    positioned = [a for a in tables.amounts
                  if a['physical_page'] is not None and None not in (a['x0'], a['y0'], a['x1'], a['y1'])]
    # Amount-column bands from adopted rows' horizontal spans, clustered by
    # overlap. A digit printing in amount territory without its own amount
    # row is a dropped amount and blocks; prose outside bands only reports.
    bands = []
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
    # A word merged across two printed cells is covered when the amounts it
    # was split into sit inside its box and rejoin its digits exactly. Both
    # split amounts must exist as adopted rows; coincidence cannot cover.
    for word in normalized:
        if word['covered'] is not None:
            continue
        parts = sorted(
            (a for a in positioned if a['physical_page'] == word['page']
             and _contains(tuple(word['bbox']), (a['x0'], a['y0'], a['x1'], a['y1']), tolerance)),
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
            printed = _word_key(str(node.get('code_text') or '') + str(node.get('name_text') or ''))
            if word['key'] and word['key'] in printed:
                word['covered'] = 'label'
                break
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
    # A bare number immediately followed by a percent word on its baseline is
    # an execution rate, never an adopted amount. Percent signs carry no
    # digits, so marks come from every scope word, not only digit words.
    percent_marks = defaultdict(list)
    for word in words:
        try:
            page, box, text = _coverage_word(word)
        except (KeyError, TypeError, ValueError):
            continue
        if isinstance(page, int) and re.fullmatch(r'[％%]', _word_key(text)):
            percent_marks[(page, round(box[1]))].append(box[0])
    for word in normalized:
        if word['covered'] is not None:
            continue
        if not re.fullmatch(r'[0-9][0-9,\.]*', word['key']) or not isinstance(word['page'], int):
            continue
        for mark_x in percent_marks.get((word['page'], round(word['bbox'][1])), []):
            if 0 <= mark_x - word['bbox'][2] <= 5:
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
            by_baseline[(page, round(box[1]))].append(_word_key(text))
    total_baselines = {key for key, texts in by_baseline.items()
                       if any(label in ''.join(texts) for label in TOTAL_LABELS)}
    for word in normalized:
        if word['covered'] is None and isinstance(word['page'], int) \
                and (word['page'], round(word['bbox'][1])) in total_baselines:
            word['covered'] = 'total'
    for word in normalized:
        if word['covered'] is None:
            word['covered'] = 'blocked' if in_band(word) else 'reported'
    blocked = [{'page': w['page'], 'bbox': w['bbox'], 'text': w['text']} for w in normalized
               if w['covered'] == 'blocked']
    reported = [{'page': w['page'], 'bbox': w['bbox'], 'text': w['text']} for w in normalized
                if w['covered'] == 'reported']
    blocked.sort(key=lambda w: (w['page'] if isinstance(w['page'], int) else 0, w['bbox'][1], w['bbox'][0]))
    reported.sort(key=lambda w: (w['page'] if isinstance(w['page'], int) else 0, w['bbox'][1], w['bbox'][0]))
    counts = dict(Counter(w['covered'] for w in normalized))
    return {'passed': not blocked, 'counts': counts,
            'digit_words': len(normalized), 'uncovered': blocked, 'reported': reported}


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
        same_axis = axis == by_key[parent]['axis_header']
        parent_values = comparable(parent)
        child_keys = set().union(*(descendants(child, axis) for child in children))
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
