"""Stage 5 alternative: decide the breakdown tree from sum closure.

A settlement prints every parent amount as the exact sum of its children. Items
of one breakdown axis under a subject leaf (目) are read in printed order, which
is the pre-order of their tree, so a tree is a bracketing of that sequence in
which every bracket's head equals the sum of its direct children and the roots
sum to the 目's amount. This module searches those bracketings by dynamic
programming and reports how many exist.

Modes:
  sum       – amounts only; when several bracketings close, prefer giving a
              node children over making it a leaf.
  code+sum  – the printed numbering narrows candidates first: siblings share
              the numbering shape (all numbered or all unnumbered) and numbered
              siblings increase; sums then choose among the survivors.
  indent+sum – geometry proposes (the rule tree's depths); among the closing
              bracketings choose the one closest to it.

Only the parents of breakdown-axis nodes change; subject nodes stay.
"""
from __future__ import annotations

from collections import defaultdict
from functools import lru_cache
import sys

from ingestion.generic.build import dictionary_header
from ingestion.lib.node_tables import amount_phase
from shared.amount import number

CAP = 2  # counting stops here: 1 = unique, 2 = ambiguous
BUDGET = 300_000  # memoised states per block before the search gives up


class Budget(Exception):
    pass


def _value(node: dict, amounts: list[dict], phase: str, document_kind: str) -> int | None:
    found = [number(a['amount_text']) for a in amounts
             if amount_phase(dictionary_header(a['header_path'], document_kind), document_kind,
                             node['axis_header'], node['level_header']) == phase]
    return found[0] if found else None


def _code(node: dict) -> int | None:
    text = node.get('code_text')
    return int(text) if text and text.isdigit() else None


def bracket(values: list[int | None], codes: list[int | None], target: int | None, mode: str,
            depths: list[int] | None = None) -> tuple[list[int] | None, int]:
    """Parents (index or -1) for a pre-order sequence, and the number of closing bracketings (capped)."""
    n = len(values)
    sys.setrecursionlimit(max(10000, 20 * n))
    value = [v if v is not None else 0 for v in values]
    shaped = mode == 'code+sum'

    def shape(index: int | None):
        """What a following sibling must agree with: the numbering of the previous one."""
        if not shaped or index is None:
            return None
        return ('numbered', codes[index]) if codes[index] is not None else ('plain', None)

    def fits(previous, current: int) -> bool:
        if previous is None:
            return True
        kind, code = previous
        if (kind == 'numbered') != (codes[current] is not None):
            return False
        return kind == 'plain' or codes[current] > code

    # A descendant never exceeds its ancestor (amounts are non-negative), so a
    # subtree ends before the first later item larger than its head.
    bound = [n] * n
    stack: list[int] = []
    for i in range(n - 1, -1, -1):
        while stack and value[stack[-1]] <= value[i]:
            stack.pop()
        bound[i] = stack[-1] if stack else n
        stack.append(i)
    work = [0]

    @lru_cache(maxsize=None)
    def subtree(i: int) -> tuple[tuple[int, int], ...]:
        """(end, ways) for the subtree rooted at i."""
        work[0] += 1
        if work[0] > BUDGET:
            raise Budget
        options: dict[int, int] = defaultdict(int)
        options[i + 1] += 1  # a leaf
        if i + 1 < n:  # a zero head may hold zero children (予備費 0 = 0)
            for end, ways in siblings(i + 1, value[i], None):
                if i + 1 < end <= bound[i]:
                    options[end] = min(CAP, options[end] + ways)
        return tuple(options.items())

    @lru_cache(maxsize=None)
    def siblings(k: int, remaining: int, previous) -> tuple[tuple[int, int], ...]:
        """(end, ways) for a run of siblings starting at k that sums to remaining."""
        work[0] += 1
        if work[0] > BUDGET:
            raise Budget
        options: dict[int, int] = defaultdict(int)
        if remaining == 0:
            options[k] += 1
        if k < n and value[k] <= remaining and fits(previous, k) and (remaining > 0 or value[k] == 0):
            for end, ways in subtree(k):
                for later, more in siblings(end, remaining - value[k], shape(k)):
                    options[later] = min(CAP, options[later] + ways * more)
        return tuple(options.items())

    if target is None:
        target = sum(value[i] for i in range(n))  # unknown head: accept the flattest closure
    try:
        total = dict(siblings(0, target, None)).get(n, 0)
    except Budget:
        return None, -1
    if not total:
        return None, 0

    # Reconstruct one bracketing by preference.
    parents = [-1] * n

    def geometric_end(k: int, limit: int) -> int:
        """Where k's subtree ends if the rule tree's depths are right."""
        j = k + 1
        while j < limit and depths[j] > depths[k]:
            j += 1
        return j

    def place(k: int, end_limit: int, remaining: int, previous, parent: int) -> bool:
        """Place siblings from k exactly up to end_limit summing to remaining."""
        if k == end_limit:
            return remaining == 0
        if value[k] > remaining or not fits(previous, k) or (remaining == 0 and value[k] != 0):
            return False
        choices = [end for end, _ in subtree(k) if dict(siblings(end, remaining - value[k], shape(k))).get(end_limit)]
        if mode == 'indent+sum' and depths is not None:
            proposed = geometric_end(k, end_limit)
            choices.sort(key=lambda end: abs(end - proposed))
        else:
            choices.sort(key=lambda end: -end)  # children before leaf
        for end in choices:
            parents[k] = parent
            if end > k + 1 and not place(k + 1, end, value[k], None, k):
                continue
            if place(end, end_limit, remaining - value[k], shape(k), parent):
                return True
        return False

    place(0, n, target, None, -1)
    return parents, total


def reparent(nodes: list[dict], amounts: list[dict], mode: str, document_kind: str = 'settlement',
             axes: tuple[str, ...] = ('備考',), fallback: str = 'geometry') -> tuple[list[dict], dict]:
    """Re-parent breakdown nodes; where no bracketing closes keep the geometry or lay the block flat."""
    by_key = {n['node_key']: n for n in nodes}
    amounts_of = defaultdict(list)
    for amount in amounts:
        amounts_of[amount['node_key']].append(amount)
    # The subject ancestor of every breakdown node.
    def subject_of(node):
        while node is not None and node['axis_header'] != '科目':
            node = by_key.get(node['parent_node_key'])
        return node
    blocks: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for node in nodes:
        if node['axis_header'] in axes:
            head = subject_of(node)
            if head is not None:
                blocks[head['node_key'], node['axis_header']].append(node)
    stats = {'blocks': 0, 'unique': 0, 'ambiguous': 0, 'unclosed': 0, 'budget': 0}
    changed = {}
    for (head_key, axis), members in blocks.items():
        members.sort(key=lambda n: (n['physical_page'], n['y0'] or 0, n['x0'] or 0))
        values = [_value(n, amounts_of[n['node_key']], 'executed', document_kind) for n in members]
        target = _value(by_key[head_key], amounts_of[head_key], 'executed', document_kind)
        depths = [n['depth'] for n in members]
        parents, count = bracket(values, [_code(n) for n in members], target, mode, depths)
        stats['blocks'] += 1
        if parents is None:
            stats['budget' if count < 0 else 'unclosed'] += 1
            if fallback == 'flat':
                for node in members:
                    changed[node['node_key']] = head_key
            continue  # otherwise keep the geometric tree where no bracketing closes
        stats['unique' if count == 1 else 'ambiguous'] += 1
        for index, parent in enumerate(parents):
            node = members[index]
            changed[node['node_key']] = head_key if parent == -1 else members[parent]['node_key']
    result = [{**n, 'parent_node_key': changed.get(n['node_key'], n['parent_node_key'])} for n in nodes]
    by_key = {n['node_key']: n for n in result}

    def depth(node):
        parent = by_key.get(node['parent_node_key'])
        return 1 if parent is None or parent['axis_header'] != node['axis_header'] else depth(parent) + 1
    result = [{**n, 'depth': depth(n)} for n in result]
    return result, stats


def main() -> None:
    """Re-parent a generated table with each mode and compare with the expected tables."""
    import argparse
    import json
    from ingestion.generic.evaluate import compare, load
    parser = argparse.ArgumentParser()
    parser.add_argument('generated')
    parser.add_argument('expected', nargs='+')
    parser.add_argument('--exclude-header', action='append', default=[])
    args = parser.parse_args()
    nodes, amounts = load([args.generated])
    expected = load(args.expected, tuple(args.exclude_header))
    rows = {'geometry': ({'blocks': None}, compare((nodes, amounts), expected))}
    for mode in ('sum', 'code+sum', 'indent+sum'):
        for fallback in ('flat', 'geometry'):
            changed, stats = reparent(nodes, amounts, mode, fallback=fallback)
            rows[f'{mode} (else {fallback})'] = (stats, compare((changed, amounts), expected))
    for mode, (stats, report) in rows.items():
        axis = report['detail_nodes_by_axis'].get('備考', {})
        print(json.dumps({'mode': mode, 'stats': stats, '備考': [axis.get('matched'), axis.get('expected'), axis.get('generated')],
                          'detail_amounts': [report['detail_amounts']['matched'], report['detail_amounts']['expected']]},
                         ensure_ascii=False))


if __name__ == '__main__':
    main()
