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
                ('n', 'm', '備考', False, '内訳1', '国民健康保険特別会計繰出金【保険課】', 4913384649),
                ('l', 'm', '備考', False, '内訳1', '後期高齢者医療特別会計繰出金【保険課】', 3572471057),
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
                ('er', 'e', '備考', False, '内訳1', '介護保険会計繰出金【福祉課】', 25),
                ('f', None, '科目', True, '目', '福祉総務費', 1000),
                ('fs', 'f', '節', False, '内訳1', '繰出金', 1000),
                ('fr', 'fs', '備考', False, '内訳1', '介護保険会計繰出金【福祉課】', 25),
                ('g', None, '科目', True, '目', '医療費', 1000),
                ('gs', 'g', '節', False, '内訳1', '繰出金', 1000),
                ('gn', 'gs', '備考', False, '内訳1', '国民健康保険特別会計繰出金', 600),
                ('gl', 'gs', '備考', False, '内訳1', '後期高齢者医療特別会計繰出金', 400),
                ('h', None, '科目', True, '目', '諸支出金', 100),
                ('hs', 'h', '節', False, '内訳1', '繰出金', 100),
                ('hr', 'hs', '備考', False, '内訳1', '繰出金', 100),
                ('hd', 'hr', '備考', False, '内訳2', '一般会計繰出金', 100),
                ('i', None, '科目', True, '目', '高齢者福祉費', 100),
                ('is', 'i', '節', False, '内訳1', '繰出金【担当課】', 100),
                ('ir', 'i', '備考', False, '内訳1', '介護保険特別会計繰出金【高齢者福祉課】', 100),
                ('j', None, '科目', True, '目', '福祉費', 100),
                ('js', 'j', '節', False, '内訳1', '繰出金', 100),
                ('jr', 'j', '備考', False, '内訳1', '介護保険特別会計繰出金【担当課】', 100),
                ('ju', 'j', '備考', False, '内訳1', '介護保険特別会計繰出金【別課】', None),
                ('l2', None, '科目', True, '目', '福祉費', 100),
                ('l2s', 'l2', '節', False, '内訳1', '繰出金', 100),
                ('l2r', 'l2', '備考', False, '内訳1', '介護保険特別会計繰出金【福祉課】', 100),
                ('l2x', 'l2', '説明', False, '内訳1', '介護保険特別会計繰出金【福祉課】', 100),
                ('v', None, '科目', True, '目', '福祉費', 100),
                ('vs', 'v', '節', False, '内訳1', '繰出金', 100),
                ('vr', 'v', '備考', False, '内訳1', '介護保険特別会計繰出金', 100),
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
            self.assertEqual(marked, [('as', None), ('bs', '国民健康保険'), ('cs', None), ('d', '介護保険'), ('es', None), ('fs', None), ('gl', '後期高齢者医療'), ('gn', '国民健康保険'), ('hd', '一般会計'), ('is', '介護保険'), ('js', None), ('l', '後期高齢者医療'), ('l2s', '介護保険'), ('n', '国民健康保険'), ('vr', '介護保険')])
            self.assertEqual(con.execute("select sum(n.amount_yen) from transfers t join int_fiscal__settlement_expenditure_nodes n using(node_id) where t.is_interfund_transfer and n.parent_node_id='m'").fetchone()[0], 8485855706)


if __name__ == '__main__':
    unittest.main()
