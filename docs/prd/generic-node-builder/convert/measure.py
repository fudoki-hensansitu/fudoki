"""Measure the generic converter on managed manifests the way `ingestion:convert` gates them, but go on after a failure.

For every conversion of every manifest given: build the tables with `ingestion.generic.convert`, add the
注記 axis with `ingestion/lib/annotations.py` (what `run.py` does), then record the gates one by one:
the tree check by axis, the digit coverage (blocked prints, examples), the unit check (款 sum against the
printed 歳出合計) and the shape. One JSON per table is written to <out>/<jurisdiction>-<table>.json, and a summary row to stdout.

    cd pipeline
    uv run python ../docs/prd/generic-node-builder/convert/measure.py <inputs-dir> <out-dir> [--shard INDEX COUNT] [jurisdiction ...]

<inputs-dir> holds `<jurisdiction>.json` as written by `ingestion:originals` (original SHA-256 → local path).
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import json
from pathlib import Path
import sys
import tempfile
import time
import traceback

sys.path.insert(0, str(Path(__file__).resolve().parents[4] / 'pipeline'))

from ingestion.fiscal import manifest  # noqa: E402
from ingestion.generic.convert import build_table, write_files  # noqa: E402
from ingestion.lib import coverage_checks, node_tables, tree_checks  # noqa: E402
from ingestion.lib.annotations import add_annotations  # noqa: E402


def measure(job: tuple[str, str, str, str]) -> dict:
    path, conversion_id, inputs_path, out = job
    started = time.perf_counter()
    document = manifest.read(Path(path))
    conversion = next(c for c in document['conversions'] if c['id'] == conversion_id)
    kind = document['target']['document_kind']
    table_id = conversion['expected_tables'][0]['table_id']
    result = {'jurisdiction': document['target']['jurisdiction'], 'table_id': table_id, 'conversion': conversion_id}
    try:
        files = json.loads(Path(inputs_path).read_text())
        source = manifest.resolved_inputs(document, conversion)[0]
        source['path'] = Path(files[source['sha256']])
        source['target'] = document['target']
        source['direction'] = document['direction']
        table = build_table(source, conversion['options'], stop=False)
        built, report = table.built, table.report
        result['pages'] = len(table.observed)
        result['unit'] = {k: report.unit.get(k) for k in ('kan_sum', 'printed_total', 'sum_matches', 'digits_ok', 'stopped', 'total_label')}
        result['unit_sources'] = report.pattern.get('units')
        result['pattern'] = {'subject': report.pattern.get('chosen'), 'detail': report.pattern.get('detail')}
        result['repairs'] = {'broken': report.broken, 'hits': sum(report.hits.values()), 'hidden_glyphs': report.hidden_glyphs,
                             'cropped_words': report.cropped_words, 'off_page_rules': report.off_page_rules}
        result['annotation_nodes'] = sum(1 for n in table.nodes if n['axis_header'] == '注記')
        result['unresolved_notes'] = table.unresolved
        result['unowned'] = dict(Counter(u['kind'] for u in built.unowned))
        with tempfile.TemporaryDirectory() as directory:
            built_files = write_files(Path(directory), table_id, table)
            scope = json.loads(node_tables.coverage_sidecar(Path(directory) / f'{table_id}.parquet').read_text())
            nodes = node_tables.read_rows(built_files[table_id]['nodes'])
            amounts_ = node_tables.read_rows(built_files[table_id]['amounts'])
        tables = node_tables.NodeTables(nodes, amounts_)
        annotated = add_annotations(tables, scope, raw_rows=[], adopted=tables)
        result['counts'] = {'nodes': len(tables.nodes), 'amounts': len(tables.amounts),
                            'annotation_nodes': sum(1 for n in tables.nodes if n['axis_header'] == '注記'),
                            'annotation_nodes_added': len(annotated.nodes) - len(tables.nodes),
                            'subject': Counter(n['level_header'] for n in tables.nodes if n['axis_header'] == '科目'),
                            'axes': dict(Counter(n['axis_header'] for n in tables.nodes))}
        result['counts']['subject'] = dict(result['counts']['subject'])
        result['annotations'] = [
            {'kind': n['level_header'], 'label': n['name_text'], 'page': n['physical_page'], 'added': i >= len(tables.nodes)}
            for i, n in enumerate(annotated.nodes) if n['axis_header'] == '注記'][:300]
        checked = tree_checks.check_tree(annotated.nodes, annotated.amounts, kind)
        by_axis = defaultdict(lambda: {'一致': 0, '不一致': 0})
        for r in checked['results']:
            by_axis[r['axis_header']][r['status']] += 1
        result['tree'] = {'passed': checked['passed'], 'by_axis': dict(by_axis), 'issues': checked['issues'][:10]}
        by_key = {n['node_key']: n for n in annotated.nodes}
        children = defaultdict(list)
        for n in annotated.nodes:
            if n['parent_node_key'] is not None:
                children[n['parent_node_key'], n['axis_header']].append(n)
        printed = defaultdict(list)
        for a in annotated.amounts:
            printed[a['node_key']].append(f"{a['header_path'].rsplit('／', 1)[-1]}={a['amount_text']}")
        mismatches = []
        for r in checked['results']:
            if r['status'] == '一致':
                continue
            node = by_key[r['parent_node_key']]
            mismatches.append({'axis': r['axis_header'], 'header': r['header_path'], 'parent': f"{node['code_text']} {node['name_text']}",
                               'level': node['level_header'], 'page': node['physical_page'], 'parent_amount': r['parent_amount'],
                               'child_sum': r['child_sum'], 'children': r['children'], 'y': node['y0'], 'x': node['x0'],
                               'child_items': [f"{c['code_text'] or ''} {c['name_text'] or ''} {printed.get(c['node_key'], [])}"[:90]
                                               for c in children[r['parent_node_key'], r['axis_header']]][:14]})
        result['mismatches'] = mismatches[:400]
        coverage = coverage_checks.check_digit_coverage(scope['words'], annotated, control_tables=[annotated],
                                                    exclusions=scope.get('excluded_regions', ()),
                                                    amount_columns=scope.get('amount_columns', ()))
        result['coverage'] = {'passed': coverage['passed'], 'counts': coverage['counts'], 'digit_words': coverage['digit_words'],
                              'blocked': len(coverage['uncovered']), 'reported': len(coverage['reported']),
                              'bands_from': coverage['bands_from'],
                              'examples': [f"p{u['page']}@{u['bbox'][0]:.0f},{u['bbox'][1]:.0f}={u['text']!r}" for u in coverage['uncovered'][:40]],
                              'blocked_all': coverage['uncovered']}
        gate = checked['passed'] and coverage['passed'] and not result['unit']['stopped']
        result['gate'] = bool(gate)
    except Exception as error:  # a stop is a result, not a crash of the measurement
        result['error'] = f'{type(error).__name__}: {error}'
        result['trace'] = traceback.format_exc()[-1500:]
        result['gate'] = False
    result['seconds'] = round(time.perf_counter() - started, 1)
    Path(out, f"{result['jurisdiction']}-{table_id}.json").write_text(json.dumps(result, ensure_ascii=False, indent=1, default=str))
    return result


def row(r: dict) -> str:
    if 'error' in r:
        return f"{r['jurisdiction']} {r['table_id']}: ERROR {r['error'][:200]}"
    tree = r['tree']['by_axis']
    axes = ' '.join(f"{a}:{v['一致']}/{v['不一致']}" for a, v in sorted(tree.items()))
    unit = r['unit']
    cov = r['coverage']
    return (f"{r['jurisdiction']} {r['table_id']}: gate={'OK' if r['gate'] else 'NG'} nodes={r['counts']['nodes']} "
            f"amounts={r['counts']['amounts']} 注記={r['counts']['annotation_nodes']}+{r['counts']['annotation_nodes_added']} 未分類={len(r['unresolved_notes'])} "
            f"tree[{axes}] unit(sum={unit['kan_sum']} total={unit['printed_total']} ok={unit['sum_matches']}) "
            f"cov(blocked={cov['blocked']} reported={cov['reported']}) {r['seconds']}s")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('inputs', type=Path)
    parser.add_argument('out', type=Path)
    parser.add_argument('--shard', type=int, nargs=2, default=(0, 1), metavar=('INDEX', 'COUNT'),
                        help='run every COUNT-th table starting at INDEX (start COUNT processes by hand)')
    parser.add_argument('jurisdictions', nargs='*')
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    jobs = []
    for path in manifest.paths():
        document = manifest.read(path)
        j = document['target']['jurisdiction']
        if args.jurisdictions and j not in args.jurisdictions:
            continue
        if not (args.inputs / f'{j}.json').exists():
            continue
        for conversion in document['conversions']:
            if conversion['converter'] == 'fiscal/layouts/generic_text/convert.py':
                jobs.append((str(path), conversion['id'], str(args.inputs / f'{j}.json'), str(args.out)))
    index, count = args.shard
    for job in jobs[index::count]:
        print(row(measure(job)), flush=True)


if __name__ == '__main__':
    main()
