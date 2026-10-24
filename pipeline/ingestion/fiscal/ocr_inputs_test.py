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
    return {'engine': {'name': 'PaddleOCR', 'runtime': 'test'},
            'origin': {'path': path, 'sha256': 'a' * 64, 'bytes': 3},
            'pages': [{'page_number': 1, 'image_width': 10, 'image_height': 20,
                       'regions': [{'id': 'full-page', 'inference_seconds': seconds,
                                    'observations': [{'id': 'p1:full-page:r0', 'raw_text': '1,000'}]}]}]}


class AcquireTest(unittest.TestCase):
    def setUp(self):
        # supplement's page checks read the PDF; the tests here hand it pages that have none
        for step in ('require_one_page_box', 'split_unit_stacks'):
            self.enterContext(patch.object(scan_ocr, step))

    def test_run_dependent_fields_leave_the_observation_bytes_unchanged(self):
        request = {'engine': 'paddle', 'pages': [1]}
        outputs = []
        for seconds, path in ((0.5, '/a/x.pdf'), (2.0, '/b/x.pdf')):
            with patch.object(scan_ocr, 'recognize_pdf', return_value=fake_result(seconds, path)), \
                    patch.object(scan_ocr, 'supplement', side_effect=lambda path, page, *_, **kwargs: page):
                outputs.append(scan_ocr.acquire(Path('x.pdf'), request))
        (first, run_a), (second, run_b) = outputs
        self.assertEqual(first, second)
        self.assertNotIn(b'inference_seconds', first)
        self.assertNotIn(b'/a/x.pdf', first)
        self.assertEqual(run_a['observation_sha256'], hashlib.sha256(first).hexdigest())
        self.assertEqual([t['inference_seconds'] for t in (run_a['timings'][0], run_b['timings'][0])], [0.5, 2.0])
        self.assertEqual(json.loads(first)['request'], request)

    def test_a_page_without_text_stops_the_acquisition(self):
        empty = fake_result(0.1, '/a/x.pdf')
        empty['pages'][0]['regions'][0]['observations'] = []
        with patch.object(scan_ocr, 'recognize_pdf', return_value=empty):
            with self.assertRaisesRegex(ValueError, 'no text for pages \\[1\\]'):
                scan_ocr.acquire(Path('x.pdf'), {'engine': 'paddle', 'pages': [1]})

    def test_missed_ink_skips_rules_and_covered_text(self):
        dark = np.zeros((100, 200), bool)
        dark[50, 10:190] = True            # a horizontal rule
        dark[10:20, 20:26] = True          # text covered by an OCR box
        dark[10:20, 100:106] = True        # a lone 0 no box covers
        marks = scan_ocr.missed_ink(dark, 0.5, [[9, 4, 14, 11]])
        self.assertEqual(marks, [(50.0, 5.0, 53.0, 10.0)])

    def test_a_thin_1_is_ink_and_a_bracket_tip_is_a_speck(self):
        dark = np.zeros((100, 200), bool)
        dark[10:19, 40] = True             # a 1, one pixel wide and 9 tall
        dark[30:35, 80] = True             # the tip of a bracket left outside an OCR box
        self.assertEqual(scan_ocr.missed_ink(dark, 0.5, []), [(20.0, 5.0, 20.5, 9.5)])

    def test_ink_areas_join_one_line_within_a_cell(self):
        rule = scan_ocr.pdf_rules.Rule(60.0, 0.0, 100.0)
        rules = scan_ocr.pdf_rules.PageRules(1, 200.0, 100.0, (rule,), ())
        areas = scan_ocr.ink_areas([(10, 10, 14, 16), (20, 10, 24, 16), (70, 10, 74, 16)], rules)
        self.assertEqual(len(areas), 2)
        self.assertLessEqual(areas[0][2], 59.0)   # kept off the cell's rule
        self.assertGreaterEqual(areas[1][0], 61.0)

    def test_supplement_keeps_new_readings_and_pins_vlm_answers(self):
        page = {'page_number': 1, 'regions': [{'id': 'full-page', 'observations': [
            {'id': 'p1:full-page:r0', 'kind': 'region', 'parent_id': None, 'raw_text': '特別職', 'bbox_pdf_pt': [10, 10, 40, 16]}]}]}
        reread = {'pages': [{'page_number': 1, 'regions': [{'id': 'ink-0', 'observations': [
            {'id': 'p1:ink-0:r0', 'kind': 'region', 'parent_id': None, 'raw_text': '特別職', 'bbox_pdf_pt': [10, 10, 40, 16]},
            {'id': 'p1:ink-0:r1', 'kind': 'region', 'parent_id': None, 'raw_text': '0', 'bbox_pdf_pt': [100, 30, 104, 36]}]}]}]}
        rules = scan_ocr.pdf_rules.PageRules(1, 200.0, 100.0, (), ())
        rest = [(10.0, 50.0, 14.0, 52.0)]
        with patch.object(scan_ocr.pdf_rules, 'detect', return_value=rules), \
                patch.object(scan_ocr.pdf_rules, 'render', return_value=np.zeros((200, 400), np.uint8)), \
                patch.object(scan_ocr, 'missed_ink', side_effect=[[(100, 30, 104, 36)], [], rest]), \
                patch.object(scan_ocr, '_read_without_rules', return_value=reread['pages'][0]), \
                patch.object(scan_ocr.vlm_ocr, 'read', return_value='一') as ask:
            result = scan_ocr.supplement(Path('x.pdf'), deepcopy(page), scan_ocr.PaddleConfig(), {})
        texts = [(r['id'], [o['raw_text'] for o in r['observations']]) for r in result['regions']]
        self.assertEqual(texts, [('full-page', ['特別職']), ('ink-0', ['0']), ('vlm-0', ['一'])])
        self.assertEqual(ask.call_count, 1)
        pinned = scan_ocr._pinned_answers({'vlm': scan_ocr._vlm_identity(), 'pages': [result]})
        self.assertEqual(scan_ocr._pinned_answers({'vlm': {'model': 'other'}, 'pages': [result]}), {})
        with patch.object(scan_ocr.pdf_rules, 'detect', return_value=rules), \
                patch.object(scan_ocr.pdf_rules, 'render', return_value=np.zeros((200, 400), np.uint8)), \
                patch.object(scan_ocr, 'missed_ink', side_effect=[[(100, 30, 104, 36)], [], rest]), \
                patch.object(scan_ocr, '_read_without_rules', return_value=deepcopy(reread)['pages'][0]), \
                patch.object(scan_ocr.vlm_ocr, 'read') as again:
            scan_ocr.supplement(Path('x.pdf'), deepcopy(page), scan_ocr.PaddleConfig(), pinned)
        again.assert_not_called()

    def test_vlm_line_reading_fills_only_the_one_gap_ocr_left(self):
        tokens = [('修', [347, 0, 357, 10]), ('料', [425, 0, 437, 10])]
        self.assertEqual(scan_ocr._fill('修繕料', tokens, (383, 0, 397, 10)), '繕')
        self.assertIsNone(scan_ocr._fill('修繰料品', tokens, (383, 0, 397, 10)))   # two changes
        self.assertIsNone(scan_ocr._fill('修繕料', tokens, (440, 0, 450, 10)))     # gap elsewhere
        self.assertEqual(scan_ocr._fill('0', [], (10, 0, 14, 10)), '0')

    def test_acquisition_without_the_vlm_keeps_unread_ink_without_calling_a_model(self):
        page = {'page_number': 1, 'regions': []}
        rules = scan_ocr.pdf_rules.PageRules(1, 200.0, 100.0, (), ())
        rest = [(10.0, 50.0, 14.0, 52.0)]
        with patch.object(scan_ocr.pdf_rules, 'detect', return_value=rules), \
                patch.object(scan_ocr.pdf_rules, 'render', return_value=np.zeros((200, 400), np.uint8)), \
                patch.object(scan_ocr, 'missed_ink', side_effect=[rest, [], rest]), \
                patch.object(scan_ocr, '_read_without_rules', return_value={'regions': []}), \
                patch.object(scan_ocr.vlm_ocr, 'read') as ask:
            result = scan_ocr.supplement(Path('x.pdf'), page, scan_ocr.PaddleConfig(), {}, vlm_fallback=False)
        ask.assert_not_called()
        self.assertEqual(len(result['unread_ink']), 1)
        x0, y0, x1, y1 = result['unread_ink'][0]
        self.assertTrue(x0 <= 10 and y0 <= 50 and x1 >= 14 and y1 >= 52)
        spaced = [('般', [385, 0, 402, 10]), ('職', [420, 0, 437, 10])]
        self.assertEqual(scan_ocr._fill('ー般職', spaced, (355, 0, 369, 10)), '一')       # ー at the start is 一
        self.assertEqual(scan_ocr._fill('―般職', spaced, (355, 0, 369, 10)), '一')
        self.assertEqual(scan_ocr._fill('コーヒー', [('コ', [0, 0, 5, 10]), ('ヒー', [12, 0, 22, 10])], (5, 0, 11, 10)), 'ー')
        self.assertIsNone(scan_ocr._fill('UNREADABLE', [], (10, 0, 14, 10)))

    def test_a_whole_reread_replaces_the_piece_ocr_read_alone(self):
        page = {'page_number': 1, 'regions': [{'id': 'full-page', 'observations': [
            {'id': 'p1:full-page:r0', 'kind': 'region', 'parent_id': None, 'raw_text': '7)', 'bbox_pdf_pt': [120, 0, 126, 10]},
            {'id': 'p1:full-page:r1', 'kind': 'region', 'parent_id': None, 'raw_text': '事業', 'bbox_pdf_pt': [10, 0, 30, 10]},
            {'id': 'p1:full-page:r2', 'kind': 'region', 'parent_id': None, 'raw_text': '（', 'bbox_pdf_pt': [60, 0, 64, 10]}]}]}
        reread = {'page_number': 1, 'regions': [{'id': 'ink-0', 'observations': [
            {'id': 'p1:ink-0:r0', 'kind': 'region', 'parent_id': None, 'raw_text': '1,796,817)', 'bbox_pdf_pt': [88, 0, 126, 10]},
            {'id': 'p1:ink-0:r1', 'kind': 'region', 'parent_id': None, 'raw_text': '事', 'bbox_pdf_pt': [20, 0, 40, 10]}]}]}
        rules = scan_ocr.pdf_rules.PageRules(1, 200.0, 100.0, (), ())
        marks = [(90, 1, 118, 9), (32, 1, 39, 9)]
        with patch.object(scan_ocr.pdf_rules, 'detect', return_value=rules), \
                patch.object(scan_ocr.pdf_rules, 'render', return_value=np.zeros((200, 400), np.uint8)), \
                patch.object(scan_ocr, 'missed_ink', side_effect=[marks, [], []]), \
                patch.object(scan_ocr, '_read_without_rules', return_value=reread):
            result = scan_ocr.supplement(Path('x.pdf'), deepcopy(page), scan_ocr.PaddleConfig(), {})
        added = result['regions'][-1]
        self.assertEqual([o['raw_text'] for o in added['observations']], ['1,796,817)'])  # 事 cuts through 事業
        self.assertEqual(added['supersedes'], ['p1:full-page:r0'])
        self.assertEqual(scan_ocr.superseded(result), {'p1:full-page:r0'})

    def test_a_closing_bracket_without_an_opening_one_is_dropped(self):
        self.assertEqual(scan_ocr._balanced('0）', []), '0')
        self.assertEqual(scan_ocr._balanced('22,572）', [('（', [0, 0, 4, 10])]), '22,572）')

    def test_an_area_takes_in_the_piece_ocr_read_beside_the_marks(self):
        rules = scan_ocr.pdf_rules.PageRules(1, 200.0, 100.0, (), ())
        (area,) = scan_ocr.ink_areas([(90, 1, 118, 9)], rules, [[120, 0, 126, 10], [10, 0, 30, 10]])
        self.assertEqual((area[0], area[2]), (84, 132))   # 6pt beyond the piece and the marks

    def test_a_number_read_in_part_is_not_kept(self):
        self.assertTrue(scan_ocr._well_formed('（ 1,949,000）'))
        self.assertTrue(scan_ocr._well_formed('0'))
        self.assertTrue(scan_ocr._well_formed('修繕料'))
        self.assertFalse(scan_ocr._well_formed('，949,000）'))
        self.assertFalse(scan_ocr._well_formed('1,540，（'))

    def test_digit_sized_marks_go_to_paddle_and_only_a_single_digit_is_kept(self):
        page = {'page_number': 1, 'regions': []}
        # two digit-sized, a thin 1, a thin bracket, one wide
        marks = [(10, 10, 14, 16), (30, 10, 34, 16), (40, 10, 41.5, 16), (45, 10, 46.5, 16), (50, 10, 90, 16)]
        with patch.object(scan_ocr, '_whitened', return_value=np.full((400, 400), 255, np.uint8)), \
                patch.object(scan_ocr.paddle_ocr, 'recognize_crops', return_value=['0', 'o)', '1', '(']) as read:
            scan_ocr._read_zeros(Path('x.pdf'), 1, scan_ocr.PaddleConfig(), page, marks)
        self.assertEqual(len(read.call_args.args[0]), 4)
        self.assertEqual([(r['id'], r['observations'][0]['raw_text']) for r in page['regions']],
                         [('digit-0', '0'), ('digit-2', '1')])

    def test_whitening_removes_rules_and_their_edges_but_keeps_text(self):
        image = np.full((200, 200), 255, np.uint8)
        image[:, 100:103] = 0          # a vertical rule, longer than 14pt at 72 dpi
        image[:, 103] = 100            # its faint edge
        image[50:60, 50:56] = 0        # a glyph
        scan_ocr._whitened.cache_clear()
        with patch.object(scan_ocr.pdf_rules, 'render', return_value=image):
            clean = scan_ocr._whitened(Path('x.pdf'), 1, 72)
        self.assertTrue((clean[:, 100:104] == 255).all())
        self.assertTrue((clean[50:60, 50:56] == 0).all())

    def test_only_paddle_is_acquired(self):
        with self.assertRaisesRegex(ValueError, 'acquired with Paddle'):
            scan_ocr.acquire(Path('x.pdf'), {'engine': 'tesseract', 'pages': [1]})

    def test_paddle_reads_exact_crops_and_keeps_no_native_output(self):
        request = {'engine': 'paddle', 'pages': [1], 'config': {'page_strips': 4}}
        result = fake_result(.1, '/a/x.pdf')
        result['pages'][0]['attempts'] = [{'id': 'p1:full-page:a0', 'region_id': 'full-page', 'inference_seconds': .3,
                                           'native': [{'res': {}}], 'observations': [{'id': 'x'}]}]
        with patch.object(scan_ocr, 'recognize_pdf', return_value=result) as read, \
                patch.object(scan_ocr, 'supplement', side_effect=lambda path, page, *_, **kwargs: page) as supplement:
            data, run = scan_ocr.acquire(Path('x.pdf'), request)
        self.assertEqual(read.call_args.kwargs['config'].page_strips, 4)
        self.assertEqual(supplement.call_args.args[2].page_strips, 4)
        self.assertEqual(json.loads(data)['render'], {'pdf_renderer': 'pypdfium2', 'dpi': 300})
        attempt = json.loads(data)['pages'][0]['attempts'][0]
        self.assertNotIn('native', attempt)
        self.assertNotIn('inference_seconds', attempt)
        self.assertIn(.3, [t.get('inference_seconds') for t in run['timings']])


class OcrManifestTest(unittest.TestCase):
    """Reuses the CSV workflow fixture; OCR inputs only reference their conversion's originals."""

    def setUp(self):
        manifest_test.ManifestWorkflowTest.setUp(self)
        self.addCleanup(manifest_test.ManifestWorkflowTest.tearDown, self)
        self.objects = self.root / 'objects'
        self.enterContext(patch.object(storage, 'OBJECTS', self.objects))
        self.origin = self.document['conversions'][0]['inputs'][0]['sha256']
        self.document['conversions'][0]['ocr_inputs'] = [
            {'id': 'one-pages', 'origin_sha256': self.origin, 'request': {'engine': 'paddle', 'pages': [1]}}]
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
