"""Stale fingerprints are settled by table content, never by bytes, and only unchanged manifests are rewritten."""
from collections import Counter
from copy import deepcopy
import json
import os
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch

import duckdb

from ingestion.fiscal import manifest, manifest_test, refresh, run, storage
from ingestion.lib import digit_recheck
from ingestion.lib.node_tables import NodeTables
from ingestion.paths import PIPELINE


def write_parquet(path: Path, rows: list[tuple], *, compression: str = 'snappy') -> None:
    with duckdb.connect() as con:
        con.execute('create table t (名称 varchar, 金額 varchar)')
        con.executemany('insert into t values (?, ?)', rows)
        con.execute(f"copy t to '{path}' (format parquet, compression {compression})")


PROBABILITY = 0.2


class FakeJev:
    """A Jev client that answers every question the same way; nothing leaves the machine."""

    def __init__(self, key=None, *, model=None):
        self.usage, self.requests = Counter(), 0

    def __call__(self, contexts):
        self.requests += 1
        self.usage['input_tokens'] += 100 * len(contexts)
        return [PROBABILITY] * len(contexts)


# A text PDF table with one printed digit outside its amount band: the only digit Jev is asked about.
PDF_CONVERTER = '''
from ingestion.lib.node_tables import NodeTables, write_coverage_words, write_tables


def node(key, parent, name, depth):
    return {'node_key': key, 'parent_node_key': parent, 'axis_header': '科目', 'depth': depth,
            'level_header': ('款', '項')[depth - 1], 'code_text': '1', 'name_text': name,
            'physical_page': 1, 'x0': 1.0, 'y0': 2.0, 'x1': 40.0, 'y1': 4.0}


def amount(key, text):
    return {'node_key': key, 'header_path': '支出済額', 'amount_text': text, 'unit_text': '円',
            'physical_page': 1, 'x0': 100.0, 'y0': 2.0, 'x1': 140.0, 'y1': 4.0}


def convert(inputs, destination, options):
    ident = options['table_id']
    tables = NodeTables([node('k', None, '議会費', 1), node('k-1', 'k', '議会費', 2)],
                        [amount('k', '1,000'), amount('k-1', '1,000')])
    pair = write_tables(destination, ident, tables)
    write_coverage_words(destination / (ident + '.parquet'),
                         [(1, (1.0, 2.0, 40.0, 4.0), '議会費'),
                          (1, (100.0, 2.0, 140.0, 4.0), '1,000'),
                          (1, (1.0, 50.0, 20.0, 52.0), '7,777')],
                         amount_columns=[{'header': '支出済額', 'x_range': [95.0, 145.0]}])
    return {ident: {**pair, 'notes': []}}
'''


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


class RefreshFixture:
    """A saved manifest plus a stand-in R2; subclasses decide which conversion produced it."""

    def setUp(self):
        manifest_test.ManifestWorkflowTest.setUp(self)
        self.objects = self.root / 'objects'
        self.enterContext(patch.object(storage, 'OBJECTS', self.objects))
        self.prepare()
        self.save_and_stage()

    def prepare(self):
        """Declare the conversion and the gate stubs before the first conversion."""

    def save_and_stage(self):
        """Convert once with uploads stubbed at the `cf` call, so the stand-in R2 holds what refresh restores."""
        with patch('ingestion.fiscal.storage.subprocess.run'), patch('ingestion.fiscal.run.cleanup'):
            run.convert(self.path, self.files, self.root / 'saved', remote=True)
        self.saved = manifest.read(self.path)
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


class RefreshWorkflowTest(RefreshFixture, unittest.TestCase):
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

    def test_refresh_never_asks_or_writes_jev_answers(self):
        # A refresh (dry-run included) compares tables; it must not extend or rewrite the tracked answer store.
        with (self.code / 'lib/parquet.py').open('a') as stream:
            stream.write('\n# a comment\n')
        seen = []
        real = run.convert

        def spy(*args, **kwargs):
            seen.append((kwargs.get('persist_answers'), kwargs.get('ask_answers')))
            return real(*args, **kwargs)

        with patch.object(run, 'convert', side_effect=spy):
            result = self.refresh(dry_run=True)
        self.assertEqual(result['status'], refresh.WOULD_REFRESH)
        self.assertEqual(seen, [(False, False)])

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

    def test_refresh_all_removes_a_stale_report_before_starting(self):
        output = self.root / 'report' / 'report.json'
        output.parent.mkdir(parents=True)
        output.write_text('{"stale": true}')
        seen = []
        real = refresh.refresh_manifest

        def spy(*args, **kwargs):
            # A caller waits for this file to appear; an old report must not be visible while the run is going.
            seen.append(output.exists())
            return real(*args, **kwargs)

        with patch.object(refresh, 'refresh_manifest', side_effect=spy):
            refresh.refresh_all([self.path], remote=False, dry_run=False, output=output)
        self.assertEqual(seen, [False])
        self.assertNotIn('stale', output.read_text())


class RefreshJevAnswersTest(RefreshFixture, unittest.TestCase):
    """A refresh reads stored Jev answers; the contract is that the tracked store keeps its bytes."""

    def prepare(self):
        self.use_text_pdf_table()
        self.enterContext(patch.object(digit_recheck, 'HttpAsk', FakeJev))
        self.enterContext(patch.dict(os.environ, {'TYPESAFE_API_KEY': 'test-key'}))

    def use_text_pdf_table(self):
        shared = self.root / 'shared'
        shared.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(PIPELINE / 'shared/fiscal_annotation_map.csv', shared / 'fiscal_annotation_map.csv')
        code = self.code / 'fiscal/layouts/nodes/convert.py'
        code.parent.mkdir(parents=True, exist_ok=True)
        code.write_text(PDF_CONVERTER)
        code.with_name('options.schema.json').write_text(json.dumps({'type': 'object'}))
        for file in self.selection['candidates'][0]['files']:
            file.update(format='pdf', pdf_type='text')
            file['scope'][0]['pages'] = [{'start': 1, 'end': 1}]
        for receipt in self.selection['archive']['files']:
            receipt['key'] = receipt['key'].replace('.csv', '.pdf')
        self.ledger.write_text(json.dumps({'selections': [self.selection]}))
        self.document['conversions'] = [dict(self.document['conversions'][0],
                                             converter='fiscal/layouts/nodes/convert.py',
                                             options={'table_id': 'one'},
                                             expected_tables=[{'table_id': 'one'}])]
        manifest.write(self.path, self.document)

    def store(self) -> Path:
        return run.recheck_store_path(manifest.read(self.path))

    def make_stale(self):
        """Mark every saved table stale the way a changed converter would: only the stored fingerprint moves."""
        document = manifest.read(self.path)
        for table in document['tables']:
            table['input_fingerprint'] = '0' * 64
        manifest.write(self.path, document)

    def test_answers_used_by_the_refresh_leave_the_store_untouched(self):
        store = self.store()
        used = digit_recheck.read_store(store)
        self.assertEqual(len(used), 1)
        # A row this refresh does not replay: rewriting the store would drop it, as it did once for 273 rows.
        extra = {'t': 'one', 'fp': '1' * 32, 'p': 0.1}
        digit_recheck.write_store(store, [*used, extra])
        tracked = store.read_bytes()
        self.make_stale()
        manifest_before = self.path.read_bytes()
        with patch.object(digit_recheck, 'HttpAsk') as ask:
            result = self.refresh(dry_run=True)
        self.assertEqual(result['status'], refresh.WOULD_REFRESH)
        ask.assert_not_called()
        self.assertEqual(store.read_bytes(), tracked)
        self.assertEqual(self.path.read_bytes(), manifest_before)

    def test_a_digit_without_a_stored_answer_blocks_instead_of_asking(self):
        self.store().unlink()
        self.make_stale()
        manifest_before = self.path.read_bytes()
        with patch.object(digit_recheck, 'HttpAsk') as ask:
            result = self.refresh(dry_run=True)
        self.assertEqual(result['status'], refresh.BLOCKED)
        self.assertIn('Jev answers missing', result['reason'])
        ask.assert_not_called()
        self.assertFalse(self.store().exists())
        self.assertEqual(self.path.read_bytes(), manifest_before)


class SaveGateTest(unittest.TestCase):
    def test_node_table_gate_is_shared_by_save_and_refresh(self):
        document = {'target': {'jurisdiction': '131016', 'fiscal_year': 2024, 'document_kind': 'settlement'},
                    'direction': 'expenditure'}
        table = {'table_id': 'one', 'nodes': {'object': {'key': 'x'}}, 'amounts': {'object': {'key': 'y'}},
                 'unread_amount_count': 0, 'unresolved_parent_count': 0}
        paths = {'nodes': Path('n'), 'amounts': Path('a')}
        with patch('ingestion.lib.node_tables.read_rows', return_value=[]), \
             patch('ingestion.lib.tree_checks.check_tree', return_value={'passed': False}):
            with self.assertRaisesRegex(ValueError, 'tree check'):
                storage.prepare_save(document, table, paths)
            with self.assertRaisesRegex(ValueError, 'tree check'):
                storage.save(document, table, paths, remote=True)
        with patch('ingestion.lib.node_tables.read_rows', return_value=[]), \
             patch('ingestion.lib.tree_checks.check_tree', return_value={'passed': True}):
            with self.assertRaisesRegex(ValueError, 'tree check'):
                storage.prepare_save(document, {**table, 'unread_amount_count': 1}, paths)

    def test_unit_check_is_part_of_the_gate(self):
        from ingestion.fiscal import unit_checks_test as fixtures
        document = {'target': {'jurisdiction': '131016', 'fiscal_year': 2024, 'document_kind': 'settlement'},
                    'direction': 'expenditure', 'conversions': [{'id': 'c', 'options': {}}]}
        table = {'table_id': 'one', 'conversion_id': 'c', 'account': '一般会計',
                 'nodes': {'object': {'key': 'x'}}, 'amounts': {'object': {'key': 'y'}},
                 'unread_amount_count': 0, 'unresolved_parent_count': 0}
        paths = {'nodes': Path('n'), 'amounts': Path('a')}

        def gate(nodes, amounts, table=table, scope=None):
            rows = {'n': nodes, 'a': amounts}
            with patch('ingestion.lib.node_tables.read_rows', side_effect=lambda path: rows[path.name]):
                return storage.prepare_save(document, table, paths, scope=scope)

        # 千円 printed, read as 円: the tree is consistent, the digits of a general account's total are not.
        nodes, amounts = fixtures.table('100,000', '50,000')
        with self.assertRaisesRegex(ValueError, 'unit check'):
            gate(nodes, amounts)
        # A special account has no digits rule; the printed total is what shows the mistake.
        special = {**table, 'account': '国民健康保険特別会計'}
        printed = fixtures.scope(('150', 300.0, 360.0))
        with self.assertRaisesRegex(ValueError, 'unit check'):
            gate(nodes, amounts, special, printed)
        # The same table passes the unit check when the total agrees (the key check stops it next).
        with self.assertRaisesRegex(ValueError, 'Wrong current-table key'):
            gate(nodes, amounts, special, fixtures.scope(('150,000', 300.0, 360.0)))


if __name__ == '__main__':
    unittest.main()
