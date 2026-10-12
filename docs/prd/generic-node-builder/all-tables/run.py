"""Run variant A on stored-candidate tables and write per-table metrics.

usage (from pipeline/): uv run python ../docs/prd/generic-node-builder/all-tables/run.py <targets.json> <out dir> <worker index> <workers>
Tables sharing one (pdf, pages) reuse one build. No rules are added; Jev is not used.
"""
import json
import os
import sys
import time
import traceback
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[4] / 'pipeline'))
from ingestion.generic.build import check  # noqa: E402
from ingestion.generic.evaluate import compare, load  # noqa: E402
from ingestion.generic.layout import logical_pages  # noqa: E402
from ingestion.generic.observe import observe  # noqa: E402
from ingestion.generic.repair import repair  # noqa: E402
from ingestion.generic.tree import build  # noqa: E402
from ingestion.lib.node_tables import read_rows  # noqa: E402

targets, out, index, workers = sys.argv[1], Path(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4])
rows = [r for r in json.load(open(targets)) if not r['scan']]
groups = {}
for row in rows:
    if row['pages'] is None:  # no coverage record: the expected table's printed page span
        pages = [n['physical_page'] for n in read_rows(Path(row['expected'] + '-nodes.parquet')) if n['physical_page']]
        row['pages'] = list(range(min(pages), max(pages) + 1))
        row['pages_from'] = 'expected-span'
    else:
        row['pages_from'] = 'coverage'
    groups.setdefault((row['pdf'], tuple(row['pages']), row['document_kind']), []).append(row)
keys = sorted(groups)[index::workers]
out.mkdir(parents=True, exist_ok=True)
for pdf, pages, kind in keys:
    members = groups[(pdf, pages, kind)]
    name = f"{members[0]['jurisdiction']}-{members[0]['table_id']}"
    started = time.time()
    try:
        observed = observe(Path(pdf), list(pages), out / f'{name}.observed.json')
        if not os.environ.get('NO_REPAIR'):
            observed, repairs = repair(Path(pdf), observed)
        else:
            repairs = None
        built = build(logical_pages(observed))
        result = check(built, kind)
        error = None
    except Exception:
        built, result, error, repairs = None, None, traceback.format_exc(limit=3), None
    seconds = round(time.time() - started, 1)
    generated = (built.nodes, built.amounts) if built else ([], [])
    for row in members:
        record = {**row, 'seconds': seconds, 'error': error}
        if built is not None:
            report = compare(generated, load([row['expected']]), kind)
            record.update({
                'tree_check': {'passed': result['passed'], 'counts': result['counts'], 'issues': len(result['issues'])},
                'unowned': dict(Counter(u['kind'] for u in built.unowned)),
                'generated': {'nodes': len(built.nodes), 'amounts': len(built.amounts)},
                'metrics': {k: v for k, v in report.items() if k != 'examples'},
                'examples': report['examples'],
                'repairs': repairs.as_dict() if repairs else None,
            })
        (out / f"{row['jurisdiction']}-{row['table_id']}.json").write_text(json.dumps(record, ensure_ascii=False, indent=1, default=str))
        print(name, row['table_id'], seconds, 'error' if error else '', flush=True)
