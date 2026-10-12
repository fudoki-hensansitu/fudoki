"""Per-table metric changes between two result dirs. Usage: diff.py <before> <after>"""
import json, sys
from pathlib import Path
KEYS = ('subject_nodes', 'moku_amounts', 'detail_nodes_expected_axes', 'detail_amounts_expected_axes')
def load(d):
    out = {}
    for p in Path(d).glob('*.json'):
        if p.name.endswith('.observed.json'): continue
        r = json.loads(p.read_text()); out[f"{r['jurisdiction']}/{r['table_id']}"] = r
    return out
a, b = load(sys.argv[1]), load(sys.argv[2])
pct = lambda s: None if not s or not s.get('expected') else (s['matched'], s['expected'], s['generated'])
worse = better = 0
for k in sorted(a):
    ra, rb = a[k], b.get(k, {})
    ma, mb = ra.get('metrics', {}), rb.get('metrics', {})
    ta, tb = (ra.get('tree_check') or {}), (rb.get('tree_check') or {})
    changes = []
    for key in KEYS:
        x, y = pct(ma.get(key)), pct(mb.get(key))
        if x != y: changes.append(f'{key}: {x} -> {y}')
    tol_a, tol_b = (ma.get('tolerant') or {}), (mb.get('tolerant') or {})
    for key in ('subject_nodes', 'moku_amount_values', 'detail_nodes_expected_axes'):
        x, y = pct(tol_a.get(key)), pct(tol_b.get(key))
        if x != y: changes.append(f'tolerant {key}: {x} -> {y}')
    ca, cb = ta.get('counts', {}), tb.get('counts', {})
    if (ta.get('passed'), ca) != (tb.get('passed'), cb): changes.append(f"tree: {ta.get('passed')} {ca} -> {tb.get('passed')} {cb}")
    if ra.get('error') != rb.get('error'): changes.append(f"error: {bool(ra.get('error'))} -> {bool(rb.get('error'))}")
    if changes: print(k); [print('   ', c) for c in changes]
