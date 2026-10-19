import json
import tempfile
import unittest
from pathlib import Path

from evaluation_search import plan
from evaluation_search.plan_test import CONFIG, selection, write_selections
from serving import evaluation_catalog

A = 'a' * 64
B = 'b' * 64


def record(origin: plan.Origin, page_count: int, config: dict = CONFIG, **overrides) -> dict:
    fmt = plan.item_format(config, origin)
    return {'origin_sha256': origin.sha256, 'page_count': page_count, 'confirmed_at': '2026-10-14T00:00:00Z',
            'plan_fingerprint': plan.fingerprint(config, plan.plan_items(origin, page_count, fmt), fmt), **overrides}


class EvaluationCatalogTest(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        write_selections(Path(directory.name), '131172', selection('131172', A))
        write_selections(Path(directory.name), '131148', selection('131148', B, pages=[{'start': 2, 'end': 3}]))
        self.origins = plan.load_origins(Path(directory.name))

    def test_registered_origins_are_listed_in_contract_shape(self):
        by_sha = {o.sha256: o for o in self.origins}
        instance = {'config': CONFIG, 'registrations': [record(by_sha[A], 108), record(by_sha[B], 63)]}
        catalog = evaluation_catalog.build(self.origins, instance)
        self.assertEqual(catalog['instance'], 'test-v1')
        self.assertEqual([d['jurisdiction'] for d in catalog['documents']], ['131148', '131172'])
        self.assertEqual(catalog['documents'][0]['pages'], [{'start': 2, 'end': 3}])
        self.assertEqual(catalog['documents'][1], {
            'origin_sha256': A, 'jurisdiction': '131172', 'fiscal_year': 2025, 'title': '131172の評価',
            'url': f'https://example.test/{A}.pdf', 'landing_url': 'https://example.test/landing',
            'item_format': 'pdf', 'pages': [{'start': 1, 'end': 108}]})

    def test_declared_text_origin_is_listed_as_md_and_needs_a_record_of_that_shape(self):
        by_sha = {o.sha256: o for o in self.origins}
        config = {**CONFIG, 'text_origins': [A]}
        instance = {'config': config, 'registrations': [record(by_sha[A], 108, config), record(by_sha[B], 63, config)]}
        formats = {d['origin_sha256']: d['item_format'] for d in evaluation_catalog.build(self.origins, instance)['documents']}
        self.assertEqual(formats, {A: 'md', B: 'pdf'})
        # 宣言だけ足して登録し直していない（PDF の形の記録のまま）原典は載せない
        stale = {'config': config, 'registrations': [record(by_sha[A], 108)]}
        self.assertEqual(evaluation_catalog.build(self.origins, stale)['documents'], [])

    def test_origin_without_record_or_with_stale_fingerprint_is_omitted(self):
        by_sha = {o.sha256: o for o in self.origins}
        instance = {'config': CONFIG, 'registrations': [record(by_sha[A], 108, plan_fingerprint='0' * 64)]}
        self.assertEqual(evaluation_catalog.build(self.origins, instance)['documents'], [])

    def test_render_has_two_space_indent_and_trailing_newline(self):
        text = evaluation_catalog.render(self.origins, {'config': CONFIG, 'registrations': []})
        self.assertEqual(text, '{\n  "instance": "test-v1",\n  "documents": []\n}\n')
        self.assertEqual(json.loads(text)['documents'], [])

    def test_committed_catalog_is_current(self):
        self.assertEqual(evaluation_catalog.OUTPUT.read_text(encoding='utf-8'), evaluation_catalog.render())


if __name__ == '__main__':
    unittest.main()
