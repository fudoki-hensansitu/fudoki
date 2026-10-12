"""Spot check of evenly spaced 目 against the source pages (`ingestion.generic.spot.verify`).

usage (from pipeline/): uv run python ../docs/prd/generic-node-builder/trial/spot.py <out name> <pdf> [n]
Reads .cache/generic-trial/<out name>/general-trial.json (trial.py). The printed rows come from the
observed words after the text-layer repair, the same layer the build reads; the check is on where
each number and name is printed, not on the text layer itself.
"""
import json
import sys
from pathlib import Path

from ingestion.generic.observe import observe
from ingestion.generic.repair import repair
from ingestion.generic.layout import same_rows
from ingestion.generic.spot import rows, stage_columns, verify


def main() -> None:
    name, pdf = sys.argv[1], Path(sys.argv[2])
    n = int(sys.argv[3]) if len(sys.argv) > 3 else 10
    report = json.loads((Path('.cache/generic-trial') / name / 'general-trial.json').read_text())
    subjects = {s['key']: s for s in report['subjects']}
    moku = [s for s in report['subjects'] if s['level'] == '目']
    others = {level: [s for s in report['subjects'] if s['level'] == level] for level in ('款', '項')}
    chosen = moku[::max(1, len(moku) // n)][:n]
    first = min(s['page'] for s in report['subjects'])
    import pypdfium2 as pdfium
    document = pdfium.PdfDocument(str(pdf))
    count = len(document)
    document.close()
    last = max(max([s['page']] + [p[0] for p in (s.get('positions') or {}).values()]) for s in chosen)
    numbers = list(range(first, min(count, last + 1) + 1))  # and the next page (a spread's right half)
    observed, _ = repair(pdf, observe(pdf, numbers, Path('.cache/generic-trial') / name / 'spot-observed.json'))
    pages = {p.number: rows([(w.text, w.x0, w.y0, w.x1, w.y1) for w in p.words], p.number) for p in observed}
    stages = {p.number: stage_columns(p) for p in observed}  # from the source's headers, not the build
    spreads = {(a.number, b.number) for a, b in zip(observed, observed[1:]) if b.number == a.number + 1 and same_rows(a, b)}
    passed, cache = 0, {}
    for s in chosen:
        kou = subjects.get(s['parent']) or {}
        kan = subjects.get(kou.get('parent')) or {}
        reasons = verify(s, kan, kou, pages, others, stages, cache, spreads) if kan else ['款・項の親が無い']
        passed += not reasons
        path = ' > '.join(f"{x.get('code')}{x.get('name')}" for x in (kan, kou, s))
        a = s['amounts']
        print(f"p{s['page']} {path} | 当初={a.get('approved')} 予算現額={a.get('adjusted')} 支出済額={a.get('executed')} | "
              f"{'一致' if not reasons else '・'.join(reasons)}")
    print(f'{passed}/{len(chosen)}')


if __name__ == '__main__':
    main()
