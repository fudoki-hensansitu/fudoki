"""A failed node migration may refresh only byte-identical saved wide tables."""
from copy import deepcopy
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from ingestion.fiscal import manifest, run
from ingestion.lib import node_tables
from ingestion.lib.parquet import ParquetColumn, write_parquet


class LegacyRetentionTests(unittest.TestCase):
    def test_convert_retains_unsupported_or_failed_tree_only_before_any_upload(self):
        with TemporaryDirectory() as folder:
            root = Path(folder)
            original = root / 'original.pdf'
            original.write_bytes(b'fixed original')
            sha = manifest.sha_file(original)
            stored = root / 'saved.parquet'
            write_parquet(stored, [{'name': 'saved'}], columns=[ParquetColumn('name', 'VARCHAR')])
            converter = root / 'convert.py'
            converter.write_text('''
from ingestion.lib.parquet import ParquetColumn, write_parquet
def convert(inputs, destination, options):
    file = destination / 'wide.parquet'
    write_parquet(file, [{'name': options['text']}], columns=[ParquetColumn('name', 'VARCHAR')])
    return {'wide': file}
''')
            conversion = {'id': 'one', 'converter': 'unused', 'inputs': [{'sha256': sha}],
                          'options': {'text': 'saved', 'account': '一般会計'},
                          'expected_tables': [{'table_id': 'wide'}]}
            old = {'table_id': 'wide', 'conversion_id': 'one', 'input_fingerprint': 'a'*64,
                   'object': {'key': 'wide.parquet', 'sha256': manifest.sha_file(stored),
                              'bytes': stored.stat().st_size}, 'row_count': 1}
            document = {'target': {'jurisdiction': '131041', 'fiscal_year': 2025,
                                  'document_kind': 'settlement'}, 'direction': 'expenditure',
                        'conversions': [conversion], 'tables': [old]}
            with patch.object(manifest, 'read', return_value=document), \
                 patch.object(manifest, 'selection_for', return_value={}), \
                 patch.object(manifest, 'resolved_inputs', return_value=[{'sha256': sha, 'format': 'pdf',
                     'scope': [{'account': '一般会計'}]}]), \
                 patch.object(manifest, 'code_path', return_value=converter), \
                 patch.object(manifest, 'fingerprints', return_value={'one': 'b'*64}), \
                 patch.object(manifest, 'validate'), patch.object(manifest, 'write') as register, \
                 patch.object(run, 'fetch', return_value=stored), patch.object(run, 'save') as save, \
                 patch.object(run, 'cleanup') as cleanup:
                # No declared hierarchy, and a hierarchy that fails the tree gate.
                for index, migration in enumerate((ValueError('unsupported hierarchy'), node_tables.NodeTables([], []))):
                    with patch.object(node_tables, 'migrate_rows', side_effect=(migration if isinstance(migration, Exception)
                                      else lambda *args: migration)):
                        run.convert(root/'manifest.json', {sha: str(original)}, root/f'candidate-{index}', remote=True)
                    self.assertEqual(register.call_args.args[1]['tables'], [{**old, 'input_fingerprint': 'b'*64}])
                save.reset_mock()
                register.reset_mock()
                conversion['options']['text'] = 'changed'
                with self.assertRaisesRegex(ValueError, 'hash/size'):
                    run.convert(root/'manifest.json', {sha: str(original)}, root/'rejected', remote=True)
                save.assert_not_called()
                register.assert_not_called()
                cleanup.assert_not_called()

    def test_identical_output_keeps_receipt_and_updates_only_fingerprint(self):
        with TemporaryDirectory() as folder:
            file = Path(folder) / 'wide.parquet'
            file.write_bytes(b'fixed wide table')
            old = {'table_id': 'wide', 'conversion_id': 'one', 'input_fingerprint': 'a'*64,
                   'object': {'key': 'wide.parquet', 'sha256': manifest.sha_file(file),
                              'bytes': file.stat().st_size}, 'row_count': 9,
                   'metadata': {'notes': [{'text': '原典の注記', 'scope': {'kind': 'table'}}]}}
            document = {'tables': [old]}
            with patch.object(run, 'fetch', return_value=file) as fetch:
                receipt = run.unchanged_legacy_receipt(document, {'id': 'one'}, 'wide', file,
                                                        'b'*64, remote=True)
            self.assertEqual(receipt, {**old, 'input_fingerprint': 'b'*64})
            self.assertEqual(old['input_fingerprint'], 'a'*64)
            self.assertIsNot(receipt['metadata'], old['metadata'])
            fetch.assert_called_once_with(old['object'], remote=True)

            # A new conversion output or corrupted saved object must stop registration.
            changed = Path(folder) / 'changed.parquet'
            changed.write_bytes(b'changed wide table')
            with patch.object(run, 'fetch', return_value=file) as fetch:
                with self.assertRaisesRegex(ValueError, 'hash/size'):
                    run.unchanged_legacy_receipt(document, {'id': 'one'}, 'wide', changed,
                                                'b'*64, remote=True)
                fetch.assert_not_called()
            with patch.object(run, 'fetch', return_value=changed):
                with self.assertRaisesRegex(ValueError, 'hash/size'):
                    run.unchanged_legacy_receipt(document, {'id': 'one'}, 'wide', file,
                                                'b'*64, remote=True)

    def test_missing_paired_or_different_conversion_is_not_legacy_fallback(self):
        for table in (None, {'table_id': 'wide', 'conversion_id': 'two'},
                      {'table_id': 'wide', 'conversion_id': 'one', 'nodes': {}}):
            with self.subTest(table=table), self.assertRaisesRegex(ValueError, 'no saved legacy'):
                run.unchanged_legacy_receipt({'tables': [deepcopy(table)] if table else []},
                                            {'id': 'one'}, 'wide', Path('unused'), 'b'*64, remote=False)


if __name__ == '__main__':
    unittest.main()
