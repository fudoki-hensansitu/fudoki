"""第2段の問いの集合（questions2.json）を作る。計画は trial.md の「第2段の計画」。

使い方: python3 questions2.py <trial dir>（このdir。exact.json・para_queries.json・units.json・moku.json・labels/ を読む）
各要素: {id, set, jurisdiction, ask（AI に渡す問いの文）, query（全文検索と hybrid の比較で1回引く語）,
        target {jurisdiction_name, name, kind, note}, truth（T）, accept（A）}
"""
import json, random, sys
from collections import defaultdict

D = sys.argv[1]
NAMES = {'131172': '東京都北区', '131148': '東京都中野区'}
SUFFIX = 'は、うまくいった？ 目標と実績、評価、課題、今後の方向を原典の頁つきで教えて。'
load = lambda p: json.load(open(f'{D}/{p}'))
units, moku = load('units.json'), load('moku.json')
out = []


def add(qid, set_, j, name, kind, truth, accept=None, ask=None, query=None, note=None):
    out.append({'id': qid, 'set': set_, 'jurisdiction': j,
                'ask': ask or f'{NAMES[j]}の令和7年度の「{name}」{SUFFIX}', 'query': query or name,
                'target': {'jurisdiction_name': NAMES[j], 'name': name, 'kind': kind, 'note': note},
                'truth': sorted(truth), 'accept': sorted(set(accept or truth))})


# S1 名前そのもの（第1段の exact.json から）
exact = load('exact.json')
random.seed(21)
s1 = (random.sample([e for e in exact if e['jurisdiction'] == '131172'], 20)
      + random.sample([e for e in exact if e['kind'] == '施策'], 10)
      + random.sample([e for e in exact if e['kind'] == '取組'], 10))
for e in s1:
    add(f's1-{e["id"]}', 'S1', e['jurisdiction'], e['name'], e['kind'], e['pages'])

# S2 言い換え（第1段の para_queries.json 全部）
by = {e['id']: e for e in exact}
for p in load('para_queries.json'):
    e = by[p['id']]
    add(f's2-{p["id"]}', 'S2', e['jurisdiction'], e['name'], e['kind'], e['pages'],
        ask=f'{NAMES[e["jurisdiction"]]}の令和7年度について: {p["query"]} 目標と実績、評価、課題、今後の方向を原典の頁つきで教えて。',
        query=p['query'])

# S3 略称
abbr = {a['aid']: a['abbr'] for a in load('labels/abbr.json')}
for a in load('labels/abbr_input.json'):
    add(f's3-{a["aid"]}', 'S3', a['jurisdiction'], a['name'], a['kind'], a['pages'],
        ask=f'{NAMES[a["jurisdiction"]]}の令和7年度の「{abbr[a["aid"]]}」{SUFFIX}', query=abbr[a['aid']])

# S4a 中野区の主な事業で、同じ名前の行が別の頁にもあるもの
pages = defaultdict(set)
for u in units:
    if u['kind'] == '主な事業':
        pages[u['name']].add(u['page_id'])
for i, (name, ps) in enumerate(sorted((n, p) for n, p in pages.items() if len(p) > 1)):
    add(f's4a-{i:02d}', 'S4a', '131148', name, '主な事業', ps, note='同じ名前の行が複数の施策に載る')

# S4b 北区の似た名前（共通部分が長い組）
SIMILAR = ['駅周辺のまちづくりの促進', '赤羽台周辺のまちづくりの促進', '新設・拡幅整備', '公民連携による']
for i, u in enumerate(u for u in units if u['kind'] == '事業' and any(s in u['name'] for s in SIMILAR)):
    add(f's4b-{i:02d}', 'S4b', '131172', u['name'], '事業', [u['page_id']])

# S5 目（北区の同じ名前の目は全部、残りから無作為）
la = {x['id']: x for x in load('labels/moku_truth_A.json')}
lb = {x['id']: x for x in load('labels/moku_truth_B.json')}
count = defaultdict(int)
for m in moku:
    count[(m['jurisdiction'], m['moku'])] += 1
same = [m for m in moku if count[(m['jurisdiction'], m['moku'])] > 1]
rest = [m for m in moku if count[(m['jurisdiction'], m['moku'])] == 1]
random.seed(31)
s5 = same + random.sample([m for m in rest if m['jurisdiction'] == '131172'], 14) + random.sample([m for m in rest if m['jurisdiction'] == '131148'], 14)
for m in s5:
    a = set(la[m['id']]['high'] + la[m['id']]['medium'])
    b = set(lb[m['id']]['high'] + lb[m['id']]['medium'])
    q_ask = (f'{NAMES[m["jurisdiction"]]}の令和7年度決算の目「{m["moku"]}」（款「{m["kan"]}」・項「{m["kou"]}」）のお金で行った事業は、'
             f'うまくいった？ 評価の資料から、この目に当たる事業の評価を、目標と実績、評価、課題、今後の方向まで原典の頁つきで教えて。')
    add(f's5-{m["id"]}', 'S5' if bool(a) == bool(b) else 'S5-undetermined', m['jurisdiction'], m['moku'], '目', a & b, a | b,
        ask=q_ask, note=f'款「{m["kan"]}」・項「{m["kou"]}」')

# S6 負例
for n in (n for n in load('labels/negatives.json') if not n.get('excluded')):
    add(f's6-{n["nid"]}', f'S6-{n["type"]}', n['jurisdiction'], n['name'], '負例', [])

ids = [q['id'] for q in out]
assert len(ids) == len(set(ids))
json.dump(out, open(f'{D}/questions2.json', 'w'), ensure_ascii=False, indent=1)
from collections import Counter
print(Counter(q['set'] for q in out), len(out))
