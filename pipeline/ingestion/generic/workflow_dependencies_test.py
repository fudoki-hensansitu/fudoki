import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

from ingestion.fiscal import manifest


class WorkflowDependencyTest(unittest.TestCase):
    def test_executed_code_is_fingerprinted_and_unselected_patterns_are_not_loaded(self):
        fixture = Path(__file__).with_name('workflow_execution_fixture.py')
        for adapter, subject, detail, headers in (('text', 'bands', 'shape', 'characters'),
                                                 ('text', 'bands', 'position', 'standard'),
                                                 ('scan', 'indent', 'indent', 'standard')):
            with self.subTest(adapter=adapter, subject=subject, detail=detail, headers=headers):
                result = json.loads(subprocess.check_output(
                    [sys.executable, str(fixture), adapter, subject, detail, headers], text=True))
                self.assertEqual((result['nodes'], result['amounts']), (2, ['900']))
                self.assertEqual(result['names'], ['総務費', '事業A'])
                self.assertTrue(result['parent_preserved'])
                self.assertEqual(result['missing'], [])
                self.assertEqual(result['unselected'], [])
                self.assertIn(f'generic/patterns/subject/{subject}.py', result['loaded'])
                self.assertIn(f'generic/patterns/breakdown/{detail}.py', result['loaded'])
                self.assertNotIn('generic/discovery.py', result['loaded'])
                if headers == 'characters':
                    self.assertIn('generic/patterns/headers/characters.py', result['loaded'])
                    self.assertEqual(result['headers'], ['予算現額／予備費支出及び流用増減'])
                if adapter == 'text':
                    self.assertIn('generic/patterns/repairs/split_at_rules.py', result['loaded'])

    def test_imported_package_initializers_change_the_fingerprint(self):
        document = manifest.read(manifest.JURISDICTIONS / '132039/2025/settlement/expenditure.json')
        conversion = dict(document['conversions'][0], converter='fixture/convert.py', options={})
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / 'ingestion'
            shared = Path(directory) / 'shared'
            shared.mkdir()
            shutil.copyfile(manifest.PIPELINE / 'shared/fiscal_annotation_map.csv',
                            shared / 'fiscal_annotation_map.csv')
            for name, text in {'fixture/convert.py': 'import ingestion.fixture.reader\n',
                               'fixture/reader.py': 'VALUE = 1\n',
                               'fixture/__init__.py': '', 'fixture/options.schema.json': '{}'}.items():
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(text)
            with patch.object(manifest, 'INGESTION', root):
                before = manifest.fingerprint(document, conversion)
                (root / 'fixture/__init__.py').write_text('VALUE = 2\n')
                self.assertNotEqual(before, manifest.fingerprint(document, conversion))
