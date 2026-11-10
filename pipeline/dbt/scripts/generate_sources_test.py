"""The committed source declarations must match the management JSONs."""
import unittest
from pathlib import Path

import generate_sources


class GenerateSourcesTest(unittest.TestCase):
    def test_committed_sources_match_manifests(self):
        path = Path(generate_sources.DBT / 'models/staging/fiscal/_sources.yml')
        self.assertEqual(path.read_text(), generate_sources.render())

    def test_every_manifest_table_is_collected_or_excluded_with_reason(self):
        import json
        names = {e['name'] for e in generate_sources.collect()}
        patterns = ('*/*/settlement/expenditure.json', '*/*/initial/expenditure.json')
        manifests = sorted({p for pattern in patterns
                            for p in (generate_sources.PIPELINE / 'ingestion/fiscal/jurisdictions').glob(pattern)})
        for path in manifests:
            document = json.loads(path.read_text())
            target = document['target']
            jurisdiction = target['jurisdiction']
            for table in document['tables']:
                key = (jurisdiction, table['table_id'])
                entry = generate_sources.relation_name(
                    jurisdiction, target['fiscal_year'], target['document_kind'], table['table_id'])
                if key in generate_sources.EXCLUDE:
                    self.assertTrue(generate_sources.EXCLUDE[key])
                    self.assertNotIn(entry + '_nodes', names)
                    self.assertNotIn(entry, names)
                elif 'nodes' in table:
                    self.assertIn(entry + '_nodes', names)
                elif 'object' in table:
                    self.assertIn(entry, names)
                else:
                    self.fail(f'Table is neither PDF nodes nor raw CSV: {key}')


if __name__ == '__main__':
    unittest.main()
