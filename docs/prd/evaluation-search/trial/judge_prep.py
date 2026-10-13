import json,subprocess,re,sys,random
from concurrent.futures import ThreadPoolExecutor
SP=sys.argv[1]; INST='fudoki-eval-trial-v1'  # SP は作業dir。trial/ の JSON を <SP>/trial/ に置き、結果もそこへ書く
res=json.load(open(SP+'/trial/results.json')); cm=json.load(open(SP+'/trial/chunk_pages.json'))
exact=json.load(open(SP+'/trial/exact.json')); random.seed(3)
neg=[dict(e,jurisdiction='131148',qtype='neg',query=e['name'],pages=[]) for e in random.sample([e for e in exact if e['jurisdiction']=='131172'],15)]
neg+=[dict(e,jurisdiction='131172',qtype='neg',query=e['name'],pages=[]) for e in random.sample([e for e in exact if e['kind']=='施策'],15)]
def search(q):
    body={'messages':[{'role':'user','content':q['query']}],'ai_search_options':{'retrieval':{'filters':{'jurisdiction':q['jurisdiction']},'max_num_results':10,'score_threshold':0,'keyword_match_mode':'or'}}}
    d=json.loads(subprocess.run(['cf','ai-search','search',INST,q['query'],'--name','default','--body',json.dumps(body,ensure_ascii=False)],capture_output=True,text=True).stdout or '{}')
    return dict(q,chunks=d.get('chunks',[]))
para=[r for r in res if r['qtype']=='para']
with ThreadPoolExecutor(4) as ex: rows=list(ex.map(search,para+neg))
tasks=[]
for i,r in enumerate(rows):
    cands=[]
    for c in r['chunks']:
        off=0 if 'p39-75' not in c['item']['key'] else 38
        segs=re.split(r'### Page (\d+)\n',c['text'])
        for j in range(1,len(segs),2):
            cands.append({'page':int(segs[j])+off,'doc':c['item']['metadata'].get('document'),'text':re.sub(r'\s+',' ',segs[j+1])[:700]})
    seen=set();uniq=[]
    for c in cands:
        if c['page'] not in seen: seen.add(c['page']);uniq.append(c)
    tasks.append({'tid':i,'query':r['query'],'candidates':uniq,'_truth':r['pages'],'_qtype':r['qtype'],'_name':r['name'],'_j':r['jurisdiction']})
json.dump(tasks,open(SP+'/trial/judge_truth.json','w'),ensure_ascii=False)
json.dump([{k:v for k,v in t.items() if not k.startswith('_')} for t in tasks],open(SP+'/trial/judge_input.json','w'),ensure_ascii=False)
print(len(tasks), sum(len(t['candidates']) for t in tasks)/len(tasks))
