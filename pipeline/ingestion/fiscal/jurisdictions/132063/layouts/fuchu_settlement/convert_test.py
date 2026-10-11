"""Declared printed levels migrate without duplicating their repeated ancestors."""
from importlib import import_module
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from ingestion.fiscal import manifest
from ingestion.lib.node_tables import check_tree, migrate_rows, number, read_rows

reader = import_module('ingestion.fiscal.jurisdictions.132063.layouts.fuchu_settlement.convert')


class FuchuSettlementTests(unittest.TestCase):
    def test_independent_setsu_and_repeated_ancestors_reject_wrong_execution(self):
        rows = []
        for y, amount in ((4., '3'), (5., '7')):
            row = dict.fromkeys(reader.COLUMNS)
            for level, top in zip('款項目節', (1., 2., 3., y)):
                row.update({level + '_番号': '1', level + '_名称': level,
                            level + '_物理頁': 50, level + '_上端': top,
                            level + '_支出済額': amount if level == '節' else '10'})
            rows.append(row)
        metadata = {'column_contexts': reader.COLUMN_CONTEXTS,
                    'units': [{'text': '円', 'scope': {'kind': 'columns', 'columns': reader.AMOUNT_COLUMNS}}]}
        migrated = migrate_rows(rows, metadata)
        self.assertEqual((len(migrated.nodes), len(migrated.amounts)), (5, 5))
        self.assertEqual(migrated.unresolved_parent_count, 0)
        self.assertEqual(migrated.issues, [])
        self.assertEqual(check_tree(migrated.nodes, migrated.amounts)['counts'], {'一致': 3})
        moku = next(n for n in migrated.nodes if n['level_header'] == '目')
        self.assertEqual([n['parent_node_key'] for n in migrated.nodes if n['axis_header'] == '節'],
                         [moku['node_key']] * 2)
        rows[1]['節_支出済額'] = '8'
        broken = migrate_rows(rows, metadata)
        self.assertEqual(check_tree(broken.nodes, broken.amounts)['counts'], {'一致': 2, '不一致': 1})

    def test_fixed_original_all_levels_and_reserve_moku(self):
        pdf = manifest.PIPELINE / '.cache/objects/fiscal/source-selection/132063/2025/settlement-2.pdf'
        if not pdf.is_file():
            self.skipTest('Private original is not restored')
        path = manifest.PIPELINE / 'ingestion/fiscal/jurisdictions/132063/2025/settlement/expenditure.json'
        document = manifest.read(path)
        conversion = document['conversions'][0]
        source = manifest.resolved_inputs(document, conversion)[0]
        self.assertEqual(manifest.sha_file(pdf), source['sha256'])
        source.update(path=pdf, target=document['target'], direction=document['direction'])
        with TemporaryDirectory() as temporary:
            descriptor = reader.convert([source], Path(temporary), conversion['options'])['kouki-setsu']
            rows = read_rows(descriptor['path'])
            self.assertEqual(len(rows), 27)
            migrated = migrate_rows(rows, descriptor['metadata'])
        self.assertEqual((len(migrated.nodes), len(migrated.amounts)), (49, 233))
        self.assertEqual((migrated.unread_amount_count, migrated.unresolved_parent_count), (0, 0))
        self.assertEqual(migrated.issues, [])
        check = check_tree(migrated.nodes, migrated.amounts)
        self.assertTrue(check['passed'], check)
        self.assertEqual(check['counts'], {'一致': 110})
        mokus = [n for n in migrated.nodes if n['level_header'] == '目']
        kans = [n for n in migrated.nodes if n['level_header'] == '款']
        self.assertEqual((len(mokus), len(kans)), (9, 6))
        values = {a['node_key']: number(a['amount_text']) for a in migrated.amounts
                  if a['header_path'] == '支出済額'}
        for nodes in (mokus, kans):
            self.assertEqual(sum(values[n['node_key']] for n in nodes), 7163179323)
        reserve = next(n for n in mokus if n['name_text'] == '予備費')
        self.assertEqual(values[reserve['node_key']], 0)
        self.assertFalse(any(n['parent_node_key'] == reserve['node_key'] for n in migrated.nodes))
        self.assertTrue(all(n['physical_page'] in (50, 52, 54) and
                            all(n[c] is not None for c in ('x0', 'y0', 'x1', 'y1')) for n in migrated.nodes))
