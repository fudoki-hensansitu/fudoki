"""One iteration's regression check: the representative saved tables and the trial jurisdictions.

usage (from pipeline/): uv run python ../docs/prd/generic-node-builder/trial/loop.py <label> [--against <label>]
- Representative tables (REPRESENTATIVE) are measured against the saved tables with all-tables/run.py,
  reusing the observation caches of a full run (../.agent/all-tables/results-base/*.observed.json).
- Trial jurisdictions (cities.json; PDFs under .cache/generic-trial/<code>/) are built with trial.py.
Results go to ../.agent/loop/<label>/; with --against, per-table changes are printed.
"""
import json
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
REPRESENTATIVE = {('131041', 'general-expenditure-detail'), ('132021', 'general-expenditure-details'),
                  ('132021', 'general-expenditure-notes'), ('131172', 'general-setsu'), ('131148', 'general-setsu'),
                  ('132128', 'late-elderly-medical-setsu'), ('132217', 'late-elderly-medical-setsu'),
                  ('132071', 'akishima-enterprise-expenditure-revenue-detail')}
KEYS = ('subject_nodes', 'moku_amounts', 'detail_nodes_expected_axes', 'detail_amounts_expected_axes')


def summary(directory: Path) -> dict:
    rows = {}
    for path in sorted((directory / 'saved').glob('*.json')):
        if path.name.endswith('.observed.json'):
            continue
        r = json.loads(path.read_text())
        m = r.get('metrics', {})
        rows[f"{r['jurisdiction']}/{r['table_id']}"] = {
            **{k: (m[k]['matched'], m[k]['expected'], m[k]['generated']) for k in KEYS if m.get(k) and m[k].get('expected')},
            'tree': (r.get('tree_check') or {}).get('counts'), 'error': bool(r.get('error'))}
    for path in sorted((directory / 'trials').glob('*.json')):
        r = json.loads(path.read_text())
        u = r['units_check']
        rows[f"trial/{path.stem}"] = {'levels': r['subject_levels'], 'tree': r['tree_by_axis'],
                                      'total': (u.get('sum_matches'), u.get('kan_sum'), u.get('printed_total'))}
    return rows


def main() -> None:
    label = sys.argv[1]
    against = sys.argv[sys.argv.index('--against') + 1] if '--against' in sys.argv else None
    out = ROOT / '.agent/loop' / label
    saved, trials = out / 'saved', out / 'trials'
    if out.exists():
        shutil.rmtree(out)
    saved.mkdir(parents=True)
    trials.mkdir(parents=True)
    targets = [t for t in json.loads((ROOT / '.agent/all-tables/targets.json').read_text())
               if (t['jurisdiction'], t['table_id']) in REPRESENTATIVE]
    (out / 'targets.json').write_text(json.dumps(targets, ensure_ascii=False))
    for cache in (ROOT / '.agent/all-tables/results-base').glob('*.observed.json'):
        shutil.copy(cache, saved / cache.name)
    subprocess.run(['uv', 'run', 'python', str(HERE.parent / 'all-tables/run.py'), str(out / 'targets.json'), str(saved), '0', '1'],
                   check=True, capture_output=True)
    for city in json.loads((HERE / 'cities.json').read_text()):
        name = f"{label}-{city['code']}"
        cache = Path('.cache/generic-trial') / name
        cache.mkdir(parents=True, exist_ok=True)
        first = Path('.cache/generic-trial') / city['code'] / 'general-observed.json'
        if first.exists():
            shutil.copy(first, cache / 'general-observed.json')
        subprocess.run(['uv', 'run', 'python', str(HERE / 'trial.py'), name, f".cache/generic-trial/{city['pdf']}", city['pages']],
                       check=True, capture_output=True)
        report = json.loads((cache / 'general-trial.json').read_text())
        if not first.exists():
            shutil.copy(cache / 'general-observed.json', first)
        (trials / f"{city['code']}.json").write_text(json.dumps(
            {k: report[k] for k in ('subject_levels', 'tree_by_axis', 'units_check', 'axes', 'unowned')}, ensure_ascii=False))
    now = summary(out)
    (out / 'summary.json').write_text(json.dumps(now, ensure_ascii=False, indent=1))
    before = summary(ROOT / '.agent/loop' / against) if against else {}
    for key, row in now.items():
        changed = {k: (before.get(key, {}).get(k), v) for k, v in row.items() if before and before.get(key, {}).get(k) != v}
        print(key, json.dumps(row, ensure_ascii=False) if not before else ('同じ' if not changed else json.dumps(changed, ensure_ascii=False)))


if __name__ == '__main__':
    main()
