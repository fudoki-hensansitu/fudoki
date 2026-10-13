"""Stale fingerprints are settled by table content, never by bytes, and only unchanged manifests are rewritten."""
from copy import deepcopy
import json
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch

import duckdb

from ingestion.fiscal import manifest, manifest_test, refresh, run, storage
from ingestion.lib.node_tables import NodeTables


def write_parquet(path: Path, rows: list[tuple], *, compression: str = 'snappy') -> None:
    with duckdb.connect() as con:
        con.execute('create table t (名称 varchar, 金額 varchar)')
        con.executemany('insert into t values (?, ?)', rows)
        con.execute(f"copy t to '{path}' (format parquet, compression {compression})")


class CompareParquetTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.rows = [('a', '1'), ('b', '2'), ('c', '3')]
        write_parquet(self.root / 'saved.parquet', self.rows)

    def tearDown(self):
        self.tmp.cleanup()

    def compare(self, rows: list[tuple], **options):
        write_parquet(self.root / 'candidate.parquet', rows, **options)
        return refresh.compare_parquet(self.root / 'saved.parquet', self.root / 'candidate.parquet')

    def test_identical_content_with_different_bytes_is_same(self):
        found = self.compare(self.rows, compression='zstd')
        self.assertNotEqual(manifest.sha_file(self.root / 'saved.parquet'), manifest.sha_file(self.root / 'candidate.parquet'))
        self.assertEqual(found, {'same': True, 'identical_bytes': False, 'rows': {'saved': 3, 'candidate': 3}})

    def test_added_removed_and_changed_rows_are_counted_with_examples(self):
        found = self.compare([('a', '1'), ('b', '20'), ('d', '4'), ('e', '5')])
        self.assertFalse(found['same'])
        self.assertEqual((found['removed'], found['added']), (2, 3))
        self.assertEqual(found['changed'], 2)
        self.assertEqual(found['rows'], {'saved': 3, 'candidate': 4})
        self.assertEqual(found['examples']['removed'], [{'名称': 'b', '金額': '2'}, {'名称': 'c', '金額': '3'}])
        self.assertEqual(found['examples']['changed'][0],
                         {'row': 1, 'columns': {'金額': {'saved': '2', 'candidate': '20'}}})

    def test_reordered_rows_are_reported_as_changed_positions_only(self):
        found = self.compare(list(reversed(self.rows)))
        self.assertFalse(found['same'])
        self.assertEqual((found['removed'], found['added'], found['changed']), (0, 0, 2))

    def test_schema_changes_are_reported_without_row_comparison(self):
        with duckdb.connect() as con:
            con.execute(f"copy (select 名称 as 事業名, 金額 from read_parquet('{self.root / 'saved.parquet'}')) "
                        f"to '{self.root / 'candidate.parquet'}' (format parquet)")
        found = refresh.compare_parquet(self.root / 'saved.parquet', self.root / 'candidate.parquet')
        self.assertFalse(found['same'])
        self.assertEqual(found['schema']['removed'], ['名称'])
        self.assertEqual(found['schema']['added'], ['事業名'])


class RefreshWorkflowTest(unittest.TestCase):
    def setUp(self):
        manifest_test.ManifestWorkflowTest.setUp(self)
        self.objects = self.root / 'objects'
        self.enterContext(patch.object(storage, 'OBJECTS', self.objects))
        with patch('ingestion.fiscal.run.save'), patch('ingestion.fiscal.run.cleanup'):
            run.convert(self.path, self.files, self.root / 'saved', remote=True)
        self.saved = manifest.read(self.path)
        for table in self.saved['tables']:
            target = self.objects / table['object']['key']
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(self.root / 'saved' / f'{table["table_id"]}.parquet', target)
        for receipt in self.selection['archive']['files']:
            target = self.objects / receipt['key']
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(self.files[receipt['sha256']], target)
        self.work = self.root / 'work'

    def tearDown(self):
        manifest_test.ManifestWorkflowTest.tearDown(self)

    def refresh(self, **options):
        return refresh.refresh_manifest(self.path, remote=False, dry_run=options.pop('dry_run', False), work=self.work)

    def edit_converter(self, old: str, new: str):
        code = self.code / 'fiscal/layouts/csv/convert.py'
        code.write_text(code.read_text().replace(old, new))

    def test_current_manifest_is_skipped_without_converting(self):
        with patch.object(run, 'convert') as convert:
            result = self.refresh()
        self.assertEqual(result['status'], refresh.CURRENT)
        convert.assert_not_called()

    def test_comment_only_change_rewrites_only_fingerprints(self):
        with (self.code / 'lib/parquet.py').open('a') as stream:
            stream.write('\n# a comment does not change a table\n')
        with self.assertRaisesRegex(ValueError, 'Stale saved table'):
            manifest.require_current(manifest.read(self.path))
        result = self.refresh()
        self.assertEqual(result['status'], refresh.REFRESHED)
        self.assertEqual(result['counts'], {'same': 2, 'different': 0, 'blocked': 0})
        updated = manifest.read(self.path)
        manifest.require_current(updated)
        expected = deepcopy(self.saved)
        for table in expected['tables']:
            table['input_fingerprint'] = manifest.fingerprints(expected)[table['conversion_id']]
        self.assertEqual(updated, expected)
        for before, after in zip(self.saved['tables'], updated['tables']):
            self.assertNotEqual(before['input_fingerprint'], after['input_fingerprint'])
            self.assertEqual(before['object'], after['object'])
        self.assertFalse((self.work / refresh.slug(self.saved)).exists())

    def test_dry_run_compares_but_keeps_the_manifest(self):
        with (self.code / 'lib/parquet.py').open('a') as stream:
            stream.write('\n# comment\n')
        before = self.path.read_bytes()
        result = self.refresh(dry_run=True)
        self.assertEqual(result['status'], refresh.WOULD_REFRESH)
        self.assertEqual(self.path.read_bytes(), before)

    def test_changed_content_is_reported_and_manifest_is_not_rewritten(self):
        self.edit_converter('    return {table_id: output}', (
            "    import duckdb, os\n"
            "    duckdb.sql(f\"copy (select * replace ('9' as 金額) from read_parquet('{output}')) to '{output}.new' (format parquet)\")\n"
            "    os.replace(f'{output}.new', output)\n"
            '    return {table_id: output}'))
        before = self.path.read_bytes()
        result = self.refresh()
        self.assertEqual(result['status'], refresh.DIFFERENT)
        self.assertEqual(self.path.read_bytes(), before)
        self.assertEqual(result['counts'], {'same': 0, 'different': 2, 'blocked': 0})
        diff = result['tables'][0]['diff']['content']['table']
        self.assertEqual((diff['removed'], diff['added'], diff['changed']), (1, 1, 1))
        self.assertTrue((self.work / refresh.slug(self.saved) / 'manifest.json').is_file())
        with self.assertRaisesRegex(ValueError, 'Stale saved table'):
            manifest.require_current(manifest.read(self.path))

    def test_receipt_metadata_change_is_a_difference_even_when_rows_match(self):
        metadata = {'notes': [{'text': '新しい注記', 'scope': {'kind': 'table'}}]}
        self.edit_converter('    return {table_id: output}',
                            f"    return {{table_id: {{'path': output, 'metadata': {metadata!r}}}}}")
        result = self.refresh()
        self.assertEqual(result['status'], refresh.DIFFERENT)
        diff = result['tables'][0]['diff']
        self.assertNotIn('content', diff)
        self.assertEqual([item['field'] for item in diff['receipt']], ['metadata.notes'])

    def test_save_gate_failure_blocks_even_when_content_is_the_same(self):
        with (self.code / 'lib/parquet.py').open('a') as stream:
            stream.write('\n# comment\n')
        before = self.path.read_bytes()
        with patch.object(storage, 'prepare_save', side_effect=ValueError('Node table failed the mandatory pre-save tree check')):
            result = self.refresh()
        self.assertEqual(result['status'], refresh.BLOCKED)
        self.assertEqual(result['counts'], {'same': 0, 'different': 0, 'blocked': 2})
        self.assertIn('tree check', result['tables'][0]['reason'])
        self.assertEqual(self.path.read_bytes(), before)

    def test_converter_refusal_blocks_the_manifest(self):
        self.edit_converter("    source = inputs[0]\n", "    raise ValueError('Digit coverage failed')\n")
        before = self.path.read_bytes()
        result = self.refresh()
        self.assertEqual(result['status'], refresh.BLOCKED)
        self.assertEqual(result['stage'], 'convert')
        self.assertIn('Digit coverage failed', result['reason'])
        self.assertEqual(self.path.read_bytes(), before)

    def test_manifest_changed_during_comparison_is_not_overwritten(self):
        with (self.code / 'lib/parquet.py').open('a') as stream:
            stream.write('\n# comment\n')
        original = refresh.compare_table

        def compare_and_edit(*args):
            self.path.write_bytes(self.path.read_bytes() + b' ')
            return original(*args)

        with patch.object(refresh, 'compare_table', side_effect=compare_and_edit):
            result = self.refresh()
        self.assertEqual(result['status'], refresh.ERROR)
        self.assertIn('changed during refresh', result['reason'])

    def test_missing_saved_table_without_remote_is_an_error_not_a_rewrite(self):
        with (self.code / 'lib/parquet.py').open('a') as stream:
            stream.write('\n# comment\n')
        shutil.rmtree(self.objects)
        before = self.path.read_bytes()
        result = self.refresh()
        self.assertEqual(result['status'], refresh.ERROR)
        self.assertEqual(result['stage'], 'restore')
        self.assertEqual(self.path.read_bytes(), before)

    def test_refresh_all_reports_and_requires_attention_for_differences(self):
        output = self.root / 'report' / 'report.json'
        report = refresh.refresh_all([self.path], remote=False, dry_run=False, output=output)
        self.assertTrue(report['ok'])
        self.assertEqual(report['summary']['manifests'], {'current': 1})
        self.edit_converter('    return {table_id: output}', (
            "    import duckdb, os\n"
            "    duckdb.sql(f\"copy (select * replace ('9' as 金額) from read_parquet('{output}')) to '{output}.new' (format parquet)\")\n"
            "    os.replace(f'{output}.new', output)\n"
            '    return {table_id: output}'))
        report = refresh.refresh_all([self.path], remote=False, dry_run=False, output=output)
        self.assertFalse(report['ok'])
        self.assertEqual(report['summary']['tables'], {'same': 0, 'different': 2, 'blocked': 0})
        self.assertEqual(json.loads(output.read_text())['manifests'][0]['status'], refresh.DIFFERENT)
        self.assertEqual(report['summary']['attention'][0]['status'], refresh.DIFFERENT)


class SaveGateTest(unittest.TestCase):
    def test_node_table_gate_is_shared_by_save_and_refresh(self):
        document = {'target': {'jurisdiction': '131016', 'fiscal_year': 2024, 'document_kind': 'settlement'},
                    'direction': 'expenditure'}
        table = {'table_id': 'one', 'nodes': {'object': {'key': 'x'}}, 'amounts': {'object': {'key': 'y'}},
                 'unread_amount_count': 0, 'unresolved_parent_count': 0}
        paths = {'nodes': Path('n'), 'amounts': Path('a')}
        with patch('ingestion.lib.node_tables.read_rows', return_value=[]), \
             patch('ingestion.lib.node_tables.check_tree', return_value={'passed': False}):
            with self.assertRaisesRegex(ValueError, 'tree check'):
                storage.prepare_save(document, table, paths)
            with self.assertRaisesRegex(ValueError, 'tree check'):
                storage.save(document, table, paths, remote=True)
        with patch('ingestion.lib.node_tables.read_rows', return_value=[]), \
             patch('ingestion.lib.node_tables.check_tree', return_value={'passed': True}):
            with self.assertRaisesRegex(ValueError, 'tree check'):
                storage.prepare_save(document, {**table, 'unread_amount_count': 1}, paths)


if __name__ == '__main__':
    unittest.main()
