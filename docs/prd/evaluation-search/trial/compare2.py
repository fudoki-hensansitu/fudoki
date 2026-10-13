"""全文検索だけ（keyword）と hybrid の比較。AI を通さず、同じ検索語を1回ずつ引き、正解 T が上位10件に入る割合を比べる。

使い方: python3 compare2.py <作業dir>（<作業dir>/trial/ に questions2.json・exact.json・para_queries.json、<作業dir>/agent/chunk_index.json）
出力: <作業dir>/compare2.json と、集合ごとの表（標準出力）。
"""
import json, sys
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from common import search

W = sys.argv[1]
idx = json.load(open(f'{W}/agent/chunk_index.json'))
exact = json.load(open(f'{W}/trial/exact.json'))
by = {e['id']: e for e in exact}
rows = [{'set': '第1段 名前', 'jurisdiction': e['jurisdiction'], 'query': e['name'], 'truth': e['pages']} for e in exact]
rows += [{'set': '第1段 言い換え', 'jurisdiction': by[p['id']]['jurisdiction'], 'query': p['query'], 'truth': by[p['id']]['pages']}
         for p in json.load(open(f'{W}/trial/para_queries.json'))]
rows += [{'set': q['set'], 'jurisdiction': q['jurisdiction'], 'query': q['query'], 'truth': q['truth']}
         for q in json.load(open(f'{W}/trial/questions2.json')) if q['set'] in ('S3', 'S4a', 'S4b', 'S5') and q['truth']]


def run(r):
    out = dict(r)
    for rt in ('keyword', 'hybrid'):
        meta = {}
        chunks = search(r['query'], r['jurisdiction'], retrieval_type=rt, meta=meta)
        rank = next((i + 1 for i, c in enumerate(chunks) if set(idx[c['id']]['pages']) & set(r['truth'])), None)
        out[rt] = {'rank': rank, 'n': len(chunks), 'meta': meta}
    return out


with ThreadPoolExecutor(3) as ex:
    res = list(ex.map(run, rows))
json.dump(res, open(f'{W}/compare2.json', 'w'), ensure_ascii=False)
g = defaultdict(list)
for r in res:
    g[r['set']].append(r)
print(f"{'set':14s} {'n':>4s} {'keyword@10':>10s} {'hybrid@10':>10s} {'kw 0件':>6s} {'hy 0件':>6s}")
for k, v in g.items():
    hit = lambda rt: sum(1 for r in v if r[rt]['rank']) / len(v)
    zero = lambda rt: sum(1 for r in v if r[rt]['n'] == 0)
    print(f"{k:14s} {len(v):4d} {hit('keyword'):10.0%} {hit('hybrid'):10.0%} {zero('keyword'):6d} {zero('hybrid'):6d}")
