"""Fixed PDF readings must retain amounts and limit invalidation to their dependencies."""
from copy import deepcopy
import json
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch

import jsonschema

from ingestion.fiscal import manifest
from ingestion.generic.layout import Band, Glyph, Logical
from ingestion.generic.workflow import build_reading, settings, validate


def reading():
    return {'layout': {'pattern': 'ruled'}, 'headers': {'pattern': 'standard'},
            'hierarchy': {'subject': {'pattern': 'bands'}, 'breakdown': {'備考': {'pattern': 'indent'}}}}


class FixedReadingTest(unittest.TestCase):
    def logicals(self):
        subject = Band(0, 40, 1, ('款',), [20, 100], 20, 100, kind='label')
        remarks = Band(40, 140, 1, ('備考',), [20, 100], 20, 100, kind='label')
        money = Band(140, 200, 1, ('支出済額',), [20, 100], 20, 100, kind='amount')
        subject.words = [Glyph('1 民生費', 5, 30, 35, 39, 1, 0)]
        remarks.words = [Glyph('1 事業A', 50, 50, 110, 59, 1, 0)]
        money.words = [Glyph('100', 160, 50, 190, 59, 1, 0)]
        return [Logical([1], [subject, remarks, money], '円', [])]

    def test_a_fixed_reading_builds_the_declared_tree_and_keeps_the_amount(self):
        workflow = validate(reading())
        built, report = build_reading(self.logicals(), workflow=workflow)
        self.assertEqual([amount['amount_text'] for amount in built.amounts], ['100'])
        parent, child = built.nodes
        self.assertEqual((parent['name_text'], child['name_text']), ('民生費', '事業A'))
        self.assertEqual(child['parent_node_key'], parent['node_key'])
        self.assertEqual(report['chosen'], 'bands')
        self.assertNotIn('trials', report)

    def test_a_missing_axis_stops_instead_of_selecting_another_reading(self):
        workflow = reading()
        workflow['hierarchy']['breakdown'] = {}
        with self.assertRaisesRegex(ValueError, 'no breakdown pattern for axis: 備考'):
            build_reading(self.logicals(), workflow=workflow)

    def test_unknown_patterns_and_misspelled_settings_stop(self):
        workflow = reading()
        workflow['headers']['pattern'] = 'not-a-pattern'
        with self.assertRaisesRegex(ValueError, 'Unknown PDF pattern'):
            validate(workflow)
        workflow = reading()
        workflow['hierarchy']['breakdown']['備考']['options'] = {'wrap': 'always'}
        with self.assertRaises(jsonschema.ValidationError):
            validate(workflow)


class SelectedDependencyTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.document = manifest.read(manifest.JURISDICTIONS / '132039/2025/settlement/expenditure.json')
        self.conversion = next(c for c in self.document['conversions'] if 'workflow' in c['options'])
        self.conversion['options']['workflow'] = reading()
        alternate = deepcopy(self.conversion)
        alternate['options']['workflow']['headers']['pattern'] = 'characters'
        self.files = set(manifest.dependencies(self.conversion)) | set(manifest.dependencies(alternate))
        self.files.add('generic/patterns/catalog.json')
        for name in self.files:
            target = self.root / 'ingestion' / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(manifest.code_path(name), target)
        for name in manifest.resources(sorted(self.files)):
            target = self.root / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(manifest.PIPELINE / name, target)
        source = self.root / 'source_selection'
        source.mkdir()
        shutil.copyfile(manifest.PIPELINE / 'source_selection/132039.json', source / '132039.json')
        self.redirect = patch.multiple(manifest, INGESTION=self.root / 'ingestion', PIPELINE=self.root)
        self.redirect.start()
        self.addCleanup(self.redirect.stop)
        self.addCleanup(self.tmp.cleanup)

    def fingerprint(self):
        return manifest.fingerprint(self.document, self.conversion)

    def test_editing_an_unselected_pattern_does_not_invalidate_a_saved_reading(self):
        before = self.fingerprint()
        path = self.root / 'ingestion/generic/patterns/headers/characters.py'
        path.write_text(path.read_text() + '\n# changed character reading\n')
        self.assertEqual(before, self.fingerprint())
        self.conversion['options']['workflow']['headers']['pattern'] = 'characters'
        before = self.fingerprint()
        path.write_text(path.read_text() + '\n# another change\n')
        self.assertNotEqual(before, self.fingerprint())

    def test_catalog_additions_do_not_invalidate_existing_selections(self):
        before = self.fingerprint()
        path = self.root / 'ingestion/generic/patterns/catalog.json'
        catalog = json.loads(path.read_text())
        catalog['headers']['new'] = 'ingestion.generic.patterns.headers.new'
        path.write_text(json.dumps(catalog))
        self.assertEqual(before, self.fingerprint())

    def test_selected_transitive_code_and_csv_resources_invalidate_the_reading(self):
        before = self.fingerprint()
        path = self.root / 'ingestion/generic/patterns/headers/standard.py'
        path.write_text(path.read_text() + '\nfrom ingestion.lib import extra_reading\n')
        (self.root / 'ingestion/lib/extra_reading.py').write_text('VALUE = 1\n')
        self.assertNotEqual(before, self.fingerprint())
        before = self.fingerprint()
        (self.root / 'ingestion/lib/extra_reading.py').write_text('VALUE = 2\n')
        self.assertNotEqual(before, self.fingerprint())
        before = self.fingerprint()
        path = self.root / 'shared/fiscal_amount_map.csv'
        path.write_text(path.read_text() + '\n')
        self.assertNotEqual(before, self.fingerprint())

    def test_fixed_readings_do_not_depend_on_discovery_or_other_patterns(self):
        files = manifest.dependencies(self.conversion)
        self.assertNotIn('generic/discovery.py', files)
        self.assertNotIn('lib/tree_checks.py', files)
        self.assertNotIn('generic/patterns/breakdown/shape.py', files)
        self.assertNotIn('generic/patterns/subject/indent.py', files)

    def test_settings_of_a_different_conversion_do_not_change_this_fingerprint(self):
        before = self.fingerprint()
        other = next(c for c in self.document['conversions'] if c is not self.conversion)
        other['options']['workflow'] = reading()
        other['options']['workflow']['headers']['pattern'] = 'characters'
        self.assertEqual(before, self.fingerprint())
