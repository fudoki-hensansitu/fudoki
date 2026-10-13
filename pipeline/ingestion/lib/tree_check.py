"""The tree check of node and amount tables for converters that build the tree themselves.

`node_tables.check_tree` compares every parent with the sum of its direct children and counts an
unprinted leaf as zero. That stays the check of every migrated (wide) table. A builder that reads the
printed tree can meet a parent that prints an amount over children that print none: a lone 細節 that
leaves its amount out because it equals the 節's (羽村). Zero is then not what the document says, and the
group has nothing to compare. This check is `node_tables.check_tree` without those groups; a group where
at least one child (or a descendant on the same axis) prints still compares in full, the unprinted ones
counting zero, so a missing amount among printing siblings is still a mismatch.

It lives beside `node_tables.py` rather than in it: `node_tables.py` is part of every saved converter's
fingerprint, and a check that never shapes a table's bytes must not make the saved tables stale.
"""
from __future__ import annotations

from collections import defaultdict
from pathlib import Path

from ingestion.lib import node_tables
from ingestion.lib.parquet import write_parquet


def check_tree(nodes: list[dict], amounts: list[dict], document_kind: str = 'settlement') -> dict:
    result = node_tables.check_tree(nodes, amounts, document_kind)
    printing = {amount['node_key'] for amount in amounts}
    children = defaultdict(list)
    for node in nodes:
        if node['parent_node_key'] is not None:
            children[node['parent_node_key'], node['axis_header']].append(node['node_key'])

    def prints_below(key: str, axis: str) -> bool:
        pending, seen = list(children[key, axis]), set()
        while pending:
            cursor = pending.pop()
            if cursor in seen:  # a cycle is reported by the check itself
                continue
            seen.add(cursor)
            if cursor in printing:
                return True
            pending.extend(children[cursor, axis])
        return False

    results = [r for r in result['results']
               if r['status'] == '一致' or prints_below(r['parent_node_key'], r['axis_header'])]
    counts = {status: sum(1 for r in results if r['status'] == status) for status in ('一致', '不一致')}
    counts = {status: count for status, count in counts.items() if count}
    return {'passed': not result['issues'] and not counts.get('不一致'), 'counts': counts,
            'issues': result['issues'], 'results': results}


def write_tables(directory: Path, table_id: str, tables: node_tables.NodeTables,
                 document_kind: str = 'settlement') -> dict[str, Path]:
    """`node_tables.write_tables` with this check: a failing table never becomes a candidate."""
    if not tables.nodes or not tables.amounts:
        raise ValueError('Empty node/amount output is not supported')
    check = check_tree(tables.nodes, tables.amounts, document_kind)
    if tables.issues or tables.unread_amount_count or tables.unresolved_parent_count or not check['passed']:
        raise ValueError(f'Table failed node migration/tree check: {tables.issues}; '
                         f'unread={tables.unread_amount_count}; unresolved={tables.unresolved_parent_count}; '
                         f'{check["counts"]}; {check["issues"]}')
    paths = {kind: directory / f'{table_id}-{kind}.parquet' for kind in ('nodes', 'amounts')}
    write_parquet(paths['nodes'], tables.nodes, columns=node_tables.NODE_COLUMNS)
    try:
        write_parquet(paths['amounts'], tables.amounts, columns=node_tables.AMOUNT_COLUMNS)
    except BaseException:
        paths['nodes'].unlink(missing_ok=True)
        raise
    return paths
