"""Input-contract failures must stop loading and preserve the previous warehouse."""
import hashlib
import json
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import duckdb
import yaml

import prepare
from ingestion.lib.node_tables import AMOUNT_COLUMNS, NODE_COLUMNS


class PrepareTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.candidate = self.root / 'candidates'
        self.target = {'jurisdiction': '131041', 'fiscal_year': 2025, 'document_kind': 'settlement'}
        self.table = {'table_id': 'general-expenditure-detail', 'conversion_id': 'detail', 'account': '一般会計',
                      'notes': [], 'unread_amount_count': 0, 'unresolved_parent_count': 0}
        for kind, columns in [('nodes', NODE_COLUMNS), ('amounts', AMOUNT_COLUMNS)]:
            path = self.candidate / '131041' / f'general-expenditure-detail-{kind}.parquet'
            path.parent.mkdir(parents=True, exist_ok=True)
            with duckdb.connect() as con:
                schema = ','.join(f'{c.name} {c.type}' for c in columns)
                con.execute(f'create table raw ({schema})')
                con.execute('insert into raw default values')
                con.execute('copy raw to ? (format parquet)', [str(path)])
            self.table[kind] = {'row_count': 1, 'object': {'key': f'{kind}.parquet',
                                'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'bytes': path.stat().st_size}}
        self.document = {'target': self.target, 'direction': 'expenditure',
                         'conversions': [{'id': 'detail'}], 'tables': [self.table]}
        self.dbt = self.root / 'dbt'
        sources = self.dbt / 'models/staging/fiscal/_sources.yml'
        sources.parent.mkdir(parents=True)
        declared = [{'name': 'fixture_' + kind, 'meta': {**self.target, 'direction': 'expenditure',
                     'table_id': self.table['table_id'], 'kind': kind}} for kind in ('nodes', 'amounts')]
        sources.write_text(yaml.safe_dump({'sources': [{'name': 'fiscal_pdf', 'tables': declared}]}))
        (self.candidate / '131041/manifest.json').write_text(json.dumps(self.document))
        self.warehouse = self.root / 'warehouse.duckdb'
        with duckdb.connect(str(self.warehouse)) as con:
            con.execute('create schema ingestion')
            con.execute("create table ingestion.fixture_nodes as select 'preserved' as marker")

    def load(self):
        original = {'sha256': 'a' * 64, 'download_url': 'https://example.test/original.pdf',
                    'format': 'pdf', 'scope': [{'account': '一般会計'}]}
        with patch.object(prepare, 'DBT', self.dbt), \
             patch.object(prepare.manifest, 'validate', return_value=self.document), \
             patch.object(prepare.manifest, 'resolved_inputs', return_value=[original]), \
             patch.object(prepare.manifest, 'selection_for', return_value={'candidates': [{'title': 'original'}]}):
            return prepare.prepare(self.warehouse, self.candidate)

    def test_missing_conversion_identifies_table(self):
        self.table['conversion_id'] = 'missing'
        with self.assertRaisesRegex(ValueError, 'missing.*general-expenditure-detail'):
            self.load()

    def test_duplicate_pdf_source_stops(self):
        path = self.dbt / 'models/staging/fiscal/_sources.yml'
        declaration = yaml.safe_load(path.read_text())
        declaration['sources'] *= 2
        path.write_text(yaml.safe_dump(declaration))
        with self.assertRaisesRegex(ValueError, 'exactly one fiscal_pdf'):
            self.load()

    def test_hash_failure(self):
        path = prepare.input_path(self.document, self.table, 'nodes', self.candidate)
        path.write_bytes(b'broken')
        with self.assertRaisesRegex(ValueError, 'hash/size'):
            prepare.input_path(self.document, self.table, 'nodes', self.candidate)

    def test_saved_path_uses_same_fetch_contract(self):
        with patch.object(prepare, 'fetch', return_value=self.root / 'saved') as fetch:
            self.assertEqual(prepare.input_path(self.document, self.table, 'nodes', None, remote=True), self.root / 'saved')
            fetch.assert_called_once_with(self.table['nodes']['object'], remote=True)

    def test_nested_candidate_distinguishes_another_year_of_the_same_jurisdiction(self):
        old = self.candidate / '131041'
        nested = old / '2025/settlement/expenditure'
        files = list(old.iterdir())
        nested.mkdir(parents=True)
        for path in files:
            shutil.move(path, nested / path.name)
        self.assertEqual(self.load()['tables'], 1)
        other = {**self.document, 'target': {**self.target, 'fiscal_year': 2024, 'document_kind': 'initial'}}
        with patch.object(prepare, 'fetch', return_value=self.root / 'saved') as fetch:
            path = prepare.input_path(other, self.table, 'nodes', self.candidate)
            self.assertEqual(path, self.root / 'saved')
            fetch.assert_called_once_with(self.table['nodes']['object'], remote=False)
        # A provided target must not quietly substitute saved data for a missing candidate pair.
        (nested / 'general-expenditure-detail-nodes.parquet').unlink()
        with self.assertRaises(FileNotFoundError):
            self.load()

    def test_empty_or_unused_candidates_stop_and_leave_the_warehouse_unchanged(self):
        extra = self.candidate / 'unused/manifest.json'
        extra.parent.mkdir()
        extra.write_text('{}')
        with self.assertRaisesRegex(ValueError, 'Unused candidate'):
            self.load()
        with duckdb.connect(str(self.warehouse)) as con:
            self.assertEqual(con.execute('select marker from ingestion.fixture_nodes').fetchone(), ('preserved',))
        extra.unlink()
        (self.candidate / '131041/manifest.json').unlink()
        with self.assertRaisesRegex(ValueError, 'contains no manifest'):
            self.load()

    def test_columns_and_row_count(self):
        path = prepare.input_path(self.document, self.table, 'nodes', self.candidate)
        with duckdb.connect() as con:
            prepare.inspect(con, path, self.table['nodes'], 'nodes')
            with self.assertRaisesRegex(ValueError, 'Row count'):
                prepare.inspect(con, path, {'row_count': 0}, 'nodes')
            with self.assertRaisesRegex(ValueError, 'columns/types'):
                prepare.inspect(con, path, {'row_count': 0}, 'amounts')

    def test_missing_account_and_nonzero_uncertainties_stop(self):
        for field, value in [('account', ''), ('unread_amount_count', 1), ('unresolved_parent_count', 1)]:
            with self.subTest(field=field):
                previous = self.table[field]
                self.table[field] = value
                with self.assertRaisesRegex(ValueError, 'contract failed'):
                    self.load()
                self.table[field] = previous

    def test_failed_second_input_rolls_back_first_replacement(self):
        self.table['amounts']['row_count'] = 2
        with self.assertRaisesRegex(ValueError, 'Row count'):
            self.load()
        with duckdb.connect(str(self.warehouse)) as con:
            self.assertEqual(con.execute('select marker from ingestion.fixture_nodes').fetchone(), ('preserved',))

    def test_jurisdiction_names_must_be_nfkc(self):
        registry = self.root / 'jurisdictions.json'
        registry.write_text(json.dumps({'jurisdictions': {'132039': {'name': 'ﾑｻｼﾉ市', 'ocdId': 'x'}}}))
        with self.assertRaisesRegex(ValueError, 'NFKC.*132039'):
            prepare.load_jurisdictions(registry)

    def test_success_loads_original_and_metadata(self):
        result = self.load()
        self.assertEqual((result['tables'], result['origins'], result['nodes'], result['amounts']), (1, 1, 1, 1))
        self.assertIn('return(["fixture"])', (self.dbt / 'macros/fiscal_pdf_relations.sql').read_text())
        with duckdb.connect(str(self.warehouse)) as con:
            self.assertEqual(con.execute('select title,sha256 from ingestion.origin').fetchone(), ('original', 'a' * 64))
            self.assertEqual(con.execute('select account_name from ingestion.tables').fetchone(), ('一般会計',))
            # 団体マスタは収録の有無に関わらず全団体を読む
            registry = json.loads(prepare.JURISDICTIONS.read_text())['jurisdictions']
            self.assertEqual(result['jurisdictions'], len(registry))
            self.assertEqual(con.execute("select name, ocd_id from ingestion.jurisdiction where jurisdiction_code = '132039'").fetchone(),
                             ('武蔵野市', 'ocd-division/country:jp/prefecture:13/city:132039'))


if __name__ == '__main__':
    unittest.main()
