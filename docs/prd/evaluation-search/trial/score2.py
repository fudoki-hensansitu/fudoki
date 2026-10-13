"""第2段の採点。計画（trial.md の「第2段の計画」）の定義どおりに数える。

使い方: python3 score2.py <作業dir> [overrides2.json]
  <作業dir>/trial/questions2.json、<作業dir>/agent/<qid>.jsonl・<qid>.run.json・chunk_index.json、
  <作業dir>/judge/{pages,quotes}/<qid>.json を読む。overrides2.json は判定を人が読み直して変えたもの
  （{"pages": {"<qid>|<頁id>": true|false}, "quotes": {"<qid>|<項目>|<頁id>": "<分類>"}}）。
出力: 集合ごとの表と <作業dir>/score2.json。
"""
import json, os, re, statistics, sys
from collections import Counter, defaultdict
from common import split_pages

W = sys.argv[1]
ov = json.load(open(sys.argv[2])) if len(sys.argv) > 2 else {'pages': {}, 'quotes': {}}
qs = json.load(open(f'{W}/trial/questions2.json'))
idx = json.load(open(f'{W}/agent/chunk_index.json'))
MISATTR = ('別の事業の行', '別の年度・列', '別の項目', '原典に無い')
norm = lambda s: re.sub(r'\s+', '', s or '')

# AI に見せた頁の本文（同じファイルの chunk を順に並べ、頁の見出しで区切って頁ごとにつなぐ）
page_text = defaultdict(str)
for c in sorted(idx.values(), key=lambda c: (c['item'], c['start'])):
    for p, t in split_pages(c['text']):
        pid = c['lead'] if p is None else f"{c['sha']}:{p + c['offset']}"
        if pid:
            page_text[pid] += norm(t)


def logs(qid):
    p = f'{W}/agent/{qid}.jsonl'
    return [json.loads(l) for l in open(p)] if os.path.exists(p) else []


def judged(kind, qid):
    p = f'{W}/judge/{kind}/{qid}.json'
    return json.load(open(p)) if os.path.exists(p) else {}


rows = []
for q in qs:
    lg = logs(q['id'])
    ans = next((r['answer'] for r in lg if r['kind'] == 'answer'), None)
    searches = [r for r in lg if r['kind'] == 'search']
    T, A = set(q['truth']), set(q['accept'])
    added = set()
    jp = judged('pages', q['id'])
    P = set(ans.get('pages', [])) if ans else set()
    for pid in P - A:
        v = ov['pages'].get(f'{q["id"]}|{pid}', (jp.get(pid) or {}).get('contains'))
        if v:
            added.add(pid)
    A2 = A | added
    negative = not A2
    st = ans.get('status') if ans else None
    if st is None:
        cls = '回答なし'
    elif negative:
        cls = {'not_found': '正答', 'found': '取り違え', 'ambiguous': '曖昧'}[st]
    elif st == 'found':
        if P - A2:
            cls = '取り違え'
        elif P & (T or A2):
            cls = '部分' if q['set'] == 'S4a' and not T <= P else '正答'
        else:
            cls = '取り違え'
    else:
        cls = {'not_found': '該当なし', 'ambiguous': '曖昧'}[st]
    # 引用（正答・部分の回答だけ）
    quotes = []
    if cls in ('正答', '部分') and st == 'found':
        jq = judged('quotes', q['id'])
        for pr in ans.get('projects', []):
            for field, v in (pr.get('fields') or {}).items():
                if not v:
                    continue
                if v.get('page') not in A2:
                    quotes.append({'field': field, 'page': v.get('page'), 'verbatim': None, 'label': '別の事業の行'})
                    continue
                lab = next((x['label'] for x in jq if x['field'] == field and x['page'] == v['page'] and x['quote'] == v.get('quote')), None) if isinstance(jq, list) else None
                lab = ov['quotes'].get(f'{q["id"]}|{field}|{v["page"]}', lab)
                quotes.append({'field': field, 'page': v['page'], 'verbatim': norm(v.get('quote')) in page_text.get(v['page'], ''), 'label': lab})
    run = json.load(open(f'{W}/agent/{q["id"]}.run.json')) if os.path.exists(f'{W}/agent/{q["id"]}.run.json') else {}
    rows.append({'id': q['id'], 'set': q['set'], 'negative': negative, 'class': cls, 'status': st, 'searches': len(searches),
                 'zero': sum(1 for s in searches if not s['chunks']), 'added': sorted(added), 'quotes': quotes,
                 'cost': run.get('total_cost_usd'), 'neg_reclassified': not A and bool(added)})
json.dump(rows, open(f'{W}/score2.json', 'w'), ensure_ascii=False)

group = lambda r: ('S5 正解なし' if r['set'] == 'S5' and r['negative'] else r['set'])
g = defaultdict(list)
for r in rows:
    g[group(r)].append(r)
print(f"{'set':16s} {'n':>4s} {'正答':>6s} {'取違':>5s} {'該当なし':>6s} {'曖昧':>4s} {'部分':>4s} {'無回答':>4s} {'検索回数 中央/平均':>14s} {'足した頁':>6s}")
for k in sorted(g):
    v, c = g[k], Counter(r['class'] for r in g[k])
    n = len(v)
    print(f"{k:16s} {n:4d} {c['正答'] / n:6.0%} {c['取り違え'] / n:5.0%} {c['該当なし'] / n:6.0%} {c['曖昧']:4d} {c['部分']:4d} {c['回答なし']:4d}"
          f" {statistics.median(r['searches'] for r in v):6.1f}/{statistics.mean(r['searches'] for r in v):4.2f}       {sum(len(r['added']) for r in v):3d}")
pos = [r for r in rows if r['set'] in ('S1', 'S2', 'S3', 'S4a', 'S4b')]
print('取り違え（S1〜S4 の合計）', sum(r['class'] == '取り違え' for r in pos), '/', len(pos))
neg = [r for r in rows if r['negative'] and r['set'] != 'S5-undetermined']
print('負例（S6 と S5 の正解なし）: not_found', sum(r['class'] == '正答' for r in neg), '/', len(neg),
      ' found（取り違え）', sum(r['class'] == '取り違え' for r in neg), ' 負例から外した', sum(r['neg_reclassified'] for r in rows))
qt = [x for r in rows for x in r['quotes']]
print('引用の項目', len(qt), ' 写しの一致', sum(1 for x in qt if x['verbatim']), ' 分類', Counter(x['label'] for x in qt))
print('引用の取り違え', sum(1 for x in qt if x['label'] in MISATTR), '/', len(qt))
print('会話の費用 合計 $', round(sum(r['cost'] or 0 for r in rows), 2), ' 検索の合計', sum(r['searches'] for r in rows),
      ' 候補0件の検索', sum(r['zero'] for r in rows))
