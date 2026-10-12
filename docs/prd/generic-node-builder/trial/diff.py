"""Per-table changes between two all-tables result dirs (all-tables/run.py).

usage: uv run --project pipeline python docs/prd/generic-node-builder/trial/diff.py <before dir> <after dir>
Compares the reference metrics (matched / expected / generated), the tree check, the unowned
amounts by kind, the notes by kind, the unit check and the 款 total in yen. With row files
(KEEP_ROWS=1) on both sides, also the rows gone and added.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from rows import changes, from_json  # noqa: E402

KEYS = ('subject_nodes', 'moku_amounts', 'detail_nodes_expected_axes', 'detail_amounts_expected_axes')
TOLERANT = ('subject_nodes', 'moku_amount_values', 'detail_nodes_expected_axes')
UNIT = ('kan_sum', 'printed_total', 'sum_matches', 'stopped')


def load(directory: str) -> dict:
    out = {}
    for path in Path(directory).glob('*.json'):
        if not path.name.endswith(('.observed.json', '.rows.json')):
            r = json.loads(path.read_text())
            out[f"{r['jurisdiction']}/{r['table_id']}"] = r
    return out


def counts(score: dict | None):
    return None if not score or not score.get('expected') else (score['matched'], score['expected'], score['generated'])


def table_changes(ra: dict, rb: dict) -> list[str]:
    ma, mb = ra.get('metrics', {}), rb.get('metrics', {})
    found = [f'{k}: {counts(ma.get(k))} -> {counts(mb.get(k))}' for k in KEYS if counts(ma.get(k)) != counts(mb.get(k))]
    ta, tb = ma.get('tolerant') or {}, mb.get('tolerant') or {}
    found += [f'tolerant {k}: {counts(ta.get(k))} -> {counts(tb.get(k))}' for k in TOLERANT if counts(ta.get(k)) != counts(tb.get(k))]
    tree_a, tree_b = ra.get('tree_check') or {}, rb.get('tree_check') or {}
    if (tree_a.get('passed'), tree_a.get('counts')) != (tree_b.get('passed'), tree_b.get('counts')):
        found.append(f"tree: {tree_a.get('passed')} {tree_a.get('counts')} -> {tree_b.get('passed')} {tree_b.get('counts')}")
    for field in ('unowned', 'notes'):
        a, b = ra.get(field) or {}, rb.get(field) or {}
        found += [f'{field} {kind}: {a.get(kind, 0)} -> {b.get(kind, 0)}' for kind in sorted(set(a) | set(b)) if a.get(kind, 0) != b.get(kind, 0)]
    ua, ub = ra.get('unit_check') or {}, rb.get('unit_check') or {}
    found += [f'unit {k}: {ua.get(k)} -> {ub.get(k)}' for k in UNIT if ua.get(k) != ub.get(k)]
    if ra.get('general_total_yen') != rb.get('general_total_yen'):
        found.append(f"general_total_yen: {ra.get('general_total_yen')} -> {rb.get('general_total_yen')}")
    if bool(ra.get('error')) != bool(rb.get('error')):
        found.append(f"error: {bool(ra.get('error'))} -> {bool(rb.get('error'))}")
    return found


def main() -> None:
    before, after = load(sys.argv[1]), load(sys.argv[2])
    for key in sorted(set(before) | set(after)):
        if key not in after or key not in before:
            print(key, 'only before' if key in before else 'only after')
            continue
        found = table_changes(before[key], after[key])
        name = key.replace('/', '-') + '.rows.json'
        rows_a, rows_b = Path(sys.argv[1]) / name, Path(sys.argv[2]) / name
        if rows_a.exists() and rows_b.exists():
            diff = changes(from_json(json.loads(rows_a.read_text())), from_json(json.loads(rows_b.read_text())))
            if diff['gone'] or diff['added']:
                found.append(f"rows: -{diff['gone']} +{diff['added']} gone {diff['gone_examples'][:3]} added {diff['added_examples'][:3]}")
        elif rows_a.exists() != rows_b.exists():
            found.append(f'rows file only {"before" if rows_a.exists() else "after"}')
        if found:
            print(key)
            for change in found:
                print('   ', change)


if __name__ == '__main__':
    main()
