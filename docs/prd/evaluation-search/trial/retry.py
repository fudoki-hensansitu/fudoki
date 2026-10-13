import json,subprocess,sys
SP=sys.argv[1]; INST='fudoki-eval-trial-v1'  # SP は作業dir。trial/ の JSON を <SP>/trial/ に置き、結果もそこへ書く
cm=json.load(open(SP+'/trial/chunk_pages.json'))
meta={m['id']:m for m in json.load(open(SP+'/trial/retry_meta.json'))}
truth={e['id']:e for e in json.load(open(SP+'/trial/exact.json'))}
hit=0
for r in json.load(open(SP+'/trial/retry_queries.json')):
    m=meta[r['id']]; tp=set(truth[r['id']]['pages']); found=[]
    for q in r['queries']:
        body={'messages':[{'role':'user','content':q}],'ai_search_options':{'retrieval':{'filters':{'jurisdiction':m['jurisdiction']},'max_num_results':10,'score_threshold':0,'keyword_match_mode':'or'}}}
        d=json.loads(subprocess.run(['cf','ai-search','search',INST,q,'--name','default','--body',json.dumps(body,ensure_ascii=False)],capture_output=True,text=True).stdout or '{}')
        rank=next((i+1 for i,c in enumerate(d.get('chunks',[])) if set(cm.get(c['id'],[]))&tp),None)
        found.append((q,len(d.get('chunks',[])),rank))
    ok=any(f[2] for f in found); hit+=ok
    print('○' if ok else '×', truth[r['id']]['name'],'|',m['query'],'|',found)
print('retry recovered',hit,'/',len(meta))
