import json,subprocess,re,sys
from concurrent.futures import ThreadPoolExecutor
SP=sys.argv[1]; INST='fudoki-eval-trial-v1'  # SP は作業dir。trial/ の JSON を <SP>/trial/ に置き、結果もそこへ書く
def cf(*a): return json.loads(subprocess.run(['cf','ai-search',*a,'--name','default'],capture_output=True,text=True).stdout)
items=cf('items','list','--id',INST)
cmap={}
for it in items:
    off=int(it['metadata'].get('page_offset',0)); sha=it['metadata']['origin_sha256'][:12]; last=None
    allc=[];o=0
    while True:
        page=cf('items','chunks',it['id'],'--id',INST,'--limit','50','--offset',str(o))
        allc+=page; o+=len(page)
        if len(page)<50: break
    assert len(allc)==it['chunks_count'],(it['key'],len(allc),it['chunks_count'])
    for c in sorted(allc,key=lambda c:c['start_byte']):
        ps=[int(x) for x in re.findall(r'### Page (\d+)',c['text'])]
        pages=set(ps)|({last} if last and not c['text'].lstrip().startswith('### Page') else set())
        if ps: last=ps[-1]
        cmap[c['id']]=sorted(f'{sha}:{p+off}' for p in pages if p)  # 本冊と別冊で頁番号が重なるので、原典の sha256 と組にする
json.dump(cmap,open(SP+'/trial/chunk_pages.json','w'))
exact=json.load(open(SP+'/trial/exact.json')); by={e['id']:e for e in exact}
para=json.load(open(SP+'/trial/para_queries.json'))
qs=[dict(e,qtype='exact',query=e['name']) for e in exact]+[dict(by[p['id']],qtype='para',query=p['query']) for p in para]
def run(q):
    body={'messages':[{'role':'user','content':q['query']}],'ai_search_options':{'retrieval':{'filters':{'jurisdiction':q['jurisdiction']},'max_num_results':10,'score_threshold':0,'keyword_match_mode':'or'}}}
    d=json.loads(subprocess.run(['cf','ai-search','search',INST,q['query'],'--name','default','--body',json.dumps(body,ensure_ascii=False)],capture_output=True,text=True).stdout or '{}')
    res=[{'pages':cmap.get(c['id'],[]),'v':c.get('scoring_details',{}).get('vector_score'),'k':c.get('scoring_details',{}).get('keyword_score'),'id':c['id']} for c in d.get('chunks',[])]
    assert all(c['id'] in cmap for c in d.get('chunks',[])),q['query']
    rank=next((i+1 for i,r in enumerate(res) if set(r['pages'])&set(q['pages'])),None)
    return dict(q,rank=rank,n=len(res),results=res)
with ThreadPoolExecutor(4) as ex: out=list(ex.map(run,qs))
json.dump(out,open(SP+'/trial/results.json','w'),ensure_ascii=False)
from collections import defaultdict
g=defaultdict(list)
for o in out: g[(o['jurisdiction'],o['kind'],o['qtype'])].append(o); g[('all','',o['qtype'])].append(o)
print(f"{'group':28s} {'n':>4s} {'@1':>5s} {'@3':>5s} {'@10':>5s} {'0件':>4s}")
for k,v in sorted(g.items()):
    r=lambda K:sum(1 for o in v if o['rank'] and o['rank']<=K)/len(v)
    print(f"{'/'.join(k):28s} {len(v):4d} {r(1):5.0%} {r(3):5.0%} {r(10):5.0%} {sum(1 for o in v if o['n']==0):4d}")
