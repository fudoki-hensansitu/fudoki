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
        for path in sorted((generate_sources.PIPELINE / 'ingestion/fiscal/jurisdictions').glob('*/*/settlement/expenditure.json')):
            document = json.loads(path.read_text())
            jurisdiction = document['target']['jurisdiction']
            for table in document['tables']:
                key = (jurisdiction, table['table_id'])
                self.assertIn('nodes', table, f'Non-PDF table is neither collected nor excluded: {key}')
                entry = generate_sources.relation_name(*key) + '_nodes'
                if key in generate_sources.EXCLUDE:
                    self.assertTrue(generate_sources.EXCLUDE[key])
                    self.assertNotIn(entry, names)
                else:
                    self.assertIn(entry, names)


if __name__ == '__main__':
    unittest.main()
