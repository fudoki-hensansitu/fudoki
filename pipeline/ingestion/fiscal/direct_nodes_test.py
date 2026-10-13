"""Converters may hand over the printed tree directly; the tree check still gates it."""
import json
from pathlib import Path
import unittest
from unittest.mock import patch

from ingestion.fiscal import manifest, manifest_test, run

CONVERTER = '''
from ingestion.lib.node_tables import NodeTables


def node(key, parent, name, depth):
    return {'node_key': key, 'parent_node_key': parent, 'axis_header': '科目', 'depth': depth,
            'level_header': ('款', '項')[depth - 1], 'code_text': '1', 'name_text': name,
            'physical_page': 1, 'x0': 1.0, 'y0': 2.0, 'x1': 3.0, 'y1': 4.0}


def amount(key, text, header):
    return {'node_key': key, 'header_path': header, 'amount_text': text, 'unit_text': '円',
            'physical_page': 1, 'x0': 5.0, 'y0': 2.0, 'x1': 9.0, 'y1': 4.0}


def convert(inputs, destination, options):
    nodes = [node('k', None, '議会費', 1), node('k-1', 'k', '議会費', 2)]
    header = options.get('header', '支出済額')
    amounts = [amount('k', options.get('parent', '1,000'), header), amount('k-1', options['child'], header)]
    return {options['table_id']: {'node_tables': NodeTables(nodes, amounts), 'notes': ['原典の注記']}}
'''


class DirectNodeTest(unittest.TestCase):
    def setUp(self):
        manifest_test.ManifestWorkflowTest.setUp(self)
        self.addCleanup(manifest_test.ManifestWorkflowTest.tearDown, self)
        code = self.code / 'fiscal/layouts/nodes/convert.py'
        code.parent.mkdir(parents=True)
        code.write_text(CONVERTER)
        code.with_name('options.schema.json').write_text(json.dumps({'type': 'object'}))
        for file in self.selection['candidates'][0]['files']:
            file.update(format='pdf', pdf_type='scan')
            file['scope'][0]['pages'] = [{'start': 1, 'end': 1}]
        for receipt in self.selection['archive']['files']:
            receipt['key'] = receipt['key'].replace('.csv', '.pdf')
        self.ledger.write_text(json.dumps({'selections': [self.selection]}))
        self.document['conversions'] = [dict(self.document['conversions'][0], converter='fiscal/layouts/nodes/convert.py',
                                             options={'table_id': 'one', 'child': '1,000'})]
        manifest.write(self.path, self.document)

    def test_tree_is_saved_without_migration_note(self):
        with patch('ingestion.fiscal.run.save') as save:
            result = run.convert(self.path, self.files, self.root / 'saved', remote=True)
        self.assertEqual(result['rows'], 4)
        table = manifest.read(self.path)['tables'][0]
        self.assertEqual((table['account'], table['notes']), ('一般会計', ['原典の注記']))
        save.assert_called_once()
        self.assertEqual(set(save.call_args.args[2]), {'nodes', 'amounts'})

    def test_failed_tree_stops_before_saving(self):
        self.document['conversions'][0]['options']['child'] = '999'
        manifest.write(self.path, self.document)
        before = self.path.read_bytes()
        with patch('ingestion.fiscal.run.save') as save:
            with self.assertRaisesRegex(ValueError, 'tree check'):
                run.convert(self.path, self.files, self.root / 'rejected', remote=True)
        save.assert_not_called()
        self.assertEqual(self.path.read_bytes(), before)
        self.assertFalse(Path(self.root / 'rejected/manifest.json').exists())

    def test_a_wrong_unit_stops_a_tree_that_is_consistent(self):
        # A budget in 千円 printed with too few digits: the tree sums, the unit check does not pass.
        self.document['conversions'][0]['options'] = {'table_id': 'one', 'header': '当初予算額', 'parent': '1,000', 'child': '1,000'}
        manifest.write(self.path, self.document)
        before = self.path.read_bytes()
        with patch('ingestion.fiscal.run.save') as save:
            with self.assertRaisesRegex(ValueError, 'Unit check failed'):
                run.convert(self.path, self.files, self.root / 'wrong-unit', remote=True)
        save.assert_not_called()
        self.assertEqual(self.path.read_bytes(), before)
        self.assertFalse(Path(self.root / 'wrong-unit/manifest.json').exists())

    def test_the_unit_check_result_is_reported_for_a_passing_table(self):
        self.document['conversions'][0]['options'] = {'table_id': 'one', 'header': '当初予算額', 'parent': '500,000', 'child': '500,000'}
        manifest.write(self.path, self.document)
        with patch('ingestion.fiscal.run.save'):
            result = run.convert(self.path, self.files, self.root / 'right-unit', remote=True)
        self.assertEqual(result['units'], {'tables': {'one': 'digits'}, 'counts': {'digits': 1}})


if __name__ == '__main__':
    unittest.main()
