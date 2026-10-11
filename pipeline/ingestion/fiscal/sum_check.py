"""Hierarchy sum checks of PDF ingestion tables against their printed parent amounts.

Checks are declared per saved table in a file mirroring the manifest
(``jurisdictions/<団体>/sum_checks/<年度>/<資料区分>/<方向>.json``). A check compares, per
printed parent node, the sum of its direct children with the parent amount printed in the
original. Nodes are identified by declared key columns (usually printed positions), so a parent
amount repeated on many rows is counted once per parent and distinct children are never merged
by value.
"""
from __future__ import annotations

import json
import re
import unicodedata
from collections import Counter
from functools import lru_cache
from pathlib import Path

import duckdb
import jsonschema

from ingestion.fiscal import manifest

SCHEMA = Path(__file__).with_name('sum_check.schema.json')

MATCH, MISMATCH, PENDING, UNCHECKABLE = '一致', '不一致', '保留', '検算不可'
STATUSES = (MATCH, MISMATCH, PENDING, UNCHECKABLE)
UNDECLARED, INVALID, NOT_APPLICABLE = '未宣言', '宣言不整合', '対象外'

_AMOUNT = re.compile(r'(?P<sign>[△▲\-])?(?P<digits>[0-9]{1,3}(?:,[0-9]{3})*|[0-9]+)')
_BRACKETS = [('(', ')'), ('<', '>'), ('[', ']')]


def parse_amount(value: object) -> int | None:
    """Printed amount as an integer, or None when the text is not a single amount.

    Whitespace, digit grouping, a 円 unit mark before or after the number and one enclosing
    bracket pair are layout; △/▲/- is a printed minus sign. Absent values are never read as 0.
    """
    if value is None:
        return None
    text = unicodedata.normalize('NFKC', str(value))
    text = re.sub(r'\s+', '', text).replace('−', '-').removeprefix('円').removesuffix('円')
    for opening, closing in _BRACKETS:
        if text.startswith(opening) and text.endswith(closing):
            text = text[1:-1]
            break
    match = _AMOUNT.fullmatch(text)
    if match is None:
        return None
    number = int(match['digits'].replace(',', ''))
    return -number if match['sign'] else number


def declaration_path(target: dict, direction: str, root: Path | None = None) -> Path:
    root = manifest.JURISDICTIONS if root is None else root
    return (root / target['jurisdiction'] / 'sum_checks' / str(target['fiscal_year'])
            / manifest.document_slot(target) / f'{direction}.json')


@lru_cache(maxsize=1)
def validator() -> jsonschema.Draft202012Validator:
    schema = json.loads(SCHEMA.read_text())
    jsonschema.Draft202012Validator.check_schema(schema)
    return jsonschema.Draft202012Validator(schema)


def read_declarations(document: dict, root: Path | None = None) -> dict[str, list[dict]] | None:
    """Declared checks per table ID of a manifest, or None when the manifest has no file."""
    path = declaration_path(document['target'], document['direction'], root)
    if not path.exists():
        return None
    declared = json.loads(path.read_text())
    validator().validate(declared)
    owned = {item['table_id'] for conversion in document['conversions'] for item in conversion['expected_tables']}
    unknown = set(declared['tables']).difference(owned)
    if unknown:
        raise ValueError(f'Sum checks name tables outside the manifest: {sorted(unknown)}')
    for checks in declared['tables'].values():
        for check in checks:
            if 'uncheckable' in check:
                continue
            for name in referenced_columns(check):
                if name is not None and name not in owned:
                    raise ValueError(f'{check["name"]}: references a table outside the manifest: {name}')
    return declared['tables']


def read_rows(path: Path) -> list[dict]:
    with duckdb.connect() as con:
        cursor = con.execute('select * from read_parquet(?, hive_partitioning=false)', [str(path)])
        names = [item[0] for item in cursor.description]
        return [dict(zip(names, row)) for row in cursor.fetchall()]


def child_specs(check: dict) -> list[dict]:
    """Child declarations of a check; several specs add up as one breakdown."""
    return check['child'] if isinstance(check['child'], list) else [check['child']]


def _child_columns(check: dict, spec: dict) -> list[str]:
    columns = spec.get('columns', [pair[1] for pair in check['columns']])
    if len(columns) != len(check['columns']):
        raise ValueError(f'{check["name"]}: child columns must align with the parent columns')
    return columns


def referenced_columns(check: dict) -> dict[str | None, set[str]]:
    """Columns a check reads, keyed by its declared table (None = the declaring table)."""
    result: dict[str | None, set[str]] = {}
    for spec, amounts in [(check['parent'], [pair[0] for pair in check['columns']]),
                          *[(spec, _child_columns(check, spec)) for spec in child_specs(check)]]:
        columns = result.setdefault(spec.get('table'), set())
        columns.update(spec['key'])
        columns.update(spec.get('parent_key', []))
        columns.update(spec.get('where', {}))
        for blank in spec.get('blank', []):
            columns.update(blank.get('where', {}))
        columns.update(amounts)
    return result


def _holds(value: object, condition: object) -> bool:
    if condition == 'null':
        return value is None
    if condition == 'not_null':
        return value is not None
    if isinstance(condition, list):
        return value in condition
    if isinstance(condition, dict) and 'not_in' in condition:
        return value not in condition['not_in']
    if isinstance(condition, dict):
        return value is not None and condition['contains'] in str(value)
    return value == condition


def _where(row: dict, where: dict) -> bool:
    return all(_holds(row[column], condition) for column, condition in where.items())


def _matches(row: dict, spec: dict) -> bool:
    return all(row[column] is not None for column in spec['key']) and _where(row, spec.get('where', {}))


def _nodes(rows: list[dict], spec: dict, columns: list[str], link: list[str]) -> dict[tuple, dict]:
    """Group qualifying rows by node key, keeping every distinct printed value and link.

    A row without a complete link has no parent of the declared kind, so it is not a child here.
    """
    nodes: dict[tuple, dict] = {}
    for row in rows:
        if not _matches(row, spec) or any(row[column] is None for column in link):
            continue
        key = tuple(row[column] for column in spec['key'])
        node = nodes.setdefault(key, {'values': {column: set() for column in columns}, 'links': set(), 'rows': []})
        node['rows'].append(row)
        node['links'].add(tuple(row[column] for column in link))
        for column in columns:
            value = row[column]
            node['values'][column].add(None if value is None else re.sub(r'\s+', '', str(value)))
    return nodes


def _declared_blank(rows: list[dict], declared: list[dict]) -> str | None:
    """Reason of the first declaration confirming a blank child amount as unprinted."""
    for blank in declared:
        if any(_where(row, blank.get('where', {})) for row in rows):
            return blank['reason']
    return None


def _single(values: set) -> tuple[str | None, bool]:
    """The one printed value of a repeated node cell, and whether repeats agreed."""
    if len(values) == 1:
        return next(iter(values)), True
    return None, False


def evaluate(check: dict, tables: dict[str | None, list[dict]]) -> list[dict]:
    """Results per parent node and amount column for one declared check."""
    parent = check['parent']
    parent_columns = [pair[0] for pair in check['columns']]
    parents = _nodes(tables[parent.get('table')], parent, parent_columns, [])
    children: dict[tuple, dict] = {}
    for index, spec in enumerate(child_specs(check)):
        link = spec.get('parent_key', parent['key'])
        if len(link) != len(parent['key']):
            raise ValueError(f'{check["name"]}: parent_key must align with the parent key')
        columns = _child_columns(check, spec)
        for key, node in _nodes(tables[spec.get('table')], spec, columns, link).items():
            node['spec'], node['columns'] = spec, columns
            children[(index, *key)] = node
    grouped: dict[tuple, list[tuple]] = {}
    ambiguous: set[tuple] = set()
    for key, node in children.items():
        if len(node['links']) == 1:
            grouped.setdefault(next(iter(node['links'])), []).append(key)
        else:
            ambiguous.update(node['links'])
    results = []
    for key, node in parents.items():
        members = grouped.get(key, [])
        if not members and check.get('skip_leaves') and key not in ambiguous:
            continue
        for position, parent_column in enumerate(parent_columns):
            result = {'check': check['name'], 'parent': list(key), 'parent_column': parent_column,
                      'child_column': sorted({children[member]['columns'][position] for member in members}),
                      'children': len(members)}
            printed, consistent = _single(node['values'][parent_column])
            result['parent_amount'] = printed if consistent else sorted(node['values'][parent_column], key=str)
            expected = parse_amount(printed)
            sums = []
            pending = []
            unprinted = []
            for member in members:
                child = children[member]
                value, agreed = _single(child['values'][child['columns'][position]])
                amount = parse_amount(value)
                if not agreed:
                    pending.append('子の反復値が一致しない')
                elif value is None:
                    blank = _declared_blank(child['rows'], child['spec'].get('blank', []))
                    if blank is None:
                        pending.append('子の金額が空欄・未読')
                    else:
                        unprinted.append(blank)
                elif amount is None:
                    pending.append('子の金額表記を解釈できない')
                else:
                    sums.append(amount)
            if not consistent:
                result.update(status=MISMATCH, reason='親の反復値が一致しない')
            elif key in ambiguous:
                result.update(status=PENDING, reason='子の所属が一意でない')
            elif not members:
                result.update(status=UNCHECKABLE, reason='内訳の行がない')
            elif printed is None:
                if sums or pending:
                    result.update(status=PENDING, reason='親の金額が空欄・未読（子に金額がある）')
                else:
                    result.update(status=UNCHECKABLE, reason='親・子とも金額が空欄')
            elif expected is None:
                result.update(status=PENDING, reason='親の金額表記を解釈できない')
            elif pending:
                result.update(status=PENDING, reason=Counter(pending).most_common(1)[0][0])
            elif unprinted:
                result.update(status=UNCHECKABLE, reason=Counter(unprinted).most_common(1)[0][0],
                              child_sum_printed=sum(sums))
            else:
                total = sum(sums)
                result.update(child_sum=total, difference=total - expected,
                              status=MATCH if total == expected else MISMATCH)
                # An excerpt prints only some children: a shortfall is expected, an excess is not.
                if 'excerpt' in check and total < expected:
                    result.update(status=UNCHECKABLE, reason=check['excerpt'])
            results.append(result)
    orphans = [key for key, node in children.items()
               if len(node['links']) == 1 and next(iter(node['links'])) not in parents]
    if orphans:
        results.append({'check': check['name'], 'parent': None, 'parent_column': None, 'child_column': None,
                        'children': len(orphans), 'status': PENDING, 'reason': '親が見つからない子がある',
                        'orphans': [list(item) for item in orphans[:20]]})
    return results


def verify_table(table_id: str, declared: list[dict] | None, tables: dict[str, list[dict]]) -> dict:
    """All declared checks of one table, with counts per status."""
    if not declared:
        return {'table_id': table_id, 'status': UNDECLARED, 'counts': {}, 'checks': [], 'results': []}
    results = []
    summaries = []
    for check in declared:
        if 'uncheckable' in check:
            summaries.append({'name': check['name'], 'status': UNCHECKABLE, 'reason': check['uncheckable']})
            results.append({'check': check['name'], 'status': UNCHECKABLE, 'reason': check['uncheckable']})
            continue
        view = {None: tables[table_id], **tables}
        found = evaluate(check, view)
        counts = Counter(item['status'] for item in found)
        summaries.append({'name': check['name'], 'counts': dict(counts),
                          'reasons': dict(Counter(f'{item["status"]}: {item["reason"]}'
                                                  for item in found if item.get('reason')))})
        results.extend(found)
    counts = Counter(item['status'] for item in results)
    status = MISMATCH if counts[MISMATCH] else (PENDING if counts[PENDING] else
                                                (MATCH if counts[MATCH] else UNCHECKABLE))
    return {'table_id': table_id, 'status': status, 'counts': {key: counts[key] for key in STATUSES if counts[key]},
            'checks': summaries, 'results': results}


def verify_tables(document: dict, declarations: dict[str, list[dict]] | None, load,
                  skipped: dict[str, str]) -> list[dict]:
    """Verify every table of a manifest; ``load(table_id)`` returns its rows.

    Checks may read other tables of the same manifest. ``skipped`` maps table IDs outside
    the PDF sum check (e.g. CSV, verified by cell retention) to the reason.
    """
    loaded: dict[str, list[dict]] = {}
    known = {table['table_id'] for table in document['tables']}

    def rows(table_id: str) -> list[dict]:
        if table_id not in known:
            raise ValueError(f'Sum check references a table outside this manifest: {table_id}')
        if table_id not in loaded:
            loaded[table_id] = load(table_id)
        return loaded[table_id]

    results = []
    for table in document['tables']:
        ident = table['table_id']
        if ident in skipped:
            results.append({'table_id': ident, 'status': NOT_APPLICABLE, 'reason': skipped[ident],
                            'counts': {}, 'checks': [], 'results': []})
            continue
        declared = (declarations or {}).get(ident) or []
        references: dict[str, set[str]] = {}
        for check in declared:
            if 'uncheckable' not in check:
                for name, columns in referenced_columns(check).items():
                    references.setdefault(name or ident, set()).update(columns)
        loaded_tables = {name: rows(name) for name in {ident, *references}}
        missing = sorted(f'{name}.{column}' for name, columns in references.items()
                         for column in columns.difference(loaded_tables[name][0] if loaded_tables[name] else ()))
        if missing:
            results.append({'table_id': ident, 'status': INVALID, 'reason': f'宣言が表にない列を参照する: {missing}',
                            'counts': {}, 'checks': [], 'results': []})
            continue
        results.append(verify_table(ident, declared, loaded_tables))
    return results
