import json
import tempfile
import unittest
from pathlib import Path

from evaluation_search import plan

A = 'a' * 64
B = 'b' * 64
CONFIG = {'name': 'test-v1', 'custom_metadata': [{'field_name': 'page', 'data_type': 'number'}]}


def selection(jurisdiction: str, sha256: str, *, pages=None, files=None, archived=True) -> dict:
    files = files or [(sha256, pages)]
    return {
        'target': {'jurisdiction': jurisdiction, 'fiscal_year': 2025, 'document_kind': 'settlement'},
        'candidates': [{'id': 'representative', 'title': f'{jurisdiction}の評価', 'landing_url': 'https://example.test/landing',
                        'files': [{'download_url': f'https://example.test/{sha}.pdf', 'sha256': sha, 'format': 'pdf',
                                   'pdf_type': 'text', 'pages': scope} for sha, scope in files]}],
        'selected_candidate_id': 'representative',
        'archive': {'bucket': 'fudoki-inputs', 'candidate_id': 'representative',
                    'files': [{'key': f'fiscal/{jurisdiction}/{n}.pdf', 'sha256': sha} for n, (sha, _) in enumerate(files)]}
        if archived else None,
        'reason': 'test',
    }


def write_selections(directory: Path, jurisdiction: str, *selections: dict) -> None:
    (directory / f'{jurisdiction}.json').write_text(json.dumps({'evaluation_selections': list(selections)}), encoding='utf-8')


class PlanTest(unittest.TestCase):
    def origins(self, **kwargs):
        with tempfile.TemporaryDirectory() as directory:
            write_selections(Path(directory), '131172', selection('131172', A, **kwargs))
            return plan.load_origins(Path(directory))

    def test_item_key_and_metadata_are_built_from_origin_and_physical_page(self):
        (origin,) = self.origins()
        self.assertEqual(plan.item_key(origin, 75), f'{A}_p0075.pdf')
        self.assertEqual(plan.item_metadata(origin, 75),
                         {'jurisdiction': '131172', 'fiscal_year': '2025', 'origin_sha256': A, 'page': 75})

    def test_null_pages_plans_every_page(self):
        (origin,) = self.origins()
        self.assertEqual([i['metadata']['page'] for i in plan.plan_items(origin, 3)], [1, 2, 3])

    def test_selected_ranges_plan_only_those_pages(self):
        (origin,) = self.origins(pages=[{'start': 2, 'end': 3}, {'start': 6, 'end': 6}])
        self.assertEqual(plan.selected_pages(origin, 10), [2, 3, 6])

    def test_range_beyond_page_count_stops(self):
        (origin,) = self.origins(pages=[{'start': 2, 'end': 12}])
        with self.assertRaises(ValueError):
            plan.selected_pages(origin, 10)

    def test_invalid_ranges_stop_before_registration(self):
        for ranges in ([{'start': 0, 'end': 3}], [{'start': 11, 'end': 12}, {'start': 13, 'end': 14}],
                       [{'start': 5, 'end': 3}], [{'start': 1, 'end': 2}, {'start': 20, 'end': 30}]):
            (origin,) = self.origins(pages=ranges)
            with self.assertRaises(ValueError, msg=ranges):
                plan.selected_pages(origin, 10)

    def test_missing_selected_candidate_names_the_file(self):
        with tempfile.TemporaryDirectory() as directory:
            broken = selection('131172', A)
            broken['selected_candidate_id'] = 'other'
            write_selections(Path(directory), '131172', broken)
            with self.assertRaisesRegex(ValueError, '131172.json'):
                plan.load_origins(Path(directory))

    def test_unarchived_selection_is_not_planned(self):
        with tempfile.TemporaryDirectory() as directory:
            write_selections(Path(directory), '131172', selection('131172', A, archived=False))
            self.assertEqual(plan.load_origins(Path(directory)), [])

    def test_archive_hash_must_match_selection(self):
        with tempfile.TemporaryDirectory() as directory:
            broken = selection('131172', A)
            broken['archive']['files'][0]['sha256'] = B
            write_selections(Path(directory), '131172', broken)
            with self.assertRaises(ValueError):
                plan.load_origins(Path(directory))

    def test_scan_files_go_only_to_an_ocr_instance(self):
        with tempfile.TemporaryDirectory() as directory:
            mixed = selection('131172', A, files=[(A, None), (B, None)])
            mixed['candidates'][0]['files'][1]['pdf_type'] = 'scan'
            write_selections(Path(directory), '131172', mixed)
            self.assertEqual([o.sha256 for o in plan.load_origins(Path(directory))], [A])
            self.assertEqual([o.sha256 for o in plan.load_origins(Path(directory), use_ocr=True)], [B])

    def test_unknown_pdf_type_stops(self):
        with tempfile.TemporaryDirectory() as directory:
            broken = selection('131172', A)
            broken['candidates'][0]['files'][0]['pdf_type'] = None
            write_selections(Path(directory), '131172', broken)
            with self.assertRaises(ValueError):
                plan.load_origins(Path(directory))

    def test_files_keep_selection_order_and_origins_sort_by_jurisdiction(self):
        with tempfile.TemporaryDirectory() as directory:
            write_selections(Path(directory), '131172', selection('131172', A))
            write_selections(Path(directory), '131148', selection('131148', B, files=[(B, None), ('c' * 64, None)]))
            origins = plan.load_origins(Path(directory))
        self.assertEqual([(o.jurisdiction, o.sha256[0]) for o in origins], [('131148', 'b'), ('131148', 'c'), ('131172', 'a')])

    def test_fingerprint_changes_with_config_pages_and_metadata(self):
        (origin,) = self.origins()
        items = plan.plan_items(origin, 3)
        base = plan.fingerprint(CONFIG, items)
        self.assertEqual(base, plan.fingerprint(json.loads(json.dumps(CONFIG)), plan.plan_items(origin, 3)))
        self.assertNotEqual(base, plan.fingerprint({**CONFIG, 'name': 'test-v2'}, items))
        self.assertNotEqual(base, plan.fingerprint(CONFIG, plan.plan_items(origin, 4)))
        changed = [{**items[0], 'metadata': {**items[0]['metadata'], 'fiscal_year': '2024'}}, *items[1:]]
        self.assertNotEqual(base, plan.fingerprint(CONFIG, changed))

    def test_registration_is_current_only_while_selection_and_config_match(self):
        (origin,) = self.origins()
        record = {'origin_sha256': A, 'page_count': 3, 'confirmed_at': '2026-10-14T00:00:00Z',
                  'plan_fingerprint': plan.fingerprint(CONFIG, plan.plan_items(origin, 3))}
        instance = {'config': CONFIG, 'registrations': [record]}
        self.assertTrue(plan.registration_is_current(instance, origin))
        self.assertFalse(plan.registration_is_current({**instance, 'config': {**CONFIG, 'name': 'other'}}, origin))
        (narrowed,) = self.origins(pages=[{'start': 1, 'end': 2}])
        self.assertFalse(plan.registration_is_current(instance, narrowed))
        self.assertFalse(plan.registration_is_current({'config': CONFIG, 'registrations': []}, origin))

    def test_committed_instance_json_is_in_rendered_form(self):
        instance = plan.load_instance()
        self.assertEqual(plan.INSTANCE_PATH.read_text(encoding='utf-8'), plan.render_instance(instance))
        self.assertEqual({r['origin_sha256'] for r in instance['registrations']} - {o.sha256 for o in plan.load_origins()}, set())


if __name__ == '__main__':
    unittest.main()
