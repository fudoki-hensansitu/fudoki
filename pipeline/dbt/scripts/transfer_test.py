"""Exercise the real transfer model with printed recipient splits and ambiguous names."""
import unittest
from pathlib import Path

import duckdb
from jinja2 import Environment, StrictUndefined

from staging import normalize_text

DBT = Path(__file__).resolve().parents[1]


class TransferTest(unittest.TestCase):
    def test_recipient_split_beats_a_combined_section_but_an_ambiguous_remark_does_not(self):
        with duckdb.connect() as con:
            con.create_function('staging_text', normalize_text)
            con.execute('''create table int_fiscal__settlement_expenditure_nodes (
                node_id varchar, parent_node_id varchar, jurisdiction_code varchar,
                fiscal_year integer, document_kind varchar, account_name varchar,
                axis varchar, is_subject boolean, node_kind varchar, code varchar, name varchar,
                amount_yen bigint)''')
            rows = [
                ('m', None, '科目', True, '目', '医療費', 8485855706),
                ('s', 'm', '節', False, '内訳1', '繰出金', 8485855706),
                ('n', 'm', '備考', False, '内訳1', '国民健康保険特別会計繰出金', 4913384649),
                ('l', 'm', '備考', False, '内訳1', '後期高齢者医療特別会計繰出金', 3572471057),
                ('a', None, '科目', True, '目', '財政管理費', 100),
                ('as', 'a', '節', False, '内訳1', '繰出金', 100),
                ('ar', 'a', '備考', False, '内訳1', '特別会計繰出金', 100),
                ('b', None, '科目', True, '目', '国民健康保険事業費', 200),
                ('bs', 'b', '節', False, '内訳1', '繰出金', 200),
                ('c', None, '科目', True, '目', '諸支出金', 100),
                ('cs', 'c', '節', False, '内訳1', '繰出金', 100),
                ('cr', 'c', '備考', False, '内訳1', '介護保険特別会計繰出金', 60),
                ('cu', 'c', '備考', False, '内訳1', 'その他特別会計繰出金', 40),
                ('d', None, '科目', True, '目', '介護保険会計繰出金', 1000),
                ('dr', 'd', '備考', False, '内訳1', 'その他介護保険会計繰出金', 25),
                ('e', None, '科目', True, '目', '福祉総務費', 1000),
                ('es', 'e', '節', False, '内訳1', '繰出金', 1000),
                ('er', 'e', '備考', False, '内訳1', '介護保険会計繰出金', 25),
            ]
            con.executemany('insert into int_fiscal__settlement_expenditure_nodes values (?,?,?,?,?,?,?,?,?,?,?,?)',
                            [(key, parent, 'fixture', 2025, 'settlement', '一般会計', axis, subject, kind, None, name, amount)
                             for key, parent, axis, subject, kind, name, amount in rows])
            con.execute('create table int_fiscal__csv_expenditure_nodes as select * from int_fiscal__settlement_expenditure_nodes where false')
            con.execute("create table int_fiscal__expenditure_accounts as select distinct jurisdiction_code, fiscal_year, account_name, '一般会計' as account_kind from int_fiscal__settlement_expenditure_nodes")
            con.execute('create table account_kind_map as select * from read_csv(?, all_varchar=true)',
                        [str(DBT / 'seeds/fiscal/account_kind_map.csv')])
            source = '\n'.join((DBT / f'macros/{name}.sql').read_text() for name in ('trim_cell', 'fiscal_normalize'))
            source += '\n' + (DBT / 'models/intermediate/fiscal/int_fiscal__expenditure_transfers.sql').read_text()
            sql = Environment(undefined=StrictUndefined).from_string(source).render(ref=lambda name: name)
            con.execute('create table transfers as ' + sql)
            marked = con.execute('select node_id,interfund_transfer_to from transfers where is_interfund_transfer order by node_id').fetchall()
            self.assertEqual(marked, [('as', None), ('bs', '国民健康保険'), ('cs', None), ('d', '介護保険'), ('es', None), ('l', '後期高齢者医療'), ('n', '国民健康保険')])
            self.assertEqual(con.execute("select sum(n.amount_yen) from transfers t join int_fiscal__settlement_expenditure_nodes n using(node_id) where t.is_interfund_transfer and n.parent_node_id='m'").fetchone()[0], 8485855706)


if __name__ == '__main__':
    unittest.main()
