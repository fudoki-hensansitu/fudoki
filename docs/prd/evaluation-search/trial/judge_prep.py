"""LLM に判定させる候補を作る。言い換えの問いと負例について、上位10件の chunk を（原典・頁）に分け、先頭10頁・各600字を渡す。
使い方: python judge_prep.py <作業dir>（run.py の後）。judge_input.json を LLM に渡し、judge_out_*.json を score.py で採点する。"""
import json, random, re, sys
from concurrent.futures import ThreadPoolExecutor
from common import page_id, search, split_pages

SP = sys.argv[1]
MAX_PAGES, MAX_CHARS = 10, 600
res = json.load(open(SP + '/trial/results.json'))
exact = json.load(open(SP + '/trial/exact.json')); random.seed(3)
neg = [dict(e, jurisdiction='131148', qtype='neg', query=e['name'], pages=[]) for e in random.sample([e for e in exact if e['jurisdiction'] == '131172'], 15)]
neg += [dict(e, jurisdiction='131172', qtype='neg', query=e['name'], pages=[]) for e in random.sample([e for e in exact if e['kind'] == '施策'], 15)]
para = [r for r in res if r['qtype'] == 'para']
with ThreadPoolExecutor(4) as ex:
    rows = list(ex.map(lambda q: dict(q, chunks=search(q['query'], q['jurisdiction'])), para + neg))
tasks = []
for i, r in enumerate(rows):
    seen, cands = set(), []
    for c in r['chunks']:
        for p, text in split_pages(c['text']):
            pid = page_id(c['item']['metadata'], p) if p is not None else None
            if pid and pid not in seen:
                seen.add(pid)
                cands.append({'id': pid, 'doc': c['item']['metadata'].get('document'), 'text': re.sub(r'\s+', ' ', text)[:MAX_CHARS]})
    tasks.append({'tid': i, 'query': r['query'], 'candidates': cands[:MAX_PAGES],
                  '_truth': r['pages'], '_qtype': r['qtype'], '_name': r['name'], '_j': r['jurisdiction']})
json.dump(tasks, open(SP + '/trial/judge_truth.json', 'w'), ensure_ascii=False)
json.dump([{k: v for k, v in t.items() if not k.startswith('_')} for t in tasks], open(SP + '/trial/judge_input.json', 'w'), ensure_ascii=False)
print(len(tasks), sum(len(t['candidates']) for t in tasks) / len(tasks))
