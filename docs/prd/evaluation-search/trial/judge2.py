"""第2段の判定。AI の回答を、原典の頁の文字（pdftotext -layout）を見る別の会話（headless の Claude Code、Sonnet、道具なし）に判定させる。

  python3 judge2.py pages <作業dir>    found で T の外の頁を選んだ回答について「その頁に目的の事業の評価が載るか」
  python3 judge2.py quotes <作業dir>   正答した回答の引用の各項目の帰属（正しい・別の事業の行・別の年度・列・別の項目・原典に無い・判断できない）

<作業dir>/pdf/<sha12>.pdf に原典を置く。<作業dir>/trial/questions2.json と <作業dir>/agent/<qid>.jsonl を読み、
<作業dir>/judge/{pages,quotes}/<qid>.json に書く。判定済みは飛ばす。AI の判断の理由（note）は渡さない。
"""
import json, os, re, subprocess, sys
from concurrent.futures import ThreadPoolExecutor

MODE, W = sys.argv[1], sys.argv[2]
LABELS = ('正しい', '別の事業の行', '別の年度・列', '別の項目', '原典に無い', '判断できない')
qs = {q['id']: q for q in json.load(open(f'{W}/trial/questions2.json'))}
os.makedirs(f'{W}/judge/{MODE}', exist_ok=True)


def page_text(pid):
    sha, p = pid.split(':')
    return subprocess.run(['pdftotext', '-f', p, '-l', p, '-layout', f'{W}/pdf/{sha}.pdf', '-'],
                          capture_output=True, text=True).stdout


def answer(qid):
    p = f'{W}/agent/{qid}.jsonl'
    if not os.path.exists(p):
        return None
    rows = [json.loads(l) for l in open(p)]
    return next((r['answer'] for r in rows if r['kind'] == 'answer'), None)


def ask(prompt):
    r = subprocess.run(['claude', '-p', '--model', 'sonnet', '--tools', '', '--setting-sources', '', '--strict-mcp-config',
                        '--no-session-persistence', '--output-format', 'json', prompt], capture_output=True, text=True, timeout=900)
    text = json.loads(r.stdout)['result']
    m = re.search(r'```json\s*(.*?)```', text, re.S) or re.search(r'(\{.*\}|\[.*\])', text, re.S)
    return json.loads(m.group(1))


def target(q):
    t = q['target']
    return f'{t["jurisdiction_name"]}の令和7年度の「{t["name"]}」（{t["kind"]}' + (f'、{t["note"]}' if t.get('note') else '') + '）'


def judge_pages(qid):
    q, a = qs[qid], answer(qid)
    if not a or a.get('status') != 'found':
        return
    out = f'{W}/judge/pages/{qid}.json'
    done = json.load(open(out)) if os.path.exists(out) else {}
    for pid in a.get('pages', []):
        if pid in q['truth'] or pid in done:
            continue
        prompt = (f'次は自治体の事業の評価の資料の1頁の文字です（PDF から抜き出したもので、表の行と列の位置を空白で保っています）。\n'
                  f'目的の事業: {target(q)}\n\n'
                  f'問い: この頁に、目的の事業についての評価（目標、実績、評価の区分、課題、今後の方向のどれか）が書かれていますか。'
                  f'名前が一覧に出るだけ・金額だけは「載らない」とします。同じ名前の別の事業（別の施策・別の場所）は「載らない」とします。\n'
                  f'答えは ```json {{"contains": true|false, "evidence": "<根拠の行を短く>"}}``` の形だけで返してください。\n\n'
                  f'--- 頁 {pid} ---\n{page_text(pid)}')
        done[pid] = ask(prompt)
        json.dump(done, open(out, 'w'), ensure_ascii=False)
    print(qid, done, flush=True)


def judge_quotes(qid):
    q, a = qs[qid], answer(qid)
    out = f'{W}/judge/quotes/{qid}.json'
    if not a or a.get('status') != 'found' or os.path.exists(out):
        return
    accept = set(q['accept']) | set(q.get('accept_added', []))
    items = []
    for pr in a.get('projects', []):
        for field, v in (pr.get('fields') or {}).items():
            if v and v.get('page') in accept:
                items.append({'field': field, 'page': v['page'], 'quote': v.get('quote'), 'reading': v.get('reading')})
    if not items:
        return
    pages = sorted({i['page'] for i in items})
    prompt = (f'自治体の事業の評価の資料について、AI が目的の事業の評価を引用しました。引用が、原典の頁の正しい事業の行・評価対象年度（令和7年度・2025年度）の列・正しい項目のものかを判定してください。\n'
              f'目的の事業: {target(q)}\n'
              f'項目の意味: 目標＝評価対象年度の目標値・計画値、実績＝評価対象年度の実績、評価区分＝評価対象年度の進捗度・評価・方向性の区分、課題＝評価対象年度の課題・十分でなかった点、方向性＝今後の方針・次年度の方向性・今後の戦略。\n'
              f'分類: {"・".join(LABELS)}。「別の項目」は計画値を実績として読む、前年度欄の評価を今年度として読むなど。原典の文字は表の行と列の位置を空白で保っています（AI が見た文字は行と列が崩れたもので、AI の quote はそちらの写しです）。\n'
              f'答えは ```json [{{"i": <番号>, "label": "<分類>", "why": "<短く>"}}, ...]``` の形だけで返してください。\n\n'
              + '\n'.join(f'[{n}] 項目 {i["field"]} / 頁 {i["page"]} / quote「{i["quote"]}」 / reading「{i["reading"]}」' for n, i in enumerate(items))
              + ''.join(f'\n\n--- 頁 {pid} ---\n{page_text(pid)}' for pid in pages))
    res = ask(prompt)
    json.dump([dict(items[r['i']], label=r['label'], why=r.get('why')) for r in res], open(out, 'w'), ensure_ascii=False)
    print(qid, [r['label'] for r in res], flush=True)


with ThreadPoolExecutor(3) as ex:
    list(ex.map({'pages': judge_pages, 'quotes': judge_quotes}[MODE], qs))
