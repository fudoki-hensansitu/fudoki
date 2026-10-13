"""第2段の採点。計画（trial.md の「第2段の計画」）の定義どおりに数える。

使い方: python3 score2.py <作業dir> [overrides2.json] [--partial]
  <作業dir>/trial/questions2.json、<作業dir>/agent/<qid>.jsonl・<qid>.run.json・chunk_index.json、
  <作業dir>/judge/{pages,quotes}/<qid>.json を読む。overrides2.json は判定を人が読み直して変えたもの
  （{"pages": {"<qid>|<頁id>": true|false}, "quotes": {"<qid>|<項目>|<頁id>": "<分類>"}}）。
出力: 集合ごとの表と <作業dir>/score2.json。判定未完了なら終了し、--partial のときだけ暫定値を出す。
"""
import argparse, json, os, re, statistics
from collections import Counter, defaultdict
from common import QUOTE_LABELS, attempt_results, classify_answer, quote_items, returned_page_text, usage_limited

ap = argparse.ArgumentParser()
ap.add_argument('work')
ap.add_argument('overrides', nargs='?')
ap.add_argument('--partial', action='store_true', help='判定待ちを含む暫定値を出す')
args = ap.parse_args()
W = args.work
ov = json.load(open(args.overrides)) if args.overrides else {}
qs = json.load(open(f'{W}/trial/questions2.json'))
idx = json.load(open(f'{W}/agent/chunk_index.json'))
MISATTR = ('別の事業の行', '別の年度・列', '別の項目', '原典に無い')
norm = lambda s: re.sub(r'\s+', '', s or '')


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
    assessment = classify_answer(q, ans, judged('pages', q['id']), ov.get('pages'))
    cls, A2 = assessment['class'], assessment['accept']
    st = ans.get('status') if ans else None
    quotes = []
    if assessment['quote_eligible']:
        jq = judged('quotes', q['id'])
        page_text = returned_page_text(lg, idx)
        for item in quote_items(ans):
            field, pid, quote = item['field'], item['page'], item['quote']
            lab = next((x['label'] for x in jq if x['field'] == field and x['page'] == pid
                        and x.get('quote') == quote and x.get('reading') == item['reading']), None) if isinstance(jq, list) else None
            lab = ov.get('quotes', {}).get(f'{q["id"]}|{field}|{pid}', lab)
            if pid not in A2:
                lab = '別の事業の行'
            if lab not in QUOTE_LABELS:
                lab = None
            quotes.append({'field': field, 'page': pid, 'verbatim': bool(norm(quote)) and norm(quote) in page_text.get(pid, ''), 'label': lab})
    attempts = attempt_results(W, q['id'])
    if not ans and cls != '採点対象外':
        failures = sum(not usage_limited(result) for result in attempts)
        cls = '回答なし' if failures >= 2 else ('再実行待ち' if failures else '未実行')
    rows.append({'id': q['id'], 'set': q['set'], 'negative': assessment['negative'], 'class': cls, 'status': st, 'searches': len(searches),
                 'zero': sum(1 for s in searches if not s['chunks']), 'added': sorted(assessment['added']), 'quotes': quotes,
                 'cost': sum(result.get('total_cost_usd') or 0 for result in attempts), 'neg_reclassified': assessment['neg_reclassified'], 'pending_pages': sorted(assessment['pending'])})
pending_pages = sum(len(r['pending_pages']) for r in rows)
pending_quotes = sum(x['label'] is None for r in rows for x in r['quotes'])
pending_answers = sum(r['class'] in ('未実行', '再実行待ち') for r in rows)
if pending_answers or pending_pages or pending_quotes:
    message = f'測定未完了: 回答 {pending_answers} 件、頁判定 {pending_pages} 件、引用判定 {pending_quotes} 件。完了するか --partial で暫定値を出してください。'
    if not args.partial:
        ap.exit(2, message + '\n')
    print('暫定値（合否の判断には使わない）:', message)
json.dump(rows, open(f'{W}/score2.json', 'w'), ensure_ascii=False)

group = lambda r: ('S5 正解なし' if r['set'] == 'S5' and r['negative'] else r['set'])
g = defaultdict(list)
for r in rows:
    if r['class'] != '採点対象外':
        g[group(r)].append(r)
print(f"{'set':16s} {'n':>4s} {'正答':>6s} {'取違':>5s} {'該当なし':>6s} {'曖昧':>4s} {'部分':>4s} {'無回答':>4s} {'未完了':>4s} {'判定待ち':>5s} {'検索回数 中央/平均':>14s} {'足した頁':>6s}")
for k in sorted(g):
    v, c = g[k], Counter(r['class'] for r in g[k])
    n = len(v)
    print(f"{k:16s} {n:4d} {c['正答'] / n:6.0%} {c['取り違え'] / n:5.0%} {c['該当なし'] / n:6.0%} {c['曖昧']:4d} {c['部分']:4d} {c['回答なし']:4d} {c['未実行'] + c['再実行待ち']:4d} {c['判定待ち']:5d}"
          f" {statistics.median(r['searches'] for r in v):6.1f}/{statistics.mean(r['searches'] for r in v):4.2f}       {sum(len(r['added']) for r in v):3d}")
pos = [r for r in rows if r['set'] in ('S1', 'S2', 'S3', 'S4a', 'S4b')]
print('取り違え（S1〜S4 の合計）', sum(r['class'] == '取り違え' for r in pos), '/', len(pos))
neg = [r for r in rows if r['negative'] and r['set'] != 'S5-undetermined']
print('負例（S6 と S5 の正解なし）: not_found', sum(r['class'] == '正答' for r in neg), '/', len(neg),
      ' found（取り違え）', sum(r['class'] == '取り違え' for r in neg), ' 負例から外した', sum(r['neg_reclassified'] for r in rows))
qt = [x for r in rows for x in r['quotes']]
print('引用の項目', len(qt), ' 写しの一致', sum(1 for x in qt if x['verbatim']), ' 分類', Counter(x['label'] for x in qt))
print('引用の判定待ち', pending_quotes)
print('引用の取り違え', sum(1 for x in qt if x['label'] in MISATTR), '/', len(qt) - pending_quotes, '（判定済み項目）')
print('会話の費用 合計 $', round(sum(r['cost'] or 0 for r in rows), 2), ' 検索の合計', sum(r['searches'] for r in rows),
      ' 候補0件の検索', sum(r['zero'] for r in rows))
