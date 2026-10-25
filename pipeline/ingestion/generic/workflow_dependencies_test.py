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
    def test_indent_execution_does_not_load_an_unselected_subject_pattern(self):
        result = subprocess.check_output([sys.executable, '-c', '''
import json, sys
from ingestion.generic.layout import Band, Glyph, Logical
from ingestion.generic.workflow import build_reading
subject = Band(0, 40, 1, ('科目',), [20, 100], 20, 100, kind='label')
subject.words = [Glyph('1 総務費', 5, 30, 35, 39, 1, 0)]
remarks = Band(40, 140, 1, ('備考',), [20, 100], 20, 100, kind='label')
remarks.words = [Glyph('1 実証事業', 50, 50, 110, 59, 1, 0)]
money = Band(140, 200, 1, ('支出済額',), [20, 100], 20, 100, kind='amount')
money.words = [Glyph('900', 160, 50, 190, 59, 1, 0)]
workflow = {'layout': {'pattern': 'ruled'}, 'headers': {'pattern': 'standard'},
            'hierarchy': {'subject': {'pattern': 'indent'},
                          'breakdown': {'備考': {'pattern': 'indent'}}}}
built, _ = build_reading([Logical([1], [subject, remarks, money], '円', [])], workflow=workflow)
print(json.dumps({'nodes': len(built.nodes), 'amounts': [a['amount_text'] for a in built.amounts],
                  'modules': sorted(sys.modules)}))
'''], text=True)
        result = json.loads(result)
        self.assertEqual((result['nodes'], result['amounts']), (2, ['900']))
        self.assertIn('ingestion.generic.patterns.subject.indent', result['modules'])
        self.assertNotIn('ingestion.generic.patterns.subject.bands', result['modules'])
        self.assertNotIn('ingestion.generic.discovery', result['modules'])

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
