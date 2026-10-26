"""Chuo's additive expenditure tree, independent of counts and rate scalars."""
from importlib import import_module
import unittest

from ingestion.lib.node_tables import migrate_rows
from ingestion.lib.tree_checks import check_tree

monetary = import_module('ingestion.generic.patterns.readings.business_amounts')


def entity(prefix, name, amount, x=30, y=100):
    return {prefix + '_名称': name, prefix + '_金額': amount,
            prefix + '_原典物理頁': 1, prefix + '_原典xMin': x, prefix + '_原典yMin': y,
            prefix + '_原典xMax': x + 20, prefix + '_原典yMax': y + 10}


def migrate(rows):
    monetary.prepare(rows)
    columns = list(dict.fromkeys(k for row in rows for k in row))
    return migrate_rows(rows, monetary.metadata(columns))


class ChuoMigrationTests(unittest.TestCase):
    def test_inner_money_and_refund_share_the_additive_business_axis(self):
        parent = entity('事業', '児童手当', '100')
        rows = [{**parent, **entity('内訳1', '補助返還金', '10', y=200)},
                {**parent, **entity('内表', '給付', None, y=300), '内表_金額': '90',
                 '内表_金額_原典物理頁': 1, '内表_金額_原典xMin': 50,
                 '内表_金額_原典yMin': 300, '内表_金額_原典xMax': 80,
                 '内表_金額_原典yMax': 310, '内表_区分': '通常給付',
                 '内表_月額': '10 ～ 20', '職員_人数': '2 人'}]
        tables = migrate(rows)
        self.assertEqual(tables.issues, [])
        self.assertEqual(tables.unread_amount_count, 0)
        check = check_tree(tables.nodes, tables.amounts)
        self.assertTrue(check['passed'], check)
        self.assertEqual(check['results'][0]['child_sum'], 100)
        self.assertEqual({a['amount_text'] for a in tables.amounts}, {'100', '10', '90'})
        rows[1]['内表_金額'] = '89'
        self.assertFalse(check_tree(migrate(rows).nodes, migrate(rows).amounts)['passed'])

    def test_benefit_amount_keeps_its_printed_heading(self):
        parent = entity('事業', '給付', '90')
        row = {**parent, '内表_給付額': '90', '内表_区分': '通常給付'}
        for k, v in entity('内表', '給付', None, y=300).items():
            if k.startswith('内表_原典'):
                row[k.replace('内表_原典', '内表_給付額_原典')] = v
        tables = migrate([row])
        self.assertEqual(tables.issues, [])
        self.assertEqual(len(tables.amounts), 2)
        self.assertIn('事業説明／給付額', {a['header_path'] for a in tables.amounts})
        check = check_tree(tables.nodes, tables.amounts)
        self.assertTrue(check['passed'], check)
        self.assertEqual(check['results'][0]['child_sum'], 90)

    def test_shared_money_cell_keeps_categories_without_allocating_twice(self):
        parent = entity('事業', '給付', '90')
        amount = {'内表_金額': '90', '内表_金額_原典物理頁': 1,
                  '内表_金額_原典xMin': 50, '内表_金額_原典yMin': 300,
                  '内表_金額_原典xMax': 80, '内表_金額_原典yMax': 330}
        tables = migrate([{**parent, **amount, '内表_区分': label} for label in ('前期', '後期')])
        self.assertEqual(tables.issues, [])
        self.assertEqual(len(tables.nodes), 2)
        self.assertEqual(tables.nodes[-1]['name_text'], '前期\n後期')
        self.assertEqual(len(tables.amounts), 2)
        self.assertTrue(check_tree(tables.nodes, tables.amounts)['passed'])

    def test_spread_halves_at_the_same_height_are_distinct(self):
        parent = entity('事業', '事業', '30')
        tables = migrate([{**parent, **entity('内訳1', label, value, x=x, y=200)}
                          for label, value, x in [('左', '10', 40), ('右', '20', 686)]])
        self.assertEqual(tables.issues, [])
        self.assertEqual(len(tables.nodes), 3)
        self.assertTrue(check_tree(tables.nodes, tables.amounts)['passed'])

    def test_year_heading_and_dash_keep_current_execution_comparable(self):
        parent = entity('事業', '工事', '10')
        rows = [{**parent, '施工概要_区分': label, '施工概要_令和 3・5・6 年度': '－ 円',
                 '施工概要_令和 7 年度': value, '施工概要_平成30～令和4年度': '－ 円',
                 '原典物理頁': 1,
                 '原典xMin': 50, '原典yMin': y, '原典xMax': 300, '原典yMax': y + 10}
                for label, value, y in [('本体', '9', 300), ('付帯', '1', 320)]]
        tables = migrate(rows)
        self.assertEqual(tables.unread_amount_count, 0)
        check = check_tree(tables.nodes, tables.amounts)
        self.assertTrue(check['passed'], check)
        self.assertEqual(check['results'][0]['child_sum'], 10)
        self.assertIn('事業説明／令和 7 年度', {a['header_path'] for a in tables.amounts})


if __name__ == '__main__':
    unittest.main()
