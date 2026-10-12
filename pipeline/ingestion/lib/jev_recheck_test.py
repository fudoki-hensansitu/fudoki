"""Pinned coverage rechecks through a deterministic service stub."""
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from ingestion.lib import jev_recheck as jev


class RecheckTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.path = Path(self.directory.name) / 'table.jev.json'
        self.word = {'page': 1, 'bbox': [1, 2, 3, 4], 'text': '3,000,000'}

    def coverage(self, *rules):
        return {'passed': 'blocked' not in rules,
                'decisions': [{**self.word, 'bbox': [1, i * 10, 3, i * 10 + 4], 'covered': rule}
                              for i, rule in enumerate(rules)]}

    def service(self, choice='table_amount', probability=0.95):
        def call(state, questions, key):
            return {'model': jev.MODEL, 'usage': {'input_tokens': 100, 'output_tokens': 10},
                    'answers': {q: {'type': 'choice', 'choice': choice,
                        'probabilities': {c: probability if c == choice else (1 - probability) / 3
                                          for c in jev.CRITERIA}} for q in questions}}
        return call

    def test_weak_rules_add_stops_diagnostics_never_change_pass(self):
        coverage = self.coverage('non_amount', 'total', 'verified_total', 'annotation', 'reported', 'amount', 'label', 'excluded')
        result = jev.recheck([self.word], coverage, self.path, allow_api=True, transport=self.service())
        self.assertFalse(result['passed'])
        self.assertEqual([d['covered'] for d in result['stopped']], ['non_amount', 'total', 'verified_total', 'annotation'])
        self.assertEqual(result['questions'], 5)
        diagnostics = jev.recheck([self.word], self.coverage('reported'), self.path,
                                 allow_api=True, transport=self.service())
        self.assertTrue(diagnostics['passed'])

    def test_existing_stop_cannot_pass_even_with_non_amount_answer(self):
        result = jev.recheck([self.word], self.coverage('blocked'), self.path,
                             allow_api=True, transport=self.service('non_amount'))
        self.assertFalse(result['passed'])
        self.assertEqual(result['stopped'], [])

    def test_probability_boundary_and_expected_answers(self):
        for probability, stopped in [(0.899, False), (0.9, True)]:
            self.path.unlink(missing_ok=True)
            result = jev.recheck([self.word], self.coverage('non_amount'), self.path,
                                 allow_api=True, transport=self.service(probability=probability))
            self.assertEqual(bool(result['stopped']), stopped)
        self.path.unlink()
        result = jev.recheck([self.word], self.coverage('total', 'verified_total'), self.path,
                             allow_api=True, transport=self.service('total_amount'))
        self.assertTrue(result['passed'])

    def test_replay_without_key_and_invalidate_changed_evidence(self):
        coverage = self.coverage('non_amount')
        first = jev.recheck([self.word], coverage, self.path, allow_api=True, transport=self.service())
        with patch.dict(os.environ, {}, clear=True):
            replay = jev.recheck([self.word], coverage, self.path)
            self.assertEqual(replay['stopped'], first['stopped'])
            self.assertEqual(replay['requests'], 0)
            self.assertEqual(replay['usage'], {})
            with self.assertRaisesRegex(ValueError, 'never calls the API'):
                jev.recheck([{**self.word, 'text': 'changed'}], coverage, self.path)
            with self.assertRaisesRegex(ValueError, 'TYPESAFE_API_KEY'):
                jev.recheck([{**self.word, 'text': 'changed'}], coverage, self.path, allow_api=True)

    def test_reject_malformed_or_wrong_model_response(self):
        service = self.service()
        def wrong_model(*args):
            return {**service(*args), 'model': 'jev-latest'}
        with self.assertRaisesRegex(ValueError, 'model/questions'):
            jev.recheck([self.word], self.coverage('non_amount'), self.path,
                        allow_api=True, transport=wrong_model)
        self.assertFalse(self.path.exists())

    def test_page_batch_and_oversized_request_split(self):
        rules = ['non_amount'] * 200
        result = jev.recheck([self.word], self.coverage(*rules), self.path,
                             allow_api=True, transport=self.service())
        self.assertGreater(result['requests'], 1)
        self.assertEqual(result['questions'], 200)
        replay = jev.recheck([self.word], self.coverage(*rules), self.path)
        self.assertEqual(replay['judgments'], result['judgments'])

    def test_oversized_page_splits_with_bounded_context(self):
        words = [{**self.word, 'text': '説明' * 50, 'bbox': [0, i * 10, 100, i * 10 + 5]}
                 for i in range(1000)]
        coverage = self.coverage('non_amount', 'total')
        coverage['decisions'][1]['bbox'] = [0, 9990, 100, 9995]
        states = list(jev.page_states(words, coverage['decisions']))
        self.assertGreater(len(states), 1)
        self.assertEqual(sum(len(digits) for state, digits in states), 2)
        self.assertTrue(all(len(jev.encoded(state)) < jev.MAX_STATE_BYTES for state, digits in states))

    def test_service_choice_need_not_be_distribution_argmax(self):
        def service(state, questions, key):
            return {'model': jev.MODEL, 'usage': {'input_tokens': 100, 'output_tokens': 10},
                    'answers': {q: {'type': 'choice', 'choice': 'table_amount',
                        'probabilities': {'annotation_amount': 0.23, 'non_amount': 0.38,
                                          'table_amount': 0.37, 'total_amount': 0.02}}
                                for q in questions}}
        result = jev.recheck([self.word], self.coverage('non_amount'), self.path,
                             allow_api=True, transport=service)
        self.assertTrue(result['passed'])
        self.assertEqual(result['judgments'][0]['probability'], 0.37)

    def test_rounded_distribution_is_accepted_and_invalid_mass_is_rejected(self):
        answer = {'type': 'choice', 'choice': 'non_amount',
                  'probabilities': {'non_amount': 0.90, 'table_amount': 0.04,
                                    'total_amount': 0.03, 'annotation_amount': 0.02}}
        jev.validate_answer(answer)
        answer['probabilities']['non_amount'] = 0.5
        with self.assertRaisesRegex(ValueError, 'Invalid Jev Choice'):
            jev.validate_answer(answer)

    def test_peer_tables_reuse_identical_judgments_without_duplicate_requests(self):
        shared = {}
        coverage = self.coverage('non_amount')
        first = jev.recheck([self.word], coverage, self.path, allow_api=True,
                            transport=self.service(), shared_entries=shared)
        second_path = self.path.with_name('peer.jev.json')
        def no_call(*args):
            raise AssertionError('duplicate request for identical evidence')
        second = jev.recheck([self.word], coverage, second_path, allow_api=True,
                             transport=no_call, shared_entries=shared)
        self.assertEqual(second['requests'],0)
        self.assertEqual(second['judgments'],first['judgments'])
        replay = jev.recheck([self.word], coverage, second_path)
        self.assertEqual(replay['judgments'],first['judgments'])

    def test_full_page_text_preserves_headers_and_physical_page_numbers(self):
        xml = b'<html><page><word xMin="1" yMin="2" xMax="3" yMax="4">Total</word></page><page><word xMin="5" yMin="6" xMax="7" yMax="8">10</word></page></html>'
        with patch.object(jev.subprocess, 'check_output', return_value=xml) as poppler:
            words = jev.read_page_words(Path('fixed.pdf'), {7,8})
        self.assertEqual(words[0], {'page':7,'bbox':[1.,2.,3.,4.],'text':'Total'})
        self.assertEqual(words[1]['page'],8)
        self.assertEqual(poppler.call_args.args[0][-3:], ['-bbox-layout','fixed.pdf','-'])
