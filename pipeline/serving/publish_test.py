import unittest

from serving.publish import build_modules, classify, seed_codes

SEEDS = {
    'pipeline/dbt/seeds/fiscal/fiscal_detail_breakdown.csv': {'131016'},
    'pipeline/dbt/seeds/evaluation/evaluation_sheet_link.csv': {'132098', '131016'},
    'pipeline/dbt/seeds/cofog/cofog_master.csv': None,
}


BUILD = {'pipeline/ingestion/fiscal/manifest.py', 'pipeline/ingestion/lib/node_tables.py', 'pipeline/ingestion/project/run.py'}


def scope(*paths: str) -> dict:
    return classify(list(paths), SEEDS.__getitem__, BUILD)


class ClassifyTest(unittest.TestCase):
    def test_jurisdiction_declarations(self):
        self.assertEqual(scope(
            'pipeline/ingestion/fiscal/jurisdictions/131016/2024/settlement/expenditure.json',
            'pipeline/source_selection/132098.json',
            'pipeline/dbt/seeds/fiscal/fiscal_detail_breakdown.csv',
        ), {'mode': 'jurisdictions', 'jurisdictions': ['131016', '132098']})

    def test_seed_without_jurisdiction_column_is_full(self):
        self.assertEqual(scope('pipeline/dbt/seeds/cofog/cofog_master.csv')['mode'], 'full')

    def test_shared_inputs_are_full(self):
        for path in (
            'pipeline/dbt/models/marts/fiscal_line.sql',
            'pipeline/staging/__init__.py',
            'pipeline/ingestion/fiscal/manifest.py',
            'pipeline/ingestion/lib/node_tables.py',
            'pipeline/ingestion/lib/ocr_variant_chars.json',
            'pipeline/ingestion/project/origins.json',
            'pipeline/serving/sync_d1.py',
            'packages/jurisdictions/src/index.ts',
            'apps/api/src/columns.json',
            'uv.lock',
            'pyproject.toml',
            'mise.toml',
        ):
            with self.subTest(path=path):
                self.assertEqual(scope(path), {'mode': 'full', 'jurisdictions': [], 'reason': path})

    def test_converter_code_that_build_does_not_import_does_nothing(self):
        self.assertEqual(scope(
            'pipeline/ingestion/generic/tree.py',
            'pipeline/ingestion/fiscal/layouts/generic_scan/convert.py',
            'pipeline/ingestion/fiscal/layouts/generic_text/options.schema.json',
            'pipeline/ingestion/generic/patterns/catalog.json',
            'pipeline/ingestion/fiscal/store.py',
        ), {'mode': 'none', 'jurisdictions': []})

    def test_unknown_input_falls_to_full(self):
        self.assertEqual(scope('pipeline/something_new/thing.py')['mode'], 'full')

    def test_outside_inputs_and_ignored_do_nothing(self):
        self.assertEqual(scope(
            'apps/web/src/page.tsx',
            'docs/adr/0040.md',
            '.github/workflows/ci.yml',
            'pipeline/AGENTS.md',
            'pipeline/serving/sync_d1_test.py',
            'packages/fiscal/src/names.test.ts',
            'pipeline/ingestion/fiscal/jurisdictions/131016/2024/settlement/expenditure.digit-recheck.jsonl',
            'pipeline/dbt/macros/fiscal_pdf_relations.sql',
        ), {'mode': 'none', 'jurisdictions': []})


class BuildModulesTest(unittest.TestCase):
    def test_follows_what_the_build_imports(self):
        build = build_modules()
        for path in ('pipeline/dbt/scripts/prepare.py', 'pipeline/ingestion/fiscal/manifest.py',
                     'pipeline/ingestion/lib/node_tables.py', 'pipeline/ingestion/generic/page_words.py',
                     'pipeline/ingestion/generic/layout_settings.py', 'pipeline/ingestion/project/link_projects.py'):
            with self.subTest(path=path):
                self.assertIn(path, build)
        # manifest・storage が検査と指紋のときだけ import する変換器は入れない
        for path in ('pipeline/ingestion/generic/tree.py', 'pipeline/ingestion/generic/convert.py',
                     'pipeline/ingestion/fiscal/layouts/generic_scan/convert.py', 'pipeline/ingestion/fiscal/store.py'):
            with self.subTest(path=path):
                self.assertNotIn(path, build)


    def test_relative_imports_are_followed(self):
        import ast
        from pathlib import Path
        from unittest import mock
        from serving import publish

        source = 'from .lib import a\nfrom ..x.y import b\nfrom . import c\n'
        with mock.patch.object(Path, 'read_text', return_value=source):
            names = publish.imported(publish.PIPELINE / 'ingestion/fiscal/storage.py')
        self.assertIn('ingestion.fiscal.lib.a', names)
        self.assertIn('ingestion.x.y.b', names)
        self.assertIn('ingestion.fiscal.c', names)


class SeedCodesTest(unittest.TestCase):
    def test_changed_rows(self):
        diff = ['--- a/x.csv', '+++ b/x.csv', '@@ -1 +1 @@', '-131016,a', '+131016,b', '+132098,c', '-132284,d']
        self.assertEqual(seed_codes('jurisdiction_code,name', diff), {'131016', '132098', '132284'})

    def test_single_column_seed(self):
        self.assertEqual(seed_codes('jurisdiction_code', ['+131016']), {'131016'})

    def test_other_first_column_is_full(self):
        self.assertIsNone(seed_codes('code,name', ['+01,a']))

    def test_non_code_row_is_full(self):
        self.assertIsNone(seed_codes('jurisdiction_code,name', ['+all,a']))


if __name__ == '__main__':
    unittest.main()
