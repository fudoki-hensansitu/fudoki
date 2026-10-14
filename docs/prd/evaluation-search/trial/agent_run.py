"""AI の利用手順を全問に当てる。問いごとに新しい Claude Code の会話（headless、Sonnet）を起こし、agent_tool.py だけを使わせる。

使い方: python3 agent_run.py <作業dir> [--model sonnet] [--parallel 3] [--only <qid,...>]
  <作業dir>/trial/questions2.json の問いを読み、<作業dir>/agent/ に questions.json（団体だけ）・chunk_index.json・
  <qid>.jsonl（検索と回答）・<qid>.run.json（会話の結果）を書く。回答済みの問いは飛ばすので、途中から再開できる。
AI の会話は空の作業dir（<作業dir>/agent/cwd）で起こし、正解の入ったファイルは渡さない。ネットワークを使うので sandbox の外で回す。
"""
import argparse, json, os, shutil, subprocess, sys, threading, time
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from common import MAX_RESULTS, attempt_results, chunk_index, usage_limited  # noqa: E402

NAMES = {'131172': '東京都北区', '131148': '東京都中野区'}
ap = argparse.ArgumentParser()
ap.add_argument('work'); ap.add_argument('--model', default='sonnet'); ap.add_argument('--parallel', type=int, default=3)
ap.add_argument('--only')
a = ap.parse_args()
if a.parallel < 1:
    ap.error('--parallel は1以上')
a.work = os.path.abspath(a.work)
AG = f'{a.work}/agent'
os.makedirs(f'{AG}/cwd', exist_ok=True)
qs = json.load(open(f'{a.work}/trial/questions2.json'))
json.dump({q['id']: {'jurisdiction': q['jurisdiction']} for q in qs}, open(f'{AG}/questions.json', 'w'))
if not os.path.exists(f'{AG}/chunk_index.json'):
    json.dump(chunk_index(), open(f'{AG}/chunk_index.json', 'w'))
tool = f'{HERE}/agent_tool.py'
template = open(f'{HERE}/agent_prompt.md').read()
only = set(a.only.split(',')) if a.only else None
limited = threading.Event()


def archive(qid):
    """再実行前の回答・費用と検索を残す。利用上限の失敗は回答なしの試行に数えない。"""
    previous = f'{AG}/{qid}.run.json'
    if not any(os.path.exists(f'{AG}/{qid}.{suffix}') for suffix in ('run.json', 'jsonl', 'pending.json')):
        return
    dest = f'{AG}/attempts/{qid}'
    os.makedirs(dest, exist_ok=True)
    stem = f'{dest}/{time.time_ns()}'
    if os.path.exists(previous):
        shutil.move(previous, f'{stem}.run.json')
    for suffix in ('jsonl', 'pending.json'):
        path = f'{AG}/{qid}.{suffix}'
        if os.path.exists(path):
            shutil.move(path, f'{stem}.{suffix}')


def failures(qid):
    return sum(not usage_limited(result) for result in attempt_results(a.work, qid))


def answered(qid):
    p = f'{AG}/{qid}.jsonl'
    return os.path.exists(p) and any(json.loads(l)['kind'] == 'answer' for l in open(p))


def run(q):
    if limited.is_set() or answered(q['id']) or (only and q['id'] not in only):
        return None
    system = template.format(jurisdiction_name=NAMES[q['jurisdiction']], jurisdiction=q['jurisdiction'], tool=tool,
                             max_results=MAX_RESULTS)
    cmd = ['claude', '-p', '--model', a.model, '--system-prompt', system, '--tools', 'Bash',
           '--allowedTools', f'Bash(python3 {tool} search:*)', f'Bash(python3 {tool} more:*)', f'Bash(python3 {tool} answer:*)',
           '--setting-sources', '', '--strict-mcp-config', '--no-session-persistence', '--output-format', 'json',
           q['ask']]
    env = dict(os.environ, AGENT_WORK=a.work, AGENT_QID=q['id'])
    while failures(q['id']) < 2 and not limited.is_set():
        archive(q['id'])
        try:
            r = subprocess.run(cmd, cwd=f'{AG}/cwd', env=env, capture_output=True, text=True, timeout=1800)
            try:
                res = json.loads(r.stdout)
            except json.JSONDecodeError:
                res = {'error': r.stdout[-2000:] + r.stderr[-2000:]}
        except subprocess.TimeoutExpired:
            res = {'error': '会話が1800秒以内に終わらなかった'}
        json.dump(res, open(f'{AG}/{q["id"]}.run.json', 'w'), ensure_ascii=False)
        ok = answered(q['id'])
        if usage_limited(res):
            limited.set()
            print(q['id'], 'USAGE LIMIT: 未実行の問いを止める。解除後に同じコマンドで再開する', flush=True)
            return None
        print(q['id'], 'answered' if ok else 'NO ANSWER', res.get('num_turns'), res.get('total_cost_usd'), flush=True)
        if ok:
            return True
    return False if not limited.is_set() else None


with ThreadPoolExecutor(a.parallel) as ex:
    done = [x for x in ex.map(run, qs) if x is not None]
print('ran', len(done), 'answered', sum(done), 'total answered', sum(answered(q['id']) for q in qs), '/', len(qs))
if limited.is_set():
    sys.exit(2)
