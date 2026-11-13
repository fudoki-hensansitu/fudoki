import unittest

from serving.publish import classify, seed_codes

SEEDS = {
    'pipeline/dbt/seeds/fiscal/fiscal_detail_breakdown.csv': {'131016'},
    'pipeline/dbt/seeds/project/project_jurisdiction.csv': {'132098', '131016'},
    'pipeline/dbt/seeds/cofog/cofog_master.csv': None,
}


def scope(*paths: str) -> dict:
    return classify(list(paths), SEEDS.__getitem__)


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
            'pipeline/ingestion/generic/tree.py',
            'pipeline/serving/sync_d1.py',
            'packages/jurisdictions/src/index.ts',
            'apps/api/src/columns.json',
            'uv.lock',
            'pyproject.toml',
            'mise.toml',
        ):
            with self.subTest(path=path):
                self.assertEqual(scope(path), {'mode': 'full', 'jurisdictions': [], 'reason': path})

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
            'pipeline/dbt/models/staging/fiscal/_sources.yml',
            'pipeline/dbt/macros/fiscal_pdf_relations.sql',
        ), {'mode': 'none', 'jurisdictions': []})


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
