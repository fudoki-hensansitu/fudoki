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

from ingestion.generic.discovery import dictionary_header, closure, choose_pattern, check
from ingestion.generic.runtime import page_titles, image_rules, run_pages
from ingestion.generic.tree import Built
from ingestion.lib.node_tables import AMOUNT_COLUMNS, NODE_COLUMNS
from ingestion.lib.parquet import write_parquet


def page_list(spec: str) -> list[int]:
    pages = []
    for part in spec.split(','):
        first, _, last = part.partition('-')
        pages += range(int(first), int(last or first) + 1)
    return pages


def run(pdf: Path, pages: list[int], cache: Path | None = None, judge=None) -> Built:
    return run_with_repairs(pdf, pages, cache, judge)[0]


def run_with_repairs(pdf: Path, pages: list[int], cache: Path | None = None, judge=None,
                     document_kind: str = 'settlement', account: str | None = None):
    """Build one table; stop when the unit check fails (款 sum ≠ printed total, or a general account's digits)."""
    built, report, _, _ = run_pages(pdf, pages, cache, judge, document_kind, account)
    return built, report


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('pdf', type=Path)
    parser.add_argument('pages')
    parser.add_argument('out', type=Path)
    parser.add_argument('--kind', default='settlement')
    parser.add_argument('--table', default='generic')
    parser.add_argument('--account', help='the account name (一般会計 turns on the digit check of the unit)')
    parser.add_argument('--jev', action='store_true', help='variant B: Jev chooses codeless remark line roles')
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    client = None
    judge = None
    if args.jev:
        from ingestion.generic.jev import Client, line_roles
        client = Client(args.out / f'{args.table}-jev-cache.json')
        judge = lambda features: line_roles(client, features)
    built, repairs = run_with_repairs(args.pdf, page_list(args.pages), args.out / f'{args.table}-observed.json', judge,
                                      document_kind=args.kind, account=args.account)
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
              'unowned_examples': built.unowned[:50], 'repairs': repairs.as_dict()}
    if client is not None:
        report['jev'] = {'model': 'jev-1.13.0', 'requests': client.requests, 'input_tokens': client.input_tokens,
                         'cost_usd': round(client.cost, 4), 'seconds': round(client.seconds, 1)}
    (args.out / f'{args.table}-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=1, default=str))
    print(json.dumps({k: report[k] for k in ('nodes', 'amounts', 'unowned', 'notes', 'tree_check', 'jev') if k in report},
                     ensure_ascii=False))


if __name__ == '__main__':
    main()
