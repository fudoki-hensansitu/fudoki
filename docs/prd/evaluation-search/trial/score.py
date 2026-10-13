import json,glob,sys
SP=sys.argv[1]  # 作業dir。trial/ の JSON を <SP>/trial/ に置き、結果もそこへ書く
truth={t['tid']:t for t in json.load(open(SP+'/trial/judge_truth.json'))}
out={}
for f in sorted(glob.glob(SP+'/trial/judge_out_*.json')):
    for a in json.load(open(f)): out[a['tid']]=a
print('judged',len(out),'/',len(truth))
from collections import Counter
c=Counter();rows=[]
for tid,t in truth.items():
    if tid not in out: continue
    a=out[tid]; picked=set(a['pages']); tp=set(t['_truth'])
    incand=bool(tp & {x['page'] for x in json.load(open(SP+'/trial/judge_input.json'))[tid]['candidates'][:10]}) if t['_qtype']=='para' else False
    if t['_qtype']=='neg':
        k='neg:該当なし' if not picked else 'neg:選んだ'
    else:
        if picked & tp and not (picked - tp): k='para:正解だけ'
        elif picked & tp: k='para:正解＋余分'
        elif not picked: k='para:該当なし（正解が候補に'+('有' if incand else '無')+'）'
        else: k='para:誤り（正解が候補に'+('有' if incand else '無')+'）'
    c[k]+=1; rows.append((k,t['_name'],t['query'],sorted(picked),t['_truth'],a.get('confidence')))
for k,v in sorted(c.items()): print(f'{k:30s} {v}')
json.dump(rows,open(SP+'/trial/judge_rows.json','w'),ensure_ascii=False,indent=0)
