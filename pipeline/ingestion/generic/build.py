"""Generic node builder: one PDF page range to a node table and an amount table.

Usage: uv run python -m ingestion.generic.build <pdf> <first>-<last>[,<first>-<last>] <out-dir> [--kind settlement]

The only per-table input is the page range, which the source selection already
declares. No coordinates, column names or level names are configured.
"""
from __future__ import annotations

import argparse
from collections import Counter
import json
from pathlib import Path

from ingestion.generic.layout import logical_pages, normalize
from ingestion.generic.observe import observe
from ingestion.generic.tree import Built, build
from ingestion.lib.node_tables import AMOUNT_COLUMNS, NODE_COLUMNS, amount_phase, check_tree, phase_dictionary
from ingestion.lib.parquet import write_parquet


def page_list(spec: str) -> list[int]:
    pages = []
    for part in spec.split(','):
        first, _, last = part.partition('-')
        pages += range(int(first), int(last or first) + 1)
    return pages


def dictionary_header(header: str, document_kind: str) -> str:
    """The longest suffix of a printed header path that the shared dictionary knows.

    Only for checking: the stored `header_path` keeps every printed level.
    """
    parts = header.split('／')
    known = {label for kind, label in phase_dictionary() if kind in ('', document_kind)}
    for start in range(len(parts)):
        candidate = '／'.join(parts[start:])
        if candidate in known:
            return candidate
    return header


def run(pdf: Path, pages: list[int], cache: Path | None = None, judge=None) -> Built:
    return build(logical_pages(observe(pdf, pages, cache)), judge)


def check(built: Built, document_kind: str = 'settlement') -> dict:
    amounts = [{**a, 'header_path': dictionary_header(a['header_path'], document_kind)} for a in built.amounts]
    return check_tree(built.nodes, amounts, document_kind)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('pdf', type=Path)
    parser.add_argument('pages')
    parser.add_argument('out', type=Path)
    parser.add_argument('--kind', default='settlement')
    parser.add_argument('--table', default='generic')
    parser.add_argument('--jev', action='store_true', help='variant B: Jev chooses codeless remark line roles')
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    client = None
    judge = None
    if args.jev:
        from ingestion.generic.jev import Client, line_roles
        client = Client(args.out / f'{args.table}-jev-cache.json')
        judge = lambda features: line_roles(client, features)
    built = run(args.pdf, page_list(args.pages), args.out / f'{args.table}-observed.json', judge)
    result = check(built, args.kind)
    for kind in ('nodes', 'amounts'):
        (args.out / f'{args.table}-{kind}.parquet').unlink(missing_ok=True)
    write_parquet(args.out / f'{args.table}-nodes.parquet', built.nodes, columns=NODE_COLUMNS)
    write_parquet(args.out / f'{args.table}-amounts.parquet', built.amounts, columns=AMOUNT_COLUMNS)
    report = {'nodes': len(built.nodes), 'amounts': len(built.amounts),
              'unowned': dict(Counter(u['kind'] for u in built.unowned)),
              'notes': dict(Counter(n['kind'] for n in built.notes)),
              'tree_check': {'passed': result['passed'], 'counts': result['counts'], 'issues': result['issues'][:20]},
              'mismatches': [r for r in result['results'] if r['status'] != '一致'][:50],
              'unowned_examples': built.unowned[:50]}
    if client is not None:
        report['jev'] = {'model': 'jev-1.13.0', 'requests': client.requests, 'input_tokens': client.input_tokens,
                         'cost_usd': round(client.cost, 4), 'seconds': round(client.seconds, 1)}
    (args.out / f'{args.table}-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=1, default=str))
    print(json.dumps({k: report[k] for k in ('nodes', 'amounts', 'unowned', 'notes', 'tree_check', 'jev') if k in report},
                     ensure_ascii=False))


if __name__ == '__main__':
    main()
