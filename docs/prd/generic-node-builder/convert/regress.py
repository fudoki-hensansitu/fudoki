"""Compare two full-45-table runs (`all-tables/run.py`, KEEP_ROWS=1) table by table.

usage: python regress.py <base results dir> <new results dir> [causes.json]

For each table: the provisional class (the rule of `all-tables/summary.py`; the hand class of
`causes.json` when given), the metrics against the saved tables, the tree check, the unit check, and the
rows gone and added (`ingestion/generic/rows.py`, a row is a node or an amount with its printed place).
A class that went down, or a metric that went down in an (a)/(b) table, is marked `!!`.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[4] / 'pipeline'))
from ingestion.generic.rows import changes, from_json  # noqa: E402

KEYS = ('subject_nodes', 'moku_amounts', 'detail_nodes_expected_axes', 'detail_amounts_expected_axes')
ORDER = {'a': 3, 'b': 2, 'c': 1}


def load(directory: Path) -> dict:
    result = {}
    for path in sorted(directory.glob('*.json')):
        if path.name.endswith(('.observed.json', '.rows.json')):
            continue
        r = json.loads(path.read_text())
        rows = path.with_suffix('.rows.json')
        r['_rows'] = from_json(json.loads(rows.read_text())) if rows.exists() else None
        result[f"{r['jurisdiction']}/{r['table_id']}"] = r
    return result


def provisional(r: dict) -> str:
    """The class by the design document's rules, from the metrics against the saved tables.

    (a): subject nodes and 目 amounts 100% (recall and precision), the tree check passes, and the
    breakdown on the expected axes matches fully. (b): with misprints allowed (`tolerant`), subject nodes
    >= 90%, 目 amount values >= 80%, and the breakdown on the expected axes >= 50%. (c) otherwise."""
    m = r.get('metrics') or {}
    if r.get('error') or not m.get('subject_nodes') or not m['subject_nodes'].get('expected'):
        return 'c'
    exact = lambda k: None if not m.get(k) or not m[k].get('expected') else (m[k]['matched'] / m[k]['expected'],
                                                                           m[k]['matched'] / max(m[k]['generated'], 1))
    passed = (r.get('tree_check') or {}).get('passed')
    subject, moku, detail = exact('subject_nodes'), exact('moku_amounts'), exact('detail_nodes_expected_axes')
    if subject == (1, 1) and moku == (1, 1) and passed and detail in (None, (1, 1)):
        return 'a'
    t = m.get('tolerant') or {}
    rec = lambda k: None if not t.get(k) or not t[k].get('expected') else t[k]['recall']
    ts, tm, td = rec('subject_nodes'), rec('moku_amount_values'), rec('detail_nodes_expected_axes')
    if ts is not None and ts >= .9 and (tm is None or tm >= .8) and (td is None or td >= .5):
        return 'b'
    if subject and subject[0] >= .9 and moku is not None and moku[0] >= .9:
        return 'b'
    return 'c'


def metrics(r: dict) -> dict:
    m = r.get('metrics') or {}
    return {k: (m[k]['matched'], m[k]['expected'], m[k]['generated']) for k in KEYS if m.get(k) and m[k].get('expected')}


def main() -> None:
    base, new = load(Path(sys.argv[1])), load(Path(sys.argv[2]))
    causes = json.loads(Path(sys.argv[3]).read_text()) if len(sys.argv) > 3 else {}
    counts_base, counts_new, flagged = {}, {}, []
    for key in sorted(base):
        b, n = base[key], new.get(key)
        hand = causes.get(key, {}).get('class')
        cb = provisional(b)
        cn = provisional(n) if n else 'missing'
        counts_base[hand or cb] = counts_base.get(hand or cb, 0) + 1
        notes = []
        if n is None:
            print(f'{key}: missing in new')
            continue
        down = ORDER.get(cn, 0) < ORDER.get(cb, 0)
        mb, mn = metrics(b), metrics(n)
        for k in KEYS:
            if k in mb and k in mn and (mn[k][0] < mb[k][0] or mn[k][2] > mb[k][2] and mn[k][0] <= mb[k][0]):
                notes.append(f'{k} {mb[k]} -> {mn[k]}')
        tb = ((b.get('tree_check') or {}).get('counts')), ((n.get('tree_check') or {}).get('counts'))
        ub = (b.get('unit_check') or {}), (n.get('unit_check') or {})
        unit_changed = (ub[0].get('sum_matches'), ub[0].get('kan_sum')) != (ub[1].get('sum_matches'), ub[1].get('kan_sum'))
        rows = ''
        if b['_rows'] is not None and n['_rows'] is not None:
            diff = changes(b['_rows'], n['_rows'], 3)
            if diff['gone'] or diff['added']:
                rows = f"rows gone {diff['gone']} added {diff['added']}"
        status = '!!' if down or any(n_.startswith(('subject', 'moku')) for n_ in notes) else '  '
        if hand in ('a', 'b') and rows and not down:
            status = status if status == '!!' else '~ '
        flagged.append(status)
        print(f"{status} {key} [{hand or '-'}] {cb}->{cn} tree {tb[0]} -> {tb[1]} unit {'changed' if unit_changed else 'same'} {rows} {'; '.join(notes)}")
        if rows and diff['gone_examples'][:1]:
            print('       gone:', diff['gone_examples'][:2])
            print('       added:', diff['added_examples'][:2])
    print('class counts (hand class when given, else provisional) base:', counts_base)


if __name__ == '__main__':
    main()
