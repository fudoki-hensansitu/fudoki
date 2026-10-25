"""Exercise conversion with the private fixed original when restored."""
import hashlib
from ingestion.generic.reading_fixture import reader
from pathlib import Path
import tempfile
import unittest

import duckdb
from ingestion.fiscal.manifest import PIPELINE
from ingestion.fiscal.run import complete_subject_rows
from ingestion.lib.node_tables import migrate_rows, number
from ingestion.lib.tree_checks import check_tree


class EnterpriseStatementTest(unittest.TestCase):
    def test_equal_printed_names_stay_distinct_and_budget_belongs_to_section(self):
        module = reader('enterprise_expenses')
        def pos(y, x=50):
            return {'物理頁': 1, '左端': x, '上端': y, '右端': x + 40, '下端': y + 10}
        rows = []
        for section_y, value, budget, remark_y, remark_value in [
            (80, '40', '1,000', 80, '20'), (80, '40', '1,000', 95, '20'),
            (120, '60', '0', None, None),
        ]:
            rows.append({'款': '１事業費', '款_金額': '100', '項': '１営業費用', '項_金額': '100',
                         '目': '１維持費', '目_金額': '100', '節': '同名の節', '金額（円）': value,
                         '備考_予算額': budget, '備考_名称': '同名の内訳' if remark_y else None,
                         '備考_金額': remark_value,
                         '_positions': {'款': pos(20), '項': pos(40), '目': pos(60), '節': pos(section_y, 180),
                                        '備考': pos(remark_y, 350) if remark_y else None,
                                        '予算額': pos(section_y - 10, 350)}})
        migrated = migrate_rows(module.rule('migration_detail_rows')(rows), module.rule('detail_metadata')())
        checked = check_tree(migrated.nodes, migrated.amounts)
        self.assertFalse(migrated.issues)
        self.assertEqual((migrated.unread_amount_count, migrated.unresolved_parent_count), (0, 0))
        self.assertTrue(checked['passed'], checked)
        self.assertEqual(checked['counts'], {'一致': 4})
        sections = {n['node_key'] for n in migrated.nodes if n['level_header'] == '節'}
        remarks = [n for n in migrated.nodes if n['axis_header'] == '備考']
        self.assertEqual(len(sections), 2)
        self.assertEqual(len(remarks), 2)
        self.assertTrue(all(n['parent_node_key'] in sections for n in remarks))
        budgets = [a for a in migrated.amounts if a['header_path'] == '備考／予算額']
        self.assertEqual([a['amount_text'] for a in budgets], ['1,000', '0'])
        self.assertTrue(all(a['node_key'] in sections for a in budgets))

    def test_fixed_original_preserves_wrapped_names_zeros_and_budget_separation(self):
        pdf = PIPELINE / '.cache/objects/fiscal/source-selection/132071/2025/settlement.pdf'
        if not pdf.is_file():
            self.skipTest('Private original is not restored')
        sha = '7d2b4b818e99e43e95c02ef7c33c0022b93e1bab83335004924bd30894bcb280'
        self.assertEqual(hashlib.sha256(pdf.read_bytes()).hexdigest(), sha)
        convert = reader('enterprise_expenses').convert
        source = {'path': pdf, 'sha256': sha, 'format': 'pdf', 'direction': 'expenditure',
                  'target': {'jurisdiction': '132071', 'fiscal_year': 2025, 'document_kind': 'settlement'},
                  'scope': [{'account': '下水道事業会計', 'pages': [[4, 7], [24, 28], [30, 31]]}]}
        options = {'table_prefix': 'test', 'report_pages': [4, 5, 6, 7],
                   'revenue_expense_pages': [24, 25, 26, 27, 28], 'capital_expense_pages': [30, 31]}
        with tempfile.TemporaryDirectory() as temporary:
            tables = convert([source], Path(temporary), options)
            with duckdb.connect() as connection:
                def rows(table):
                    data = connection.execute('SELECT * FROM read_parquet(?)', [str(tables[table]['path'])]).fetchall()
                    return [dict(zip([c[0] for c in connection.description], r)) for r in data]
                report = rows('test-capital-report')
                self.assertEqual(report[1]['区分_項'], '第２項企業債償還金')
                revenue = rows('test-revenue-detail')
                repair = [r for r in revenue if r['科目目_名称'] == '１管渠維持費' and r['科目節_名称'] == '修繕費']
                self.assertEqual(len(repair), 1)
                self.assertEqual(repair[0]['科目節_金額（円）'], '1,125,000')
                wrapped = [r for r in revenue if r['科目目_名称'] == '１過年度損益修正損']
                self.assertEqual(wrapped[0]['科目節_名称'], '過年度損益修正損')
                self.assertEqual(wrapped[0]['科目節_金額（円）'], '0')
                wage = [r for r in revenue if r['科目目_名称'] == '１管渠維持費' and r['科目節_名称'] == '給料']
                self.assertEqual([r['備考_予算額'] for r in wage], ['17,732,000', '17,732,000'])
                self.assertEqual([r['備考_金額（円）'] for r in wage], ['10,536,300', '0'])
                self.assertTrue(all(isinstance(r['科目節_金額（円）'], str) for r in revenue))
                capital = rows('test-capital-detail')
                self.assertEqual(len(capital), 24)
                for suffix, source_rows, sibling, count, total in [
                    ('revenue-detail', revenue, capital, 11, 2191784140),
                    ('capital-detail', capital, revenue, 8, 1183207844),
                ]:
                    migrated = migrate_rows(complete_subject_rows(source_rows, [sibling]), tables['test-' + suffix]['metadata'])
                    checked = check_tree(migrated.nodes, migrated.amounts)
                    self.assertFalse(migrated.issues)
                    self.assertEqual(migrated.unread_amount_count, 0)
                    self.assertEqual(migrated.unresolved_parent_count, 0)
                    self.assertTrue(checked['passed'], checked)
                    moku = [n for n in migrated.nodes if n['level_header'] == '目']
                    roots = [n for n in migrated.nodes if n['parent_node_key'] is None]
                    self.assertEqual(len(moku), count)
                    self.assertEqual(len(roots), 1)
                    keys = {n['node_key'] for n in moku}
                    self.assertEqual(sum(number(a['amount_text']) for a in migrated.amounts if a['node_key'] in keys), total)
                    self.assertEqual(sum(number(a['amount_text']) for a in migrated.amounts if a['node_key'] == roots[0]['node_key']), total)
                    for row in [*migrated.nodes, *migrated.amounts]:
                        self.assertIsNotNone(row['physical_page'])
                        self.assertLess(row['x0'], row['x1'])
                        self.assertLess(row['y0'], row['y1'])
