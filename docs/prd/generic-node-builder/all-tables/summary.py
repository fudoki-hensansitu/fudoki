"""Aggregate per-table results into one Markdown table with a provisional class.

(a) replaceable: subject nodes and moku amounts 100% (recall and precision) and the tree check passes;
    the final class in causes.json also requires the breakdown on the expected axes to match fully.
(b) small difference: subject nodes and moku amounts >= 90% recall.
(c) does not fit: otherwise. Causes for (b)/(c) are filled in by hand in causes.json.
"""
import json
import sys
from pathlib import Path

results = Path(sys.argv[1])
causes = json.loads(Path(sys.argv[2]).read_text()) if len(sys.argv) > 2 and Path(sys.argv[2]).exists() else {}
# Optional: an earlier causes.json to show each table's class before → after.
before = json.loads(Path(sys.argv[3]).read_text()) if len(sys.argv) > 3 and Path(sys.argv[3]).exists() else {}
rows = []
for path in sorted(results.glob('*.json')):
    if path.name.endswith('.observed.json'):
        continue
    r = json.loads(path.read_text())
    key = f"{r['jurisdiction']}/{r['table_id']}"
    m = r.get('metrics', {})
    pct = lambda s: None if not s or not s['expected'] else (s['matched'] / s['expected'], s['matched'] / max(s['generated'], 1))
    subject, moku = pct(m.get('subject_nodes')), pct(m.get('moku_amounts'))
    detail, detail_amounts = pct(m.get('detail_nodes_expected_axes')), pct(m.get('detail_amounts_expected_axes'))
    passed = (r.get('tree_check') or {}).get('passed')
    if r.get('error') or subject is None:
        kind = 'c'
    elif subject == (1, 1) and moku == (1, 1) and passed:
        kind = 'a'
    elif subject[0] >= .9 and moku is not None and moku[0] >= .9:
        kind = 'b'
    else:
        kind = 'c'
    rows.append((key, r, m, subject, moku, detail, detail_amounts, passed, causes.get(key, {}).get('class', kind), causes.get(key, {}).get('cause', '')))

f = lambda v: '—' if v is None else f'{v[0]:.1%} / {v[1]:.1%}'
print('| 表 | 頁 | 款項目 | 目の金額 | 目より下（正解の軸） | 目より下の金額 | 誤字を許した 款項目 / 目の金額（値） / 目より下 | 上乗せ（軸・ノード） | 木の検査 | 文字層 | 秒 | 分類 | 原因 |')
print('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |')
for key, r, m, subject, moku, detail, detail_amounts, passed, kind, cause in rows:
    extra = m.get('extra_axes') or {}
    names = extra.get('axes', [])
    axes = ('・'.join(names) if len('・'.join(names)) <= 24 else f"{'・'.join(names)[:20]}…（{len(names)}軸）") if names else '—'
    tree = r.get('tree_check') or {}
    tree_text = 'error' if r.get('error') else ('通過' if passed else f"不一致 {tree.get('counts', {}).get('不一致', 0)}・問題 {tree.get('issues', 0)}")
    pages = r['pages']
    span = f"{pages[0]}–{pages[-1]}（{len(pages)}）" + ('※' if r.get('pages_from') == 'expected-span' else '')
    by_axis = m.get('detail_nodes_by_axis', {})
    detail_text = f(detail) + ('' if not by_axis else ' ' + ' '.join(f"{a}:{v['matched']}/{v['expected']}" for a, v in by_axis.items()))
    tolerant = m.get('tolerant') or {}
    tolerant_text = (f"{f(pct(tolerant.get('subject_nodes')))} / {f(pct(tolerant.get('moku_amount_values')))} / "
                     f"{f(pct(tolerant.get('detail_nodes_expected_axes')))}") if tolerant else '—'
    repairs = r.get('repairs') or {}
    layer = '—' if not repairs else ('壊れ・置換 {}'.format(repairs['repairs']) if repairs['broken'] else '') + \
        ('・不可視 {}字'.format(repairs['hidden_glyphs']) if repairs['hidden_glyphs'] else '')
    shift = f"{before[key]['class']}→{kind}" if key in before else kind
    print(f"| {key} | {span} | {f(subject)} | {f(moku)} | {detail_text} | {f(detail_amounts)} | {tolerant_text} | {axes} {extra.get('nodes', 0) if extra else ''} | {tree_text} | {layer.lstrip('・') or '—'} | {r['seconds']} | {shift} | {cause} |")
counts = {}
for row in rows:
    counts[row[8]] = counts.get(row[8], 0) + 1
print()
print('分類の件数:', counts, ' 合計', len(rows))
