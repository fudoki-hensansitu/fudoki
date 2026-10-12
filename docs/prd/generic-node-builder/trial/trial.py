"""Build one table of a jurisdiction the rules have not seen, and measure it without a reference table.

usage (from pipeline/): uv run python ../docs/prd/generic-node-builder/trial/trial.py <out name> <pdf> <pages> [--kind settlement]
Writes .cache/generic-trial/<out name>/general-{nodes,amounts}.parquet and general-trial.json:
the tree check per axis, the unit check (款 sum = printed 歳出合計, not raised), 款・項・目 with
their amounts, and the chosen patterns. The only per-table input is the page range.
"""
from __future__ import annotations

import argparse
from collections import Counter
import json
from pathlib import Path

from ingestion.generic import units
from ingestion.generic.build import check, choose_pattern, dictionary_header, page_list
from ingestion.generic.layout import logical_pages
from ingestion.generic.observe import observe
from ingestion.generic.repair import repair
from ingestion.lib.node_tables import AMOUNT_COLUMNS, NODE_COLUMNS, amount_phase
from ingestion.lib.parquet import write_parquet
from shared.amount import number


def subject_rows(built, kind: str) -> list[dict]:
    """款・項・目 and their printed amounts by phase (or by printed header when no phase resolves)."""
    by_node = {}
    for a in built.amounts:
        phase = amount_phase(dictionary_header(a['header_path'], kind), kind, '科目', '款')
        by_node.setdefault(a['node_key'], {})[phase or a['header_path']] = number(a['amount_text'])
    return [{'key': n['node_key'], 'parent': n['parent_node_key'], 'depth': n['depth'], 'level': n['level_header'],
             'code': n['code_text'], 'name': n['name_text'], 'page': n['physical_page'], 'amounts': by_node.get(n['node_key'], {})}
            for n in built.nodes if n['axis_header'] == '科目']


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('name')
    parser.add_argument('pdf', type=Path)
    parser.add_argument('pages')
    parser.add_argument('--kind', default='settlement')
    args = parser.parse_args()
    out = Path('.cache/generic-trial') / args.name
    out.mkdir(parents=True, exist_ok=True)
    observed, repairs = repair(args.pdf, observe(args.pdf, page_list(args.pages), out / 'general-observed.json'))
    built, choice = choose_pattern(logical_pages(observed), args.kind)
    result = check(built, args.kind)
    for kind in ('nodes', 'amounts'):
        (out / f'general-{kind}.parquet').unlink(missing_ok=True)
    write_parquet(out / 'general-nodes.parquet', built.nodes, columns=NODE_COLUMNS)
    write_parquet(out / 'general-amounts.parquet', built.amounts, columns=AMOUNT_COLUMNS)
    subjects = subject_rows(built, args.kind)
    report = {
        'name': args.name, 'pdf': str(args.pdf), 'pages': args.pages,
        'nodes': len(built.nodes), 'amounts': len(built.amounts),
        'axes': dict(Counter(n['axis_header'] for n in built.nodes)),
        'subject_levels': dict(Counter(s['level'] for s in subjects)),
        'unowned': dict(Counter(u['kind'] for u in built.unowned)),
        'tree_by_axis': {f'{axis}:{status}': count for (axis, status), count in
                         Counter((r['axis_header'], r['status']) for r in result['results']).items()},
        'tree_check': {'passed': result['passed'], 'counts': result['counts'], 'issues': len(result['issues'])},
        'units_check': units.check(built, args.kind, '一般会計'),
        'mismatches': [r for r in result['results'] if r['status'] != '一致'],
        'kan': [s for s in subjects if s['parent'] is None],
        'subjects': subjects,
        'unowned_examples': built.unowned[:50],
        'pattern': choice,
        'repairs': {k: v for k, v in repairs.as_dict().items() if k not in ('pattern', 'examples')},
    }
    (out / 'general-trial.json').write_text(json.dumps(report, ensure_ascii=False, indent=1, default=str))
    print(json.dumps({k: report[k] for k in ('nodes', 'subject_levels', 'tree_by_axis', 'units_check')},
                     ensure_ascii=False, default=str))


if __name__ == '__main__':
    main()
