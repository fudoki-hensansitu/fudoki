"""Every manifest table is loaded or excluded with a reason."""
import unittest

import fiscal_inputs


class FiscalInputsTest(unittest.TestCase):
    def test_every_manifest_table_is_collected_or_excluded_with_reason(self):
        import json
        names = {e['name'] for e in fiscal_inputs.collect()}
        patterns = ('*/*/settlement/expenditure.json', '*/*/initial/expenditure.json')
        manifests = sorted({p for pattern in patterns
                            for p in (fiscal_inputs.PIPELINE / 'ingestion/fiscal/jurisdictions').glob(pattern)})
        for path in manifests:
            document = json.loads(path.read_text())
            target = document['target']
            jurisdiction = target['jurisdiction']
            for table in document['tables']:
                key = (jurisdiction, table['table_id'])
                entry = fiscal_inputs.relation_name(
                    jurisdiction, target['fiscal_year'], target['document_kind'], table['table_id'])
                year_key = (jurisdiction, target['fiscal_year'], target['document_kind'], table['table_id'])
                if key in fiscal_inputs.EXCLUDE or year_key in fiscal_inputs.EXCLUDE_YEAR:
                    self.assertTrue(fiscal_inputs.EXCLUDE.get(key) or fiscal_inputs.EXCLUDE_YEAR[year_key])
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
