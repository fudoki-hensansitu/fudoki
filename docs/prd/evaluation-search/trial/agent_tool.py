"""AI の利用手順で AI に渡す道具。検索と回答だけを持ち、正解は読まない。

  python3 agent_tool.py search "<検索語>"   上位10件の chunk の全文を（原典・頁）ごとに出す。1問あたり MAX_SEARCHES 回まで
  python3 agent_tool.py answer '<JSON>'      最終の回答を1回だけ記録する

問いと作業dirは環境変数で受ける（AGENT_WORK: 作業dir、AGENT_QID: 問いの id）。
<作業dir>/agent/questions.json（団体だけを持つ）と chunk_index.json を読み、<作業dir>/agent/<qid>.jsonl に検索と回答を書く。
"""
import json, os, sys, time
from common import search, split_pages

MAX_SEARCHES = 3
FIELDS = ('目標', '実績', '評価区分', '課題', '方向性')
WORK, QID = os.environ['AGENT_WORK'], os.environ['AGENT_QID']
LOG = f'{WORK}/agent/{QID}.jsonl'


def log_rows():
    return [json.loads(l) for l in open(LOG)] if os.path.exists(LOG) else []


def write(row):
    with open(LOG, 'a') as f:
        f.write(json.dumps(row, ensure_ascii=False) + '\n')


def do_search(query):
    rows = log_rows()
    if any(r['kind'] == 'answer' for r in rows):
        sys.exit('回答済みです。これ以上は何もしないでください。')
    n = sum(1 for r in rows if r['kind'] == 'search')
    if n >= MAX_SEARCHES:
        sys.exit(f'検索は{MAX_SEARCHES}回までです。answer で回答してください。')
    if len(query.strip()) == 0:
        sys.exit('検索語が空です。')
    q = json.load(open(f'{WORK}/agent/questions.json'))[QID]
    idx = json.load(open(f'{WORK}/agent/chunk_index.json'))
    seen = {c for r in rows if r['kind'] == 'search' for c in r['chunks']}
    meta = {}
    chunks = search(query, q['jurisdiction'], meta=meta)
    shown_pages = []
    print(f'検索 {n + 1}/{MAX_SEARCHES}: 「{query}」 候補 {len(chunks)} 件（chunk）')
    if not chunks:
        print('候補は0件でした。0件は資料に無いことを意味しません（語の一致と意味の近さのどちらにも当たらなかっただけ）。')
    for i, c in enumerate(chunks, 1):
        info = idx[c['id']]
        if c['id'] in seen:
            print(f'\n=== 候補 {i}: 既出の chunk（{info["doc"]}、頁 {", ".join(info["pages"])}）。本文は前の検索の結果を見てください。')
            shown_pages += info['pages']
            continue
        print(f'\n=== 候補 {i}: 資料「{info["doc"]}」')
        for p, text in split_pages(c['text']):
            pid = info['lead'] if p is None else f'{info["pages"][0].split(":")[0]}:{p + _offset(c)}'
            if pid is None:
                continue
            shown_pages.append(pid)
            print(f'--- [頁 {pid}]')
            print(text.strip())
    write({'kind': 'search', 'n': n + 1, 'query': query, 'chunks': [c['id'] for c in chunks], 'pages': sorted(set(shown_pages)),
           'meta': meta, 'ts': time.time()})


def _offset(chunk):
    return int(chunk['item']['metadata'].get('page_offset', 0))


def do_answer(raw):
    rows = log_rows()
    if any(r['kind'] == 'answer' for r in rows):
        sys.exit('回答済みです。')
    try:
        a = json.loads(raw)
    except json.JSONDecodeError as e:
        sys.exit(f'JSON として読めません: {e}')
    shown = {p for r in rows if r['kind'] == 'search' for p in r['pages']}
    errs = []
    if a.get('status') not in ('found', 'not_found', 'ambiguous'):
        errs.append('status は found・not_found・ambiguous のどれか')
    for p in a.get('pages', []):
        if p not in shown:
            errs.append(f'頁 {p} はこの問いの検索の候補に出ていません')
    for pr in a.get('projects', []):
        for k, v in (pr.get('fields') or {}).items():
            if k not in FIELDS:
                errs.append(f'fields の項目は {FIELDS} だけ（{k}）')
            elif v is not None and v.get('page') not in shown:
                errs.append(f'{k} の頁 {v.get("page")} はこの問いの検索の候補に出ていません')
    if a.get('status') == 'found' and not a.get('pages'):
        errs.append('found のときは pages が要ります')
    if errs:
        sys.exit('回答の形が違います（まだ記録していません）: ' + ' / '.join(errs))
    write({'kind': 'answer', 'answer': a, 'ts': time.time()})
    print('回答を記録しました。これで終わりです。')


if __name__ == '__main__':
    cmd, arg = sys.argv[1], ' '.join(sys.argv[2:])
    {'search': do_search, 'answer': do_answer}[cmd](arg)
