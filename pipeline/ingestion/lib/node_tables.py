"""Migrate declared PDF columns to printed nodes and amounts; reject ambiguous layouts."""
from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass
from functools import cache
import hashlib
import json
from pathlib import Path

from ingestion.fiscal.sum_check import parse_amount, read_rows
from ingestion.lib.parquet import ParquetColumn, write_parquet

NODE_COLUMNS = tuple(ParquetColumn(name, kind) for name, kind in (
    ('node_key', 'VARCHAR'), ('parent_node_key', 'VARCHAR'), ('axis_header', 'VARCHAR'),
    ('depth', 'BIGINT'), ('level_header', 'VARCHAR'), ('code_text', 'VARCHAR'),
    ('name_text', 'VARCHAR'), ('physical_page', 'BIGINT'),
    ('x0', 'DOUBLE'), ('y0', 'DOUBLE'), ('x1', 'DOUBLE'), ('y1', 'DOUBLE')))
AMOUNT_COLUMNS = tuple(ParquetColumn(name, kind) for name, kind in (
    ('node_key', 'VARCHAR'), ('header_path', 'VARCHAR'), ('amount_text', 'VARCHAR'),
    ('unit_text', 'VARCHAR'), ('physical_page', 'BIGINT'),
    ('x0', 'DOUBLE'), ('y0', 'DOUBLE'), ('x1', 'DOUBLE'), ('y1', 'DOUBLE')))
BREAKDOWN_HEADERS = frozenset(('繰越明許費', '事故繰越', '支出済額', '不用額', '本年度支出額', '翌年度繰越額'))
MIGRATION_NOTE = ('旧変換器は未読・所属未確認を数えていない。件数は移行時に検出できた原文の未読と親の未解決を数え、'
                  '0の根拠は金額が印字された親子について全段の子の和の一致である。原典の未抽出箇所が無いことの証明ではない。')


def number(text):
    if text is not None and str(text).strip() in ('－', '―', '—', '-', 'ー'):
        return 0
    return parse_amount(text)


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
            if prefix == '説明4_' and name in BREAKDOWN_HEADERS:
                parent = active.get('説明3_')
                if parent is None:
                    unresolved += 1; issues.append('金額内訳の親細目がない')
                    continue
                column = prefix + '金額'
                _add_amount(amounts, amount_seen, unread_seen, parent, '／'.join([p for p in path[:-1] if not p.isdigit()] + [name]),
                            row.get(column), units.get(column), _position(row, prefix), issues)
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
                            row.get(column), units[column], pos, issues)
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
                                row[column], units[column], _position(row, ''), issues)
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


def check_tree(nodes: list[dict], amounts: list[dict]) -> dict:
    """Check every direct-child group separately by axis, printed header and unit.

    A node without print takes its same-axis children's value, or zero at a leaf.
    Check every printed parent amount, including groups with missing child print.
    Also validate keys, links and cycles.
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
    def comparable(key, axis):
        result = {}
        for (header, unit), value in values[key].items():
            label = header
            if header == '節／金額':
                label = '予算現額／計'
            elif by_key[key]['axis_header'] == axis and (header == axis or header.startswith(axis + '／')):
                last = header.split('／')[-1]
                generic = header in (axis, axis + '／事業説明') or last == by_key[key]['level_header']
                label = ('支出済額' if generic or last in ('支出済額', '本年度支出額') else last)
            # Prior-year carryover execution and current-year execution are
            # separately printed parts of the generic executed total.
            result[label, unit] = result.get((label, unit), 0) + value
        return result

    evaluating = set()

    @cache
    def value(key, axis, header, unit):
        printed = comparable(key, axis)
        if (header, unit) in printed:
            return printed[header, unit]
        identity = (key, axis, header, unit)
        if identity in evaluating:
            return 0  # The structural cycle check already makes this tree fail.
        evaluating.add(identity)
        total = sum(value(child, axis, header, unit) for child in groups[key, axis])
        evaluating.remove(identity)
        return total

    for (parent, axis), children in list(groups.items()):
        parent_values = comparable(parent, axis)
        for header, unit in sorted(parent_values):
            expected = parent_values[header, unit]
            total = sum(value(child, axis, header, unit) for child in children)
            results.append({'parent_node_key': parent, 'axis_header': axis, 'header_path': header,
                            'unit_text': unit, 'children': len(children), 'parent_amount': expected,
                            'child_sum': total, 'difference': total - expected,
                            'status': '一致' if expected == total else '不一致'})
    counts = dict(Counter(r['status'] for r in results))
    return {'passed': not issues and not counts.get('不一致'), 'counts': counts,
            'issues': sorted(set(issues)), 'results': results}


def write_tables(directory: Path, table_id: str, tables: NodeTables) -> dict[str, Path]:
    """Write a verified candidate pair; failed tables never become saved candidates."""
    if not tables.nodes or not tables.amounts:
        raise ValueError('Empty node/amount output is not supported')
    check = check_tree(tables.nodes, tables.amounts)
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
