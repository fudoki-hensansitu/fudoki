"""Tree check: every parent amount equals the sum of its children, per axis, header and unit.

A check module (ADR 0027): it only decides pass/fail and never builds or writes a table, so it is
left out of the converters' fingerprint and tightening it does not stale a saved table. Run
``ingestion:verify`` against the saved tables after making it stricter. The one exception is the generic
builder, which picks a subject pattern from the comparison results; ``manifest.RESULT_SHAPES_TABLE`` lists
that import so the builder's tables still go stale when this module changes.
"""
from __future__ import annotations

from collections import Counter, defaultdict
from functools import cache

from shared.amount import number
from ingestion.lib.node_tables import amount_phase


# A parent's 予算現額 (and the 不用額 that follows from it) carries the 継続費・繰越事業費 of the account, which the
# rows below it (節) do not distribute: the child sum falls short by exactly that printed amount (羽村).
UNDISTRIBUTED_PHASES = frozenset({'adjusted', '不用額'})


def check_tree(nodes: list[dict], amounts: list[dict], document_kind: str = 'settlement',
               declared: list[dict] | None = None) -> dict:
    """Check every direct-child group separately by axis, printed header and unit.

    Same-axis groups compare normalized phases; independent breakdowns compare
    phases resolved in that breakdown and shared exact headers. Unprinted nodes take
    same-axis child sums, and unprinted leaves take zero. Validate links/cycles.

    A group whose children (and their same-axis descendants) print no amount at all has
    nothing to compare and is skipped: a lone 細節 that leaves its amount out because it equals
    the 節's (羽村). Zero is not what the document says there. A group where at least one
    child or descendant prints still compares in full, the unprinted ones counting zero.

    A parent whose 予算現額 (or 不用額) is short of the child sum by exactly its own printed 継続費及び繰越事業費
    (繰越額) is `繰越事業費の未配当`, a match: the account's carry-over is not spread over its 節.

    `declared` are the document's declared source inconsistencies (`source_inconsistencies` of its layout
    file): a printed parent that differs from its children by an amount the document declares, with the same
    printed value, sum and difference, is `宣言済みのずれ`. The printed values are never rewritten. A value
    that differs by one yen, or a declaration that matches nothing, stops the table.
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
            status = '一致' if expected == total else '不一致'
            if status == '不一致' and label in UNDISTRIBUTED_PHASES:
                carried = sum(v for (header, u), v in values[parent].items()
                              if u == unit and '繰越事業費' in header)
                if carried and expected - total == carried:
                    status = '繰越事業費の未配当'
            results.append({'parent_node_key': parent, 'axis_header': axis, 'header_path': label,
                            'unit_text': unit, 'children': len(children), 'parent_amount': expected,
                            'child_sum': total, 'difference': total - expected, 'status': status})

    used = set()
    for index, entry in enumerate(declared or ()):
        for result in results:
            node = by_key[result['parent_node_key']]
            if (result['status'] == '不一致' and result['axis_header'] == entry['axis']
                    and node['physical_page'] == entry['page']
                    and node.get('code_text') == entry['parent'].get('code')
                    and node.get('name_text') == entry['parent']['name']
                    and result['parent_amount'] == entry['printed']
                    and result['child_sum'] == entry['children_sum']):
                result['status'] = '宣言済みのずれ'
                result['basis'] = entry['basis']
                used.add(index)
    for index, entry in enumerate(declared or ()):
        if index not in used:
            issues.append(f'宣言したずれが現れない: p{entry["page"]} {entry["parent"]["name"]} '
                          f'{entry["printed"]} / {entry["children_sum"]}')
    counts = dict(Counter(r['status'] for r in results))
    return {'passed': not issues and not counts.get('不一致'), 'counts': counts,
            'issues': sorted(set(issues)), 'results': results}
