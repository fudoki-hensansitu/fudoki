"""Read-only slice checks, including an optional independent COFOG reference CSV."""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
from pathlib import Path

import duckdb

EXPECTED = {'131041': (141, 187801267640), '131156': (102, 260972903444), '132021': (102, 93876812014)}


def check(warehouse: Path, reference: Path | None = None) -> dict:
    with duckdb.connect(str(warehouse), read_only=True) as con:
        actual = {j: (n, amount) for j, n, amount in con.execute(
            "select jurisdiction_code,count(*),sum(amount_yen) from settlement_expenditure_moku where fiscal_year=2025 and account_name='一般会計' group by 1").fetchall()}
        if actual != EXPECTED:
            raise ValueError(f'Slice expectations differ: {actual}')
        keys = ['jurisdiction_code', 'kan_code', 'kou_code', 'moku_code']
        records = con.execute('select m.jurisdiction_code,m.kan_code,m.kou_code,m.moku_code,m.name,m.amount_yen,c.rule_id,m.cofog_status,m.cofog_code from settlement_expenditure_moku m join int_fiscal__settlement_expenditure_cofog c using(node_id)').fetchall()
        output = {'mokus': sum(n for n, _ in actual.values()), 'total_yen': sum(a for _, a in actual.values()), 'jurisdictions': actual}
        if reference:
            with reference.open() as stream:
                expected = {tuple(r[k] for k in keys): r for r in csv.DictReader(stream)}
            if len(expected) != len(records):
                raise ValueError('COFOG reference and warehouse counts differ')
            differences = []
            for *identity, name, amount, rule, status, code in records:
                r = expected[tuple(identity)]
                if (amount, rule, status, code or '') != (int(r['amount_yen']), r['rule_id'], r['status'], r['cofog_code']):
                    differences.append({'key': identity, 'name': name, 'actual': [amount, rule, status, code], 'expected': r})
            if differences:
                raise ValueError(f'COFOG reference differs: {differences}')
            output['cofog_reference_matches'] = len(records)
        output['leaf_totals'] = con.execute("select jurisdiction_code,axis,count(*),sum(amount_yen) from settlement_expenditure_node where is_leaf group by 1,2 order by 1,2").fetchall()
        ids = con.execute('select node_id,parent_node_id from settlement_expenditure_node order by node_id').fetchall()
        output['node_count'] = len(ids)
        output['node_id_digest'] = hashlib.sha256(json.dumps(ids).encode()).hexdigest()
        return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--warehouse', type=Path, default=Path(__file__).resolve().parents[2] / '.build/warehouse.duckdb')
    parser.add_argument('--cofog-reference', type=Path)
    args = parser.parse_args()
    print(json.dumps(check(args.warehouse, args.cofog_reference), ensure_ascii=False))


if __name__ == '__main__':
    main()
