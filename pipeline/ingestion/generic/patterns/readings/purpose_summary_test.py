import json
import unittest

from ingestion.fiscal import manifest
from ingestion.generic.patterns.readings.purpose_summary import Reader
from ingestion.paths import PIPELINE

MANIFEST = PIPELINE / 'ingestion/fiscal/jurisdictions/133817/2024/settlement/expenditure.json'


class PurposeSummaryTest(unittest.TestCase):
    def test_the_profile_patterns_are_in_the_fingerprint(self):
        conversion = json.loads(MANIFEST.read_text())['conversions'][0]
        found = manifest.dependencies(conversion)
        for path in ('generic/patterns/layout/purpose_section.py', 'generic/patterns/headers/standard.py',
                     'generic/patterns/subject/indent.py'):
            self.assertIn(path, found)

    def test_a_profile_pattern_outside_the_declared_modules_stops(self):
        workflow = {'reading': {'pattern': 'purpose_summary', 'profile': 'x'}, 'components': []}
        layered = {'layout': {'pattern': 'purpose_section'}, 'headers': {'pattern': 'standard'},
                   'hierarchy': {'subject': {'pattern': 'bands'}, 'breakdown': {}}}
        with self.assertRaises(ValueError):
            Reader({'workflow': layered}, workflow)


if __name__ == '__main__':
    unittest.main()
