"""目の抜き取り: 生成した款・項・目と金額を、原典の頁の文字（pdftotext -layout）の同じ行と並べる。
Usage: spot.py <code> <pdf> [n]"""
import json, re, subprocess, sys
from pathlib import Path
code, pdf = sys.argv[1], sys.argv[2]
n = int(sys.argv[3]) if len(sys.argv) > 3 else 10
r = json.loads((Path('.cache/generic-trial') / code / 'general-trial.json').read_text())
subjects = {s['key']: s for s in r['subjects']}
moku = [s for s in r['subjects'] if s['level'] == '目']
step = max(1, len(moku) // n)
fmt = lambda v: '' if v is None else (f'△{-v:,}' if v < 0 else f'{v:,}')
for s in moku[::step][:n]:
    chain, cur = [], s
    while cur:
        chain.append(f"{cur['code']}{cur['name']}"); cur = subjects.get(cur['parent'])
    a = s['amounts']
    want = [fmt(a.get(k)) for k in ('approved', 'adjusted', 'executed')]
    page = subprocess.run(['pdftotext', '-f', str(s['page']), '-l', str(s['page']), '-layout', pdf, '-'], capture_output=True, text=True).stdout
    hits = [l for l in page.splitlines() if all(w and w in l for w in want if w)]
    ok = bool(hits) and any(re.sub(r'[\s.]', '', s['name'])[:3] in re.sub(r'\s', '', l) for l in hits)
    print(f"p{s['page']} {' > '.join(reversed(chain))} | 当初={want[0]} 予算現額={want[1]} 支出済額={want[2]} | 原典の行: {'一致' if ok else ('金額のみ一致' if hits else '見つからない')}")
    for l in hits[:1]: print('    ', re.sub(r'\s{2,}', '  ', l.strip())[:200])
