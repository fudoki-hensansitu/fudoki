"""Compare generated node/amount tables with the measured converters' tables.

Usage: uv run python -m ingestion.generic.evaluate <generated prefix> <expected prefix> [<expected prefix> ...]

A node is identified by its path of (axis, code, name) from the root, so a
match means the number, the name and every ancestor agree. Names compare after
NFKC and whitespace removal. Amounts compare by (node path, phase, value); the
phase comes from the shared dictionary, and headers it does not know compare by
their printed path. Remarks annotations (注記) compare as one class.
"""
from __future__ import annotations

import argparse
from collections import Counter
import json
from pathlib import Path

from ingestion.generic.build import dictionary_header
from ingestion.generic.layout import normalize
from ingestion.lib.node_tables import amount_phase, read_rows
from shared.amount import number


def paths(nodes: list[dict]) -> dict[str, tuple]:
    by_key = {n['node_key']: n for n in nodes}
    result: dict[str, tuple] = {}

    def path(key: str) -> tuple:
        if key in result:
            return result[key]
        node = by_key[key]
        own = (node['axis_header'], normalize(node['code_text'] or ''), normalize(node['name_text'] or ''))
        parent = node['parent_node_key']
        result[key] = (path(parent) if parent in by_key else ()) + (own,)
        return result[key]

    for key in by_key:
        path(key)
    return result


def amount_class(amount: dict, node: dict, document_kind: str) -> str:
    header = amount['header_path'].replace('/', '／')
    if '注記' in header:
        return 'annotation'
    resolved = dictionary_header(header, document_kind)
    phase = amount_phase(resolved, document_kind, node['axis_header'], node['level_header'])
    return phase or resolved


def load(prefixes: list[str], exclude_headers: tuple[str, ...] = ()) -> tuple[list[dict], list[dict]]:
    nodes, amounts = [], []
    for index, prefix in enumerate(prefixes):
        # Tables of one account repeat the same 款・項・目 nodes; keys are local to a table.
        table_nodes = read_rows(Path(prefix + '-nodes.parquet'))
        table_amounts = read_rows(Path(prefix + '-amounts.parquet'))
        rename = {n['node_key']: f'{index}:{n["node_key"]}' for n in table_nodes}
        for node in table_nodes:
            nodes.append({**node, 'node_key': rename[node['node_key']],
                          'parent_node_key': rename.get(node['parent_node_key'])})
        for amount in table_amounts:
            if amount['header_path'].startswith(exclude_headers):
                continue
            amounts.append({**amount, 'node_key': rename[amount['node_key']]})
    return nodes, amounts


def identities(nodes: list[dict], amounts: list[dict], document_kind: str):
    node_paths = paths(nodes)
    by_key = {n['node_key']: n for n in nodes}
    node_ids = Counter(set(node_paths.values()))  # tables of one account share subject nodes
    amount_ids = Counter()
    for amount in amounts:
        node = by_key[amount['node_key']]
        amount_ids[(node_paths[amount['node_key']], amount_class(amount, node, document_kind),
                    number(amount['amount_text']))] += 1
    amount_ids = Counter({k: 1 for k in amount_ids})
    return node_ids, amount_ids


def compare(generated: tuple[list[dict], list[dict]], expected: tuple[list[dict], list[dict]],
            document_kind: str = 'settlement') -> dict:
    got_nodes, got_amounts = identities(*generated, document_kind)
    want_nodes, want_amounts = identities(*expected, document_kind)

    def score(got: Counter, want: Counter, select) -> dict:
        got = Counter({k: v for k, v in got.items() if select(k)})
        want = Counter({k: v for k, v in want.items() if select(k)})
        hit = sum((got & want).values())
        return {'expected': sum(want.values()), 'generated': sum(got.values()), 'matched': hit,
                'recall': round(hit / max(sum(want.values()), 1), 4),
                'precision': round(hit / max(sum(got.values()), 1), 4)}

    subject = lambda path: all(axis == '科目' for axis, _, _ in path)
    node_of = lambda key: key[0]
    report = {
        'subject_nodes': score(got_nodes, want_nodes, subject),
        'detail_nodes': score(got_nodes, want_nodes, lambda p: not subject(p)),
        'detail_nodes_by_axis': {axis: score(got_nodes, want_nodes, lambda p, a=axis: not subject(p) and p[-1][0] == a)
                                 for axis in sorted({p[-1][0] for p in want_nodes if not subject(p)})},
        'subject_amounts': score(got_amounts, want_amounts, lambda k: subject(node_of(k)) and k[1] != 'annotation'),
        'detail_amounts': score(got_amounts, want_amounts, lambda k: not subject(node_of(k)) and k[1] != 'annotation'),
        'annotation_amounts': score(got_amounts, want_amounts, lambda k: k[1] == 'annotation'),
    }
    missing = [k for k in (want_nodes - got_nodes)]
    extra = [k for k in (got_nodes - want_nodes)]
    report['examples'] = {
        'missing_nodes': [' > '.join(f'{a}:{c} {n}' for a, c, n in p[-3:]) for p in missing[:15]],
        'extra_nodes': [' > '.join(f'{a}:{c} {n}' for a, c, n in p[-3:]) for p in extra[:15]],
        'missing_amounts': [(' > '.join(f'{c} {n}' for _, c, n in k[0][-2:]), k[1], k[2])
                            for k in list(want_amounts - got_amounts)[:15]],
        'extra_amounts': [(' > '.join(f'{c} {n}' for _, c, n in k[0][-2:]), k[1], k[2])
                          for k in list(got_amounts - want_amounts)[:15]],
    }
    return report


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('generated')
    parser.add_argument('expected', nargs='+')
    parser.add_argument('--kind', default='settlement')
    parser.add_argument('--exclude-header', action='append', default=[])
    parser.add_argument('--out', type=Path)
    args = parser.parse_args()
    report = compare(load([args.generated]), load(args.expected, tuple(args.exclude_header)), args.kind)
    if args.out:
        args.out.write_text(json.dumps(report, ensure_ascii=False, indent=1, default=str))
    print(json.dumps({k: v for k, v in report.items() if k != 'examples'}, ensure_ascii=False, indent=1))
    print(json.dumps(report['examples'], ensure_ascii=False, indent=1, default=str)[:6000])


if __name__ == '__main__':
    main()
