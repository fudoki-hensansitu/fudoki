"""Registry allowlists and subject completion across account conversions."""
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from ingestion.fiscal import manifest, run
from ingestion.lib.node_tables import read_rows, NodeTables
from ingestion.lib.coverage_checks import check_digit_coverage

CONVERTER = '''
from pathlib import Path
from ingestion.lib.parquet import write_parquet, ParquetColumn

def convert(inputs, destination, options):
    (destination / 'shared-observations').mkdir()
    path = destination / (options['id'] + '.parquet')
    write_parquet(path, options['rows'], columns=[ParquetColumn(c, 'VARCHAR') for c in options['columns']])
    return {options['id']: {'path': path, 'metadata': options['metadata']},
            'unused-supplement': {'path': '/outside/unused.parquet'}}
'''


class ConversionSelectionTests(unittest.TestCase):
    def test_unmanaged_supplements_are_ignored_and_split_conversions_share_only_same_account(self):
        with TemporaryDirectory() as folder:
            root = Path(folder)
            converter = root / 'convert.py'
            converter.write_text(CONVERTER)
            original = root / 'origin.pdf'
            original.write_bytes(b'fixed original')
            sha = manifest.sha_file(original)
            columns = ['款_番号', '款_名称', '款_支出済額', '款_当初予算額',
                       '目_番号', '目_名称', '目_支出済額', '目_当初予算額']
            metadata = {'column_contexts': [
                {'columns': columns[:4], 'header_path': ['科目', '款'], 'grain_columns': ['款_番号']},
                {'columns': columns[4:], 'header_path': ['科目', '目'], 'grain_columns': ['目_番号']}],
                'units': [{'text': '円', 'scope': {'kind': 'columns', 'columns': [columns[i] for i in (2,3,6,7)]}}]}
            base = dict(zip(columns, ['1', '親', '10', '12', '1', '明細', '10', '10']))
            zero = {**base, '目_番号': '2', '目_名称': '印字ゼロ', '目_支出済額': '0', '目_当初予算額': '2'}
            foreign = {**base, '款_名称': '別会計', '目_名称': '別明細'}
            conversions = [
                {'id': ident, 'converter': 'fiscal/layouts/csv/convert.py', 'inputs': [{'sha256': sha}],
                 'options': {'id': ident, 'account': account, 'columns': columns, 'rows': rows, 'metadata': metadata},
                 'expected_tables': [{'table_id': ident}]}
                for ident, account, rows in [('notes','一般会計',[base]), ('details','一般会計',[base,zero]),
                                             ('foreign','特別会計',[foreign, {**zero,'款_名称':'別会計'}])]]
            document = {'schema_version':1,'target':{'jurisdiction':'131041','fiscal_year':2025,'document_kind':'settlement'},
                        'direction':'expenditure','conversions':conversions,'tables':[]}
            validate = manifest.validate
            with patch.object(manifest, 'read', return_value=document), \
                 patch.object(manifest, 'selection_for', return_value={}), \
                 patch.object(manifest, 'resolved_inputs', return_value=[{'sha256':sha,'format':'pdf','scope':[
                     {'account':'一般会計'}, {'account':'特別会計'}]}]), \
                 patch.object(manifest, 'code_path', return_value=converter), \
                 patch.object(manifest, 'fingerprints', return_value={c['id']:'a'*64 for c in conversions}), \
                 patch.object(manifest, 'validate', side_effect=lambda d:validate(d,check_code=False)):
                run.convert(root/'manifest.json', {sha:str(original)}, root/'candidate')
                conversions[0]['expected_tables'] = [{'table_id':'missing'}]
                with self.assertRaisesRegex(ValueError, 'all its declared tables'):
                    run.convert(root/'manifest.json', {sha:str(original)}, root/'missing-candidate')
            candidate = json.loads((root/'candidate/manifest.json').read_text())
            self.assertEqual({t['table_id'] for t in candidate['tables']}, {'notes','details','foreign'})
            nodes = read_rows(root/'candidate/notes-nodes.parquet')
            self.assertEqual([n['name_text'] for n in nodes], ['親','明細','印字ゼロ'])
            self.assertFalse((root/'candidate/unused-supplement-nodes.parquet').exists())

    def test_original_identity_bounds_coverage_across_separate_conversions(self):
        def table(value):
            return NodeTables([], [{'node_key': 'a', 'physical_page': 1, 'x0': 10., 'y0': 10.,
                                    'x1': 30., 'y1': 19., 'amount_text': value}])
        document = {'conversions': [
            {'inputs': [{'sha256': origin}], 'expected_tables': [{'table_id': ident}]}
            for ident, origin in [('details', 'original-a'), ('notes', 'original-a'),
                                  ('other', 'original-b')]]}
        peers = run.coverage_peers(document, {'details': NodeTables([], []),
                                            'notes': table('10'), 'other': table('20')})
        words = [(1, (10., 10., 30., 19.), '10')]
        self.assertTrue(check_digit_coverage(words, peers['details'])['passed'])
        self.assertEqual([a['amount_text'] for a in peers['details'].amounts], ['10'])
        self.assertEqual([a['amount_text'] for a in peers['other'].amounts], ['20'])
        peers = run.coverage_peers(document, {'details': NodeTables([], []), 'other': table('20')})
        result = check_digit_coverage(words, peers['details'],
                                     amount_columns=[{'header': '金額', 'x_range': [10, 30]}])
        self.assertFalse(result['passed'])


if __name__ == '__main__':
    unittest.main()
