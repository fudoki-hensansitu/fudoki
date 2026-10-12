"""Spot check: 款・項・目 and three amounts of evenly spaced 目, against the printed text of the source page.

usage (from pipeline/): uv run python ../docs/prd/generic-node-builder/trial/spot.py <out name> <pdf> [n]
The 目's name and its 当初予算額・予算現額 must share a printed line on its page; the 支出済額 is looked
for on the same page or the next one (the right half of a spread). Names are compared after NFKC and removing spaces.
Lines come from the observed words after the text-layer repair (hidden duplicate glyphs removed), not pdftotext.
"""
import json
import re
import sys
import unicodedata
from functools import cache
from pathlib import Path

from ingestion.generic.observe import observe
from ingestion.generic.repair import repair

name, pdf = sys.argv[1], sys.argv[2]
n = int(sys.argv[3]) if len(sys.argv) > 3 else 10
r = json.loads((Path('.cache/generic-trial') / name / 'general-trial.json').read_text())
subjects = {s['key']: s for s in r['subjects']}
moku = [s for s in r['subjects'] if s['level'] == '目']
step = max(1, len(moku) // n)
fmt = lambda v: None if v is None else (f'△{-v:,}' if v < 0 else f'{v:,}')


@cache
def page_text(number: int) -> str:
    pages, _ = repair(Path(pdf), observe(Path(pdf), [number], Path('.cache/generic-trial') / name / f'spot-{number}.json'))
    rows: list[list] = []
    for word in sorted(pages[0].words if pages else [], key=lambda w: ((w.y0 + w.y1) / 2, w.x0)):
        if rows and abs((rows[-1][-1].y0 + rows[-1][-1].y1) / 2 - (word.y0 + word.y1) / 2) <= 2:
            rows[-1].append(word)
        else:
            rows.append([word])
    return '\n'.join(' '.join(w.text for w in sorted(row, key=lambda w: w.x0)) for row in rows)

squash = lambda s: re.sub(r'\s', '', unicodedata.normalize('NFKC', s))
for s in moku[::step][:n]:
    chain, cur = [], s
    while cur:
        chain.append(f"{cur['code']}{cur['name']}"); cur = subjects.get(cur['parent'])
    a = s['amounts']
    approved, adjusted, executed = fmt(a.get('approved')), fmt(a.get('adjusted')), fmt(a.get('executed'))
    lines = page_text(s['page']).splitlines()
    budget = [i for i, l in enumerate(lines) if approved and adjusted and approved in l and adjusted in l]
    named = any(squash(s['name'] or '')[:3] in squash(''.join(lines[max(0, i - 2):i + 3])) for i in budget)
    spent = bool(executed) and any(executed in l for p in (s['page'], s['page'] + 1) for l in page_text(p).splitlines())
    verdict = '一致' if budget and named and spent else ('名前が見つからない' if budget and spent else '金額が見つからない')
    print(f"p{s['page']} {' > '.join(reversed(chain))} | 当初={approved} 予算現額={adjusted} 支出済額={executed} | {verdict}")
