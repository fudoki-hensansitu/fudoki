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
from collections import Counter, defaultdict
import json
import re
from pathlib import Path

from ingestion.generic.headers import dictionary_header
from ingestion.generic.layout import normalize
from ingestion.lib.node_tables import amount_phase, read_rows
from shared.amount import number


def code_and_name(node: dict) -> tuple[str, str]:
    """Code and name, normalized; a converter that kept the code inside the name (１事業費) is split."""
    code, name = normalize(node['code_text'] or ''), normalize(node['name_text'] or '')
    if not code:
        found = re.match(r'^([0-9]{1,4})(?=[^0-9,])', name)
        if found:
            code, name = found.group(1), name[found.end():]
    return code, name


def paths(nodes: list[dict], signatures: dict[str, object] | None = None) -> dict[str, tuple]:
    """Root-to-node identities. With `signatures`, a node that has one is named by it
    instead of its printed name (misread names are tolerated; code, amount and parents must agree)."""
    by_key = {n['node_key']: n for n in nodes}
    result: dict[str, tuple] = {}

    def path(key: str) -> tuple:
        if key in result:
            return result[key]
        node = by_key[key]
        code, name = code_and_name(node)
        if signatures is not None and signatures.get(key) is not None:
            name = signatures[key]
        # Converters name the subject axis 科目, 款項 or 款項目; its levels are what matter.
        axis = '科目' if node['level_header'] in ('款', '項', '目') else node['axis_header']
        own = (axis, code, name)
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


def signatures(nodes: list[dict], amounts: list[dict], document_kind: str) -> dict[str, object]:
    """A node's executed amount (or its first readable amount): what tolerant matching names it by."""
    by_key = {n['node_key']: n for n in nodes}
    found: dict[str, object] = {}
    for amount in amounts:
        node = by_key.get(amount['node_key'])
        if node is None or number(amount['amount_text']) is None:
            continue
        kind = amount_class(amount, node, document_kind)
        if kind == 'executed' or amount['node_key'] not in found:
            found[amount['node_key']] = ('¥', number(amount['amount_text']), kind == 'executed')
    return {key: value[:2] for key, value in found.items()}


def identities(nodes: list[dict], amounts: list[dict], document_kind: str, lenient: bool = False):
    node_paths = paths(nodes, signatures(nodes, amounts, document_kind) if lenient else None)
    by_key = {n['node_key']: n for n in nodes}
    node_ids = Counter(set(node_paths.values()))  # tables of one account share subject nodes
    amount_ids = Counter()
    for amount in amounts:
        node = by_key[amount['node_key']]
        amount_ids[(node_paths[amount['node_key']], amount_class(amount, node, document_kind),
                    number(amount['amount_text']))] += 1
    amount_ids = Counter({k: 1 for k in amount_ids})
    return node_ids, amount_ids


def tolerant(generated, expected, document_kind: str, kept) -> dict:
    """Matching that tolerates misread names.

    Nodes are grouped by their chain of (axis, code) from the root, so the
    printed numbers of the node and of every ancestor must agree. Within a
    group a generated node matches an expected one when the names agree or
    they share any printed amount.
    """
    def entries(nodes, amounts):
        by_key = {n['node_key']: n for n in nodes}
        values = defaultdict(set)
        for amount in amounts:
            value = number(amount['amount_text'])
            if value is not None:
                values[amount['node_key']].add(value)
        chains, full = {}, paths(nodes)

        def chain(key):
            if key not in chains:
                node = by_key[key]
                axis = '科目' if node['level_header'] in ('款', '項', '目') else node['axis_header']
                parent = node['parent_node_key']
                chains[key] = (chain(parent) if parent in by_key else ()) + ((axis, code_and_name(node)[0]),)
            return chains[key]
        groups = defaultdict(list)
        for key in by_key:
            groups[chain(key)].append((code_and_name(by_key[key])[1], values[key], full[key]))
        return groups

    got, want = entries(*generated), entries(*expected)
    subject = lambda chain: all(axis == '科目' for axis, _ in chain)
    result = {'subject_nodes': Counter(), 'detail_nodes_expected_axes': Counter()}
    expected_axes = {chain[-1][0] for chain in want if not subject(chain)}
    for chain in set(got) | set(want):
        bucket = 'subject_nodes' if subject(chain) else 'detail_nodes_expected_axes'
        if bucket != 'subject_nodes' and chain[-1][0] not in expected_axes:
            continue
        left, right = list(got.get(chain, [])), list(want.get(chain, []))
        matched = 0
        for rule in (lambda a, b: a[0] == b[0], lambda a, b: bool(a[1] & b[1])):
            for item in list(right):
                partner = next((g for g in left if rule(g, item)), None)
                if partner is not None:
                    left.remove(partner); right.remove(item); matched += 1
        result[bucket]['matched'] += matched
        result[bucket]['expected'] += len(want.get(chain, []))
        result[bucket]['generated'] += len(got.get(chain, []))
    # 目 amounts by value: header names differ between converters (款項／款 vs 金額).
    values = {}
    for side, groups in (('got', got), ('want', want)):
        values[side] = Counter((chain, value) for chain, members in groups.items()
                               if subject(chain) and len(chain) == 3 for _, found, _ in members for value in found)
    result['moku_amount_values'] = Counter({'matched': sum((values['got'] & values['want']).values()),
                                            'expected': sum(values['want'].values()),
                                            'generated': sum(values['got'].values())})
    return {k: {'expected': v['expected'], 'generated': v['generated'], 'matched': v['matched'],
                'recall': round(v['matched'] / max(v['expected'], 1), 4),
                'precision': round(v['matched'] / max(v['generated'], 1), 4)} for k, v in result.items()}


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
    # Breakdown axes the expected table does not carry (e.g. a setsu list the old
    # converter only kept as an observation) are counted apart, not as errors.
    expected_axes = {p[-1][0] for p in want_nodes if not subject(p)}
    kept = lambda path: subject(path) or path[-1][0] in expected_axes
    moku = lambda path: subject(path) and len(path) == 3
    report = {
        'moku_amounts': score(got_amounts, want_amounts, lambda k: moku(node_of(k)) and k[1] != 'annotation'),
        'detail_nodes_expected_axes': score(got_nodes, want_nodes, lambda p: not subject(p) and kept(p)),
        'detail_amounts_expected_axes': score(got_amounts, want_amounts,
                                              lambda k: not subject(node_of(k)) and kept(node_of(k)) and k[1] != 'annotation'),
        'extra_axes': {'nodes': sum(v for p, v in got_nodes.items() if not kept(p)),
                       'amounts': sum(v for k, v in got_amounts.items() if not kept(node_of(k))),
                       'axes': sorted({p[-1][0] for p in got_nodes if not kept(p)})},
        'subject_nodes': score(got_nodes, want_nodes, subject),
        'detail_nodes': score(got_nodes, want_nodes, lambda p: not subject(p)),
        'detail_nodes_by_axis': {axis: score(got_nodes, want_nodes, lambda p, a=axis: not subject(p) and p[-1][0] == a)
                                 for axis in sorted({p[-1][0] for p in want_nodes if not subject(p)})},
        'subject_amounts': score(got_amounts, want_amounts, lambda k: subject(node_of(k)) and k[1] != 'annotation'),
        'detail_amounts': score(got_amounts, want_amounts, lambda k: not subject(node_of(k)) and k[1] != 'annotation'),
        'annotation_amounts': score(got_amounts, want_amounts, lambda k: k[1] == 'annotation'),
    }
    report['tolerant'] = tolerant(generated, expected, document_kind, kept)
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
    print(json.dumps({k: v for k, v in report.items() if k != 'examples'}, ensure_ascii=False, indent=1, default=str))
    print(json.dumps(report['examples'], ensure_ascii=False, indent=1, default=str)[:6000])


if __name__ == '__main__':
    main()
