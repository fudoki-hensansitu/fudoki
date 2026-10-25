from copy import deepcopy
import json
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch

import jsonschema

from ingestion.fiscal import manifest
from ingestion.generic import reading
from ingestion.generic.workflow import validate


class CoupledReadingTest(unittest.TestCase):
    def setUp(self):
        self.document = manifest.read(manifest.JURISDICTIONS / '131156/2025/settlement/expenditure.json')
        self.conversion = self.document['conversions'][0]

    def test_missing_duplicate_unused_and_unknown_components_stop(self):
        for components, error in (([], 'missing='),
                                  (['scoped_text', 'scoped_text', 'marker_boundary'], 'not valid'),
                                  (['scoped_text', 'marker_boundary', 'page_context'], 'unused='),
                                  (['unknown'], 'Unknown PDF pattern')):
            workflow = deepcopy(self.conversion['options']['workflow'])
            workflow['components'] = components
            with self.subTest(components=components), self.assertRaisesRegex((ValueError, jsonschema.ValidationError), error):
                validate(workflow)

    def test_incompatible_converter_and_unknown_options_stop_at_the_manifest(self):
        for converter in ('generic_text', 'generic_scan'):
            document = deepcopy(self.document)
            conversion = document['conversions'][0]
            conversion['converter'] = f'fiscal/layouts/{converter}/convert.py'
            conversion['options'] = {'account': conversion['options']['account'], 'table_id': 'general',
                                     'workflow': conversion['options']['workflow']}
            with self.subTest(converter=converter), self.assertRaisesRegex(ValueError, 'Coupled readings require'):
                manifest.validate(document)
        document = deepcopy(self.document)
        document['conversions'][0]['options']['misspelled'] = True
        with self.assertRaises(jsonschema.ValidationError):
            manifest.validate(document)
        document = deepcopy(self.document)
        document['conversions'][0]['options']['workflow'] = {
            'layout': {'pattern': 'ruled'}, 'headers': {'pattern': 'standard'},
            'hierarchy': {'subject': {'pattern': 'bands'}, 'breakdown': {}}}
        with self.assertRaisesRegex(ValueError, 'Coupled readings require'):
            manifest.validate(document)

    def test_selected_code_profile_and_schema_change_only_their_consumers(self):
        files = manifest.dependencies(self.conversion)
        self.assertNotIn('generic/discovery.py', files)
        self.assertFalse(any(name.startswith('fiscal/jurisdictions/') and name.endswith('.py') for name in files))
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name in [*files, 'generic/patterns/components/page_context.py']:
                target = root / 'ingestion' / name
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(manifest.code_path(name), target)
            for name in set(manifest.resources(files)) | {'shared/fiscal_annotation_map.csv', 'source_selection/131156.json'}:
                target = root / name
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(manifest.PIPELINE / name, target)
            with patch.multiple(manifest, INGESTION=root / 'ingestion', PIPELINE=root), \
                    patch.object(reading, 'INGESTION', root / 'ingestion'):
                before = manifest.fingerprint(self.document, self.conversion)
                unselected = root / 'ingestion/generic/patterns/components/page_context.py'
                unselected.write_text(unselected.read_text() + '\n# unselected edit\n')
                self.assertEqual(before, manifest.fingerprint(self.document, self.conversion))
                for name in ('generic/patterns/components/scoped_text.py',
                             self.conversion['options']['workflow']['reading']['profile'],
                             'generic/patterns/readings/parallel_breakdowns.profile.schema.json'):
                    before = manifest.fingerprint(self.document, self.conversion)
                    path = root / 'ingestion' / name
                    path.write_text(path.read_text() + '\n')
                    with self.subTest(dependency=name):
                        self.assertNotEqual(before, manifest.fingerprint(self.document, self.conversion))
                profile = root / 'ingestion' / self.conversion['options']['workflow']['reading']['profile']
                data = json.loads(profile.read_text())
                data['unknown_measurement'] = 123
                profile.write_text(json.dumps(data))
                with self.assertRaises(jsonschema.ValidationError):
                    validate(self.conversion['options']['workflow'])
