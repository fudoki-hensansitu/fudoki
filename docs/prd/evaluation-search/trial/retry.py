"""参考: run.py で外れた言い換えの問いを、retry_queries.json の別の検索語で引き直す。
retry_queries.json は初版の採点で外れた11問について、問いだけを LLM に渡して作らせたもの。今の採点で外れた問いのうち、検索語の無いものは数えない。
使い方: python retry.py <作業dir>（run.py の後）"""
import json, sys
from common import search

SP = sys.argv[1]
cm = json.load(open(SP + '/trial/chunk_pages.json'))
truth = {e['id']: e for e in json.load(open(SP + '/trial/exact.json'))}
missed = {r['id']: r for r in json.load(open(SP + '/trial/results.json')) if r['qtype'] == 'para' and not r['rank']}
queries = {r['id']: r['queries'] for r in json.load(open(SP + '/trial/retry_queries.json'))}
hit = 0
for qid, m in missed.items():
    if qid not in queries:
        print('-', truth[qid]['name'], '| 検索語なし'); continue
    tp, found = set(truth[qid]['pages']), []
    for q in queries[qid]:
        chunks = search(q, m['jurisdiction'], max_num_results=10)
        found.append((q, len(chunks), next((i + 1 for i, c in enumerate(chunks) if set(cm.get(c['id'], [])) & tp), None)))
    ok = any(f[2] for f in found); hit += ok
    print('○' if ok else '×', truth[qid]['name'], '|', m['query'], '|', found)
print('retry recovered', hit, '/', sum(1 for q in missed if q in queries), '(missed', len(missed), ')')
