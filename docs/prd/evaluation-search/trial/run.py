"""検索の当たり: 上位10件の chunk のどれかが正解の（原典・頁）を含むか。使い方: python run.py <作業dir>（<作業dir>/trial/ に問いの JSON を置く）"""
import json, sys
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from common import INST, cf, page_id, search, split_pages

SP = sys.argv[1]
cmap = {}
for it in cf('items', 'list', '--id', INST):
    chunks, offset = [], 0
    while True:  # chunks の一覧は既定20件のページ送り
        page = cf('items', 'chunks', it['id'], '--id', INST, '--limit', '50', '--offset', str(offset))
        chunks += page; offset += len(page)
        if len(page) < 50:
            break
    assert len(chunks) == it['chunks_count'], (it['key'], len(chunks), it['chunks_count'])
    last = None
    for c in sorted(chunks, key=lambda c: c['start_byte']):
        pages = set()
        for p, _ in split_pages(c['text']):
            pages.add(p if p is not None else last)  # 見出しの前の文は、直前の chunk の最後の頁の続き
            if p is not None:
                last = p
        cmap[c['id']] = sorted(page_id(it['metadata'], p) for p in pages if p)
json.dump(cmap, open(SP + '/trial/chunk_pages.json', 'w'))

exact = json.load(open(SP + '/trial/exact.json')); by = {e['id']: e for e in exact}
para = json.load(open(SP + '/trial/para_queries.json'))
qs = [dict(e, qtype='exact', query=e['name']) for e in exact] + [dict(by[p['id']], qtype='para', query=p['query']) for p in para]


def run(q):
    chunks = search(q['query'], q['jurisdiction'], max_num_results=10)
    assert all(c['id'] in cmap for c in chunks), q['query']
    res = [{'pages': cmap[c['id']], 'v': c.get('scoring_details', {}).get('vector_score'),
            'k': c.get('scoring_details', {}).get('keyword_score'), 'id': c['id']} for c in chunks]
    rank = next((i + 1 for i, r in enumerate(res) if set(r['pages']) & set(q['pages'])), None)
    return dict(q, rank=rank, n=len(res), results=res)


with ThreadPoolExecutor(4) as ex:
    out = list(ex.map(run, qs))
json.dump(out, open(SP + '/trial/results.json', 'w'), ensure_ascii=False)
g = defaultdict(list)
for o in out:
    g[(o['jurisdiction'], o['kind'], o['qtype'])].append(o); g[('all', '', o['qtype'])].append(o)
print(f"{'group':28s} {'n':>4s} {'@1':>5s} {'@3':>5s} {'@10':>5s} {'0件':>4s}")
for k, v in sorted(g.items()):
    r = lambda K: sum(1 for o in v if o['rank'] and o['rank'] <= K) / len(v)
    print(f"{'/'.join(k):28s} {len(v):4d} {r(1):5.0%} {r(3):5.0%} {r(10):5.0%} {sum(1 for o in v if o['n'] == 0):4d}")
