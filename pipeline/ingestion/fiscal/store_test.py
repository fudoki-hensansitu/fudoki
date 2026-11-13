import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from ingestion.fiscal import manifest, store


def table(sha: str) -> dict:
    return {'table_id': 't', 'conversion_id': 'c',
            'object': {'key': 'fiscal/ingestion/x/t.parquet', 'sha256': sha, 'bytes': 3}, 'row_count': 1,
            'input_fingerprint': 'f'}


class StoreTest(unittest.TestCase):
    def run_store(self, recorded: dict, converted: dict, previous: dict, *, dry_run: bool = False,
                  already_stored: bool = False):
        with tempfile.TemporaryDirectory() as root:
            root = Path(root)
            path = root / 'expenditure.json'
            path.write_text('{}')
            file = root / 't.parquet'
            file.write_bytes(b'abc')
            candidate = root / 'manifest.json'
            candidate.write_text(json.dumps({'tables': [converted]}))
            result = {'candidate': str(candidate), 'files': {converted['object']['key']: str(file)}}
            with patch.object(manifest, 'read', return_value={'tables': [recorded]}), \
                 patch.object(manifest, 'fingerprints', return_value={'c': 'f'}), \
                 patch.object(store, 'previous', return_value=previous), \
                 patch.object(store, 'stored', return_value=already_stored), \
                 patch.object(store.run, 'original_files', return_value={}), \
                 patch.object(store.run, 'convert', return_value=result) as convert, \
                 patch.object(store.storage, 'verify'), \
                 patch.object(store.storage, 'upload') as upload:
                report = store.store_manifest(path, 'base', dry_run=dry_run)
            return report, convert, upload

    def test_uploads_only_when_the_re_converted_receipt_equals_the_record(self):
        report, convert, upload = self.run_store(table('a' * 64), table('a' * 64), {'tables': []})
        self.assertEqual(report['tables'], ['t'])
        self.assertFalse(convert.call_args.kwargs['record'])
        self.assertFalse(convert.call_args.kwargs['ask_answers'])
        upload.assert_called_once()

    def test_a_differing_receipt_uploads_nothing(self):
        with self.assertRaisesRegex(ValueError, 'differ from their records: t'):
            self.run_store(table('a' * 64), table('b' * 64), {'tables': []})

    def test_dry_run_compares_without_upload(self):
        _, _, upload = self.run_store(table('a' * 64), table('a' * 64), {'tables': []}, dry_run=True)
        upload.assert_not_called()

    def test_an_unchanged_record_is_not_re_converted(self):
        report, convert, upload = self.run_store(table('a' * 64), table('a' * 64), {'tables': [table('a' * 64)]})
        self.assertEqual(report['tables'], [])
        convert.assert_not_called()
        upload.assert_not_called()

    def test_a_table_already_in_r2_is_not_re_converted(self):
        report, convert, upload = self.run_store(table('a' * 64), table('b' * 64), {'tables': []}, already_stored=True)
        self.assertEqual(report['tables'], [])
        convert.assert_not_called()
        upload.assert_not_called()


class StoreCliTest(unittest.TestCase):
    def test_the_cli_reaches_store_without_a_manifest_argument(self):
        from ingestion.fiscal import run
        with patch('sys.argv', ['run.py', 'store', '--since', 'base', '--dry-run']), \
             patch.object(run.poppler, 'require'), patch.object(run.heavy_lock, 'acquire', return_value=None), \
             patch.object(store, 'store', return_value={'manifests': []}) as stored, patch('builtins.print'):
            run.main()
        stored.assert_called_once_with('base', dry_run=True)


if __name__ == '__main__':
    unittest.main()
