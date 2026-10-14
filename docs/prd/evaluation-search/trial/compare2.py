"""全文検索だけ（keyword）と hybrid の比較。AI を通さず、同じ検索語を1回ずつ引き、正解 T が上位10件に入る割合を比べる。

使い方: python3 compare2.py <作業dir> [--summarize]（既存の compare2.json を集計するだけ）
  <作業dir>/trial/ に questions2.json・exact.json・para_queries.json、<作業dir>/agent/chunk_index.json
出力: <作業dir>/compare2.json と、集合ごとの表（標準出力）。
"""
import argparse, json
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from common import search

ap = argparse.ArgumentParser()
ap.add_argument('work')
ap.add_argument('--summarize', action='store_true', help='保存済みの検索結果を集計する。検索は実行しない')
args = ap.parse_args()
W = args.work
idx = json.load(open(f'{W}/agent/chunk_index.json'))
exact = json.load(open(f'{W}/trial/exact.json'))
by = {e['id']: e for e in exact}
questions = json.load(open(f'{W}/trial/questions2.json'))
rows = [{'set': '第1段 名前', 'jurisdiction': e['jurisdiction'], 'query': e['name'], 'truth': e['pages']} for e in exact]
rows += [{'set': '第1段 言い換え', 'jurisdiction': by[p['id']]['jurisdiction'], 'query': p['query'], 'truth': by[p['id']]['pages']}
         for p in json.load(open(f'{W}/trial/para_queries.json'))]
rows += [{'set': q['set'], 'jurisdiction': q['jurisdiction'], 'query': q['query'], 'truth': q['truth']}
         for q in questions if q['set'] in ('S3', 'S4a', 'S4b', 'S5') and q['truth']]


def run(r):
    out = dict(r)
    for rt in ('keyword', 'hybrid'):
        meta = {}
        chunks = search(r['query'], r['jurisdiction'], retrieval_type=rt, meta=meta, max_num_results=10)
        rank = next((i + 1 for i, c in enumerate(chunks) if set(idx[c['id']]['pages']) & set(r['truth'])), None)
        out[rt] = {'rank': rank, 'n': len(chunks), 'meta': meta}
    return out


if args.summarize:
    res = json.load(open(f'{W}/compare2.json'))
else:
    with ThreadPoolExecutor(3) as ex:
        res = list(ex.map(run, rows))
    json.dump(res, open(f'{W}/compare2.json', 'w'), ensure_ascii=False)
g = defaultdict(list)
for r in res:
    g[r['set']].append(r)
# S1・S2 は第1段と同じ検索語・正解なので、その検索結果を再利用して部分集合を集計する。
key = lambda r: (r['jurisdiction'], r['query'], tuple(sorted(r['truth'])))
lookup = {key(r): r for r in res if r['set'].startswith('第1段')}
for q in questions:
    if q['set'] in ('S1', 'S2'):
        g[q['set']].append(lookup[key(q)])
print(f"{'set':14s} {'n':>4s} {'keyword@10':>10s} {'hybrid@10':>10s} {'kw 0件':>6s} {'hy 0件':>6s}")
for k, v in g.items():
    hit = lambda rt: sum(1 for r in v if r[rt]['rank']) / len(v)
    zero = lambda rt: sum(1 for r in v if r[rt]['n'] == 0)
    print(f"{k:14s} {len(v):4d} {hit('keyword'):10.1%} {hit('hybrid'):10.1%} {zero('keyword'):6d} {zero('hybrid'):6d}")
