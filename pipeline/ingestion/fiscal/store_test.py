import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from ingestion.fiscal import manifest, store


def table(sha: str, *, fingerprint: str = 'f', declaration: str | None = 'd') -> dict:
    receipt = {'table_id': 't', 'conversion_id': 'c',
               'object': {'key': f'fiscal/ingestion/x/t-{sha[:16]}.parquet', 'sha256': sha, 'bytes': 3},
               'row_count': 1, 'input_fingerprint': fingerprint}
    if declaration is not None:
        receipt['declaration'] = declaration
    return receipt


DOCUMENT = {'target': {}, 'direction': 'expenditure',
            'conversions': [{'id': 'c', 'expected_tables': [{'table_id': 't'}]}]}


class StoreTest(unittest.TestCase):
    def run_store(self, listed: dict | None, converted: dict, *, previous: dict | None = None, dry_run: bool = False,
                  upload_error: Exception | None = None, gate_error: Exception | None = None):
        with tempfile.TemporaryDirectory() as root:
            root = Path(root)
            path = root / 'expenditure.json'
            path.write_text('{}')
            file = root / 't.parquet'
            file.write_bytes(b'abc')
            candidate = root / 'manifest.json'
            candidate.write_text(json.dumps({**DOCUMENT, 'tables': [converted]}))
            result = {'candidate': str(candidate), 'files': {converted['object']['key']: str(file)}}
            receipts = {} if listed is None else {'x/t': listed}
            with patch.object(manifest, 'read', return_value=DOCUMENT), \
                 patch.object(manifest, 'fingerprints', return_value={'c': 'f'}), \
                 patch.object(manifest, 'declaration', return_value='d'), \
                 patch.object(store, 'previous', return_value=DOCUMENT if previous is None else previous), \
                 patch.object(store.run, 'original_files', return_value={}), \
                 patch.object(store.run, 'convert', return_value=result) as convert, \
                 patch.object(store.unit_checks, 'find_scope', return_value=None), \
                 patch.object(store.storage, 'verify'), \
                 patch.object(store.storage, 'prepare_save', side_effect=gate_error) as self.prepare_save, \
                 patch.object(store.storage, 'receipt_id', side_effect=lambda document, ident: f'x/{ident}'), \
                 patch.object(store.storage, 'upload', side_effect=upload_error) as upload, \
                 patch.object(store.storage, 'cache') as self.cache:
                report = store.store_manifest(path, 'base', receipts, dry_run=dry_run)
                self.cache_calls = [(key, Path(file).read_bytes()) for key, file in
                                    (c.args for c in self.cache.call_args_list)]
            return report, convert, upload

    def test_a_new_table_is_converted_with_main_and_uploaded(self):
        report, convert, upload = self.run_store(None, table('a' * 64))
        self.assertEqual((report['placed'], report['drifted']), (['t'], []))
        self.assertEqual(report['receipts'], {'x/t': table('a' * 64)})
        self.assertFalse(convert.call_args.kwargs['record'])
        self.assertFalse(convert.call_args.kwargs['ask_answers'])
        self.prepare_save.assert_called_once()
        self.assertEqual(upload.call_args.args[2]['sha256'], 'a' * 64)

    def test_a_current_receipt_is_not_re_converted(self):
        report, convert, upload = self.run_store(table('a' * 64), table('a' * 64))
        self.assertEqual(report['tables'], [])
        convert.assert_not_called()
        upload.assert_not_called()

    def test_code_change_with_the_same_content_only_refreshes_the_fingerprint(self):
        report, _, upload = self.run_store(table('a' * 64, fingerprint='old'), table('a' * 64))
        self.assertEqual((report['refreshed'], report['placed']), (['t'], []))
        self.assertEqual(report['receipts']['x/t']['input_fingerprint'], 'f')
        upload.assert_not_called()

    def test_a_new_declaration_stores_the_table_as_main_converts_it(self):
        report, _, upload = self.run_store(table('a' * 64, declaration='old'), table('b' * 64))
        self.assertEqual((report['placed'], report['drifted']), (['t'], []))
        self.assertEqual(report['receipts'], {'x/t': table('b' * 64)})
        upload.assert_called_once()

    def test_different_content_under_the_same_declaration_is_stored_and_reported_as_drift(self):
        report, _, upload = self.run_store(table('a' * 64, fingerprint='old'), table('b' * 64))
        self.assertEqual((report['placed'], report['drifted']), (['t'], ['t']))
        upload.assert_called_once()

    def test_a_receipt_without_declaration_reads_the_change_from_git(self):
        changed = {**DOCUMENT, 'conversions': [{**DOCUMENT['conversions'][0], 'options': {'x': 1}}]}
        legacy = table('a' * 64, fingerprint='old', declaration=None)
        report, _, _ = self.run_store(legacy, table('b' * 64), previous=changed)
        self.assertEqual(report['drifted'], [])
        report, _, _ = self.run_store(legacy, table('b' * 64))
        self.assertEqual(report['drifted'], ['t'])

    def test_a_failed_save_gate_stores_nothing(self):
        with self.assertRaises(ValueError):
            self.run_store(None, table('a' * 64), gate_error=ValueError('gate'))
        self.cache.assert_not_called()

    def test_dry_run_uploads_nothing_and_caches_for_the_dbt_build(self):
        report, _, upload = self.run_store(None, table('a' * 64), dry_run=True)
        upload.assert_not_called()
        self.assertEqual(report['receipts'], {'x/t': table('a' * 64)})
        self.assertEqual(self.cache_calls, [(table('a' * 64)['object']['key'], b'abc')])

    def test_a_failed_upload_leaves_the_table_out_of_the_cache(self):
        with self.assertRaises(RuntimeError):
            self.run_store(None, table('a' * 64), upload_error=RuntimeError('cf'))
        self.cache.assert_not_called()


class UpdatedReceiptsTest(unittest.TestCase):
    def test_new_receipts_replace_and_undeclared_tables_leave_the_list(self):
        listed = {'x/t': table('0' * 64), 'x/gone': table('1' * 64)}
        with patch.object(store.manifest, 'paths', return_value=[Path('m.json')]), \
             patch.object(store.manifest, 'read', return_value=DOCUMENT), \
             patch.object(store.storage, 'receipt_id', side_effect=lambda document, ident: f'x/{ident}'):
            receipts = store.updated_receipts(listed, [{'receipts': {'x/t': table('b' * 64)}}])
        self.assertEqual(receipts, {'x/t': table('b' * 64)})

    def test_an_unreadable_manifest_drops_no_receipt_and_the_others_are_written(self):
        listed = {'x/t': table('0' * 64), 'x/gone': table('1' * 64)}
        with patch.object(store.manifest, 'paths', return_value=[Path('m.json'), Path('broken.json')]), \
             patch.object(store.manifest, 'read', side_effect=[DOCUMENT, ValueError('holds tables')]), \
             patch.object(store.storage, 'receipt_id', side_effect=lambda document, ident: f'x/{ident}'):
            receipts = store.updated_receipts(listed, [{'receipts': {'x/t': table('b' * 64)}}])
        self.assertEqual(receipts, {'x/t': table('b' * 64), 'x/gone': table('1' * 64)})


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
