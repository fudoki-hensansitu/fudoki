"""A failed node migration may refresh only byte-identical saved wide tables."""
from copy import deepcopy
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from ingestion.fiscal import manifest, run


class LegacyRetentionTests(unittest.TestCase):
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
