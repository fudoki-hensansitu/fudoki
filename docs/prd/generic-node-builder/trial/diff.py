"""Per-table metric changes between two all-tables result dirs.

usage: uv run --project pipeline python docs/prd/generic-node-builder/trial/diff.py <before dir> <after dir>
"""
import json
import sys
from pathlib import Path

KEYS = ('subject_nodes', 'moku_amounts', 'detail_nodes_expected_axes', 'detail_amounts_expected_axes')
TOLERANT = ('subject_nodes', 'moku_amount_values', 'detail_nodes_expected_axes')


def load(directory: str) -> dict:
    out = {}
    for path in Path(directory).glob('*.json'):
        if not path.name.endswith('.observed.json'):
            r = json.loads(path.read_text())
            out[f"{r['jurisdiction']}/{r['table_id']}"] = r
    return out


def counts(score: dict | None):
    return None if not score or not score.get('expected') else (score['matched'], score['expected'], score['generated'])


def main() -> None:
    before, after = load(sys.argv[1]), load(sys.argv[2])
    for key in sorted(before):
        ra, rb = before[key], after.get(key, {})
        ma, mb = ra.get('metrics', {}), rb.get('metrics', {})
        changes = [f'{k}: {counts(ma.get(k))} -> {counts(mb.get(k))}' for k in KEYS if counts(ma.get(k)) != counts(mb.get(k))]
        ta, tb = ma.get('tolerant') or {}, mb.get('tolerant') or {}
        changes += [f'tolerant {k}: {counts(ta.get(k))} -> {counts(tb.get(k))}' for k in TOLERANT
                    if counts(ta.get(k)) != counts(tb.get(k))]
        tree_a, tree_b = ra.get('tree_check') or {}, rb.get('tree_check') or {}
        if (tree_a.get('passed'), tree_a.get('counts')) != (tree_b.get('passed'), tree_b.get('counts')):
            changes.append(f"tree: {tree_a.get('passed')} {tree_a.get('counts')} -> {tree_b.get('passed')} {tree_b.get('counts')}")
        if bool(ra.get('error')) != bool(rb.get('error')):
            changes.append(f"error: {bool(ra.get('error'))} -> {bool(rb.get('error'))}")
        if changes:
            print(key)
            for change in changes:
                print('   ', change)


if __name__ == '__main__':
    main()
