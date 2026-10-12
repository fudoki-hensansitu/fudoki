"""OCR observations are read outside converters, pinned by SHA and uploaded with the tables (ADR 0019)."""
from copy import deepcopy
import gzip
import hashlib
import json
from pathlib import Path
import tempfile
import unittest

import numpy as np
from unittest.mock import patch

from ingestion.fiscal import manifest, run, storage
from ingestion.fiscal import manifest_test
from ingestion.lib import scan_ocr


def fake_result(seconds: float, path: str) -> dict:
    return {'engine': {'name': 'Apple Vision', 'macos': 'test'},
            'origin': {'path': path, 'sha256': 'a' * 64, 'bytes': 3},
            'pages': [{'page_number': 1, 'image_width': 10, 'image_height': 20,
                       'regions': [{'id': 'full-page', 'inference_seconds': seconds,
                                    'observations': [{'id': 'p1:full-page:r0', 'raw_text': '1,000'}]}]}]}


class AcquireTest(unittest.TestCase):
    def test_run_dependent_fields_leave_the_observation_bytes_unchanged(self):
        request = {'engine': 'vision', 'pages': [1]}
        outputs = []
        for seconds, path in ((0.5, '/a/x.pdf'), (2.0, '/b/x.pdf')):
            with patch.object(scan_ocr, 'recognize_pdf', return_value=fake_result(seconds, path)):
                outputs.append(scan_ocr.acquire(Path('x.pdf'), request))
        (first, run_a), (second, run_b) = outputs
        self.assertEqual(first, second)
        self.assertNotIn(b'inference_seconds', first)
        self.assertNotIn(b'/a/x.pdf', first)
        self.assertEqual(run_a['observation_sha256'], hashlib.sha256(first).hexdigest())
        self.assertEqual([t['inference_seconds'] for t in (run_a['timings'][0], run_b['timings'][0])], [0.5, 2.0])
        self.assertEqual(json.loads(first)['request'], request)

    def test_an_empty_page_is_read_again_in_strips_and_stops_when_still_empty(self):
        empty = fake_result(0.1, '/a/x.pdf')
        empty['pages'][0]['regions'][0]['observations'] = []
        filled = fake_result(0.1, '/a/x.pdf')
        with patch.object(scan_ocr, 'recognize_pdf', side_effect=[deepcopy(empty), filled]) as read, \
                patch.object(scan_ocr.pdf_rules, 'detect'), patch.object(scan_ocr.pdf_rules, 'render', return_value=np.zeros((4, 4), np.uint8)), \
                patch.object(scan_ocr, "column_tiles", return_value=[scan_ocr.OcrRegion("column-0", (0, 0, 1, 1))]):
            data, _ = scan_ocr.acquire(Path('x.pdf'), {'engine': 'vision', 'pages': [1]})
        self.assertEqual(read.call_count, 2)
        self.assertIn(b'1,000', data)
        with patch.object(scan_ocr, 'recognize_pdf', side_effect=[deepcopy(empty), deepcopy(empty)]), \
                patch.object(scan_ocr.pdf_rules, 'detect'), patch.object(scan_ocr.pdf_rules, 'render', return_value=np.zeros((4, 4), np.uint8)), \
                patch.object(scan_ocr, "column_tiles", return_value=[]):
            with self.assertRaisesRegex(ValueError, 'no text for pages \\[1\\]'):
                scan_ocr.acquire(Path('x.pdf'), {'engine': 'vision', 'pages': [1]})

    def test_only_vision_is_acquired(self):
        with self.assertRaisesRegex(ValueError, 'Vision only'):
            scan_ocr.acquire(Path('x.pdf'), {'engine': 'paddle', 'pages': [1]})


class OcrManifestTest(unittest.TestCase):
    """Reuses the CSV workflow fixture; OCR inputs only reference their conversion's originals."""

    def setUp(self):
        manifest_test.ManifestWorkflowTest.setUp(self)
        self.addCleanup(manifest_test.ManifestWorkflowTest.tearDown, self)
        self.objects = self.root / 'objects'
        self.enterContext(patch.object(storage, 'OBJECTS', self.objects))
        self.origin = self.document['conversions'][0]['inputs'][0]['sha256']
        self.document['conversions'][0]['ocr_inputs'] = [
            {'id': 'one-pages', 'origin_sha256': self.origin, 'request': {'engine': 'vision', 'pages': [1]}}]
        manifest.write(self.path, self.document)

    def acquire(self, text: str):
        data = json.dumps({'text': text}).encode()
        return patch('ingestion.lib.scan_ocr.acquire', return_value=(
            data, {'observation_sha256': hashlib.sha256(data).hexdigest(), 'timings': []}))

    def test_ocr_inputs_must_read_their_own_conversion_and_have_unique_ids(self):
        other = deepcopy(self.document)
        other['conversions'][1]['ocr_inputs'] = [dict(self.document['conversions'][0]['ocr_inputs'][0], id='two-pages')]
        with self.assertRaisesRegex(ValueError, 'own conversion'):
            manifest.validate(other)
        other['conversions'][1]['ocr_inputs'][0].update(
            id='one-pages', origin_sha256=other['conversions'][1]['inputs'][0]['sha256'])
        with self.assertRaisesRegex(ValueError, 'Duplicate OCR input ID'):
            manifest.validate(other)

    def test_pinning_writes_sha_and_cache_and_verify_writes_nothing(self):
        with self.acquire('first'):
            report = run.acquire_ocr(self.path, self.files)
        item = manifest.read(self.path)['conversions'][0]['ocr_inputs'][0]
        self.assertEqual(report['pinned']['one-pages']['status'], 'new')
        cached = self.objects / manifest.ocr_key(self.document, 'one-pages')
        self.assertEqual(storage.verify_ocr(cached, item), json.dumps({'text': 'first'}).encode())
        self.assertTrue(cached.with_name('one-pages.run.json').exists())
        before = self.path.read_bytes()
        with self.acquire('second'):
            report = run.acquire_ocr(self.path, self.files, verify_only=True)
        self.assertEqual(report['verified']['one-pages']['status'], 'changed')
        self.assertEqual(self.path.read_bytes(), before)

    def test_unpinned_input_stops_conversion_and_pinned_input_reaches_the_converter(self):
        with self.assertRaisesRegex(ValueError, 'not pinned'):
            run.convert(self.path, self.files, self.root / 'unpinned')
        with self.acquire('first'):
            run.acquire_ocr(self.path, self.files)
        code = self.code / 'fiscal/layouts/csv/convert.py'
        signature = 'def convert(inputs: list[dict], destination: Path, options: dict) -> dict[str, Path]:'
        code.write_text(code.read_text().replace(signature, signature + (
            "\n    (destination / (options['table_id'] + '.ocr')).write_text("
            "repr([(o['id'], str(o['path'])) for item in inputs for o in item['ocr']]))"), 1))
        with patch('ingestion.fiscal.run.save'), patch('ingestion.fiscal.run.save_ocr') as save_ocr:
            run.convert(self.path, self.files, self.root / 'saved', remote=True)
        cached = str(self.objects / manifest.ocr_key(self.document, 'one-pages'))
        self.assertEqual((self.root / 'saved/one.ocr').read_text(), repr([('one-pages', cached)]))
        self.assertEqual((self.root / 'saved/two.ocr').read_text(), '[]')
        save_ocr.assert_called_once()
        self.assertEqual(save_ocr.call_args.args[1]['id'], 'one-pages')
        saved = manifest.read(self.path)
        manifest.require_current(saved)
        # Re-pinning a different observation makes the conversion's saved table stale.
        with self.acquire('second'):
            run.acquire_ocr(self.path, self.files)
        with self.assertRaisesRegex(ValueError, 'Stale saved table: one'):
            manifest.require_current(manifest.read(self.path))

    def test_cleanup_keeps_declared_observations_and_removes_stale_ones(self):
        prefix = manifest.ocr_key(self.document, 'x').rsplit('/', 1)[0] + '/'
        wanted = {prefix + 'one-pages.json.gz', prefix + 'one-pages.run.json'}
        stale = {prefix + 'old.json.gz', prefix + 'old.run.json'}
        keys = wanted | stale | {prefix + 'notes.txt'}
        deleted = []

        def listing(command):
            start = command[command.index('--prefix') + 1]
            after = command[command.index('--start-after') + 1] if '--start-after' in command else ''
            return json.dumps([{'key': k} for k in sorted(keys) if k.startswith(start) and k > after]).encode()

        def delete(command, **kwargs):
            keys.discard(command[4])
            deleted.append(command[4])
        document = deepcopy(self.document)
        with patch.object(manifest, 'require_current'), patch.object(manifest, 'read', return_value=document), \
                patch.object(storage.subprocess, 'check_output', side_effect=listing), \
                patch.object(storage.subprocess, 'run', side_effect=delete):
            self.assertEqual(storage.cleanup(document), 2)
        self.assertEqual(set(deleted), stale)
        self.assertEqual(keys, wanted | {prefix + 'notes.txt'})


class GzipTest(unittest.TestCase):
    def test_observation_gzip_is_byte_stable(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(storage, 'OBJECTS', Path(tmp)):
            document = {'target': {'jurisdiction': '132055', 'fiscal_year': 2025, 'document_kind': 'settlement'},
                        'direction': 'expenditure'}
            item = {'id': 'pages'}
            first = storage.write_ocr(document, item, b'{"a":1}', {}).read_bytes()
            second = storage.write_ocr(document, item, b'{"a":1}', {}).read_bytes()
            self.assertEqual(first, second)
            self.assertEqual(gzip.decompress(first), b'{"a":1}')


if __name__ == '__main__':
    unittest.main()
