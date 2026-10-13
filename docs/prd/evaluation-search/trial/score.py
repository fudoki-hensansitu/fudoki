"""LLM の判定（judge_out_*.json、各要素 {tid, ids: [選んだ候補の id], confidence}）を採点する。使い方: python score.py <作業dir>"""
import glob, json, sys
from collections import Counter

SP = sys.argv[1]
truth = {t['tid']: t for t in json.load(open(SP + '/trial/judge_truth.json'))}
given = {t['tid']: {c['id'] for c in t['candidates']} for t in json.load(open(SP + '/trial/judge_input.json'))}
out = {a['tid']: a for f in sorted(glob.glob(SP + '/trial/judge_out_*.json')) for a in json.load(open(f))}
print('judged', len(out), '/', len(truth))
c, rows = Counter(), []
for tid, t in truth.items():
    if tid not in out:
        continue
    picked, tp = set(out[tid]['ids']), set(t['_truth'])
    incand = '有' if tp & given[tid] else '無'  # LLM に渡した候補に正解があったか
    if t['_qtype'] == 'neg':
        k = 'neg:該当なし' if not picked else 'neg:選んだ'
    elif picked & tp:
        k = 'para:正解だけ' if not picked - tp else 'para:正解＋余分'
    elif not picked:
        k = f'para:該当なし（正解が候補に{incand}）'
    else:
        k = f'para:誤り（正解が候補に{incand}）'
    c[k] += 1; rows.append((k, t['_name'], t['query'], sorted(picked), t['_truth'], out[tid].get('confidence')))
for k, v in sorted(c.items()):
    print(f'{k:30s} {v}')
json.dump(rows, open(SP + '/trial/judge_rows.json', 'w'), ensure_ascii=False, indent=0)
