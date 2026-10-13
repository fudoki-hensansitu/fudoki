"""Jev recheck only adds stops; it never clears one and never guesses without an answer."""
import json
import tempfile
import unittest
from pathlib import Path

from ingestion.fiscal import manifest, run
from ingestion.lib import digit_recheck
from ingestion.lib.digit_recheck import ContextIndex, Recheck, RecheckUnavailable
from ingestion.lib.node_tables import NodeTables, check_table_coverage, write_coverage_words
from ingestion.lib.coverage_checks import check_digit_coverage


def node(key='n1', y=10., code='1', name='総務費'):
    return {'node_key': key, 'parent_node_key': None, 'axis_header': '科目', 'depth': 1,
            'level_header': '目', 'code_text': code, 'name_text': name, 'physical_page': 1,
            'x0': 0., 'y0': y, 'x1': 40., 'y1': y + 9.}


def amount(key='n1', y=10., text='100,000'):
    return {'node_key': key, 'header_path': '支出済額', 'amount_text': text, 'unit_text': '円',
            'physical_page': 1, 'x0': 100., 'y0': y, 'x1': 140., 'y1': y + 9.}


def word(text, x, y, right):
    return {'page': 1, 'bbox': [x, y, right, y + 9.], 'text': text}


class Spy:
    """Stub ask: answers by the sentence of the target, records what was asked."""

    def __init__(self, by_text=None, default=0.0):
        self.by_text, self.default, self.asked = by_text or {}, default, []

    def __call__(self, contexts):
        self.asked.extend(c['対象の数字'] for c in contexts)
        return [self.by_text.get(c['対象の数字'], self.default) for c in contexts]


def fixture():
    """One adopted amount row (band x100-140) plus the prints a recheck may or may not touch."""
    tables = NodeTables([node()], [amount()])
    words = [word('総務費', 0., 10., 40.), word('100,000', 100., 10., 140.),
             word('１０款', 200., 30., 230.),      # weak rule: code glued to characters
             word('7,777', 300., 50., 340.),        # outside every band: reported
             word('888,888', 105., 70., 135.)]      # inside the band: blocked
    return tables, words


class ContextTests(unittest.TestCase):
    def test_sentence_marks_target_and_carries_header_and_neighbours_without_coordinates(self):
        words = [(1, (0., 10., 40., 19.), '総務費'), (1, (100., 10., 140., 19.), '500'),
                 (1, (100., 30., 140., 39.), '1,234'), (1, (0., 50., 40., 59.), '備考')]
        context = ContextIndex(words, [{'header': '支出済額', 'x_range': [95., 145.]}]).context(
            1, (100., 30., 140., 39.), '1,234')
        self.assertEqual(context, {'対象の数字': '1,234', '同じ行（左から。対象は【】）': '【1,234】',
                                   '数字の列の見出し': '支出済額', 'すぐ上の行': '総務費 500', 'すぐ下の行': '備考'})
        dumped = json.dumps(context, ensure_ascii=False)
        for forbidden in ('100.0', '140.0', 'bbox', '理由'):
            self.assertNotIn(forbidden, dumped)

    def test_same_row_words_are_listed_left_to_right(self):
        words = [(1, (100., 10., 140., 19.), '30'), (1, (0., 10.5, 40., 19.5), '旅費'), (1, (50., 10., 90., 19.), '12')]
        context = ContextIndex(words).context(1, (50., 10., 90., 19.), '12')
        self.assertEqual(context['同じ行（左から。対象は【】）'], '旅費 【12】 30')


class StoreTests(unittest.TestCase):
    def test_fingerprint_changes_with_context_model_and_threshold(self):
        context = {'対象の数字': '5'}
        base = digit_recheck.fingerprint(context)
        self.assertEqual(base, digit_recheck.fingerprint(dict(context)))
        self.assertNotEqual(base, digit_recheck.fingerprint({'対象の数字': '6'}))
        self.assertNotEqual(base, digit_recheck.fingerprint(context, model='jev-9'))
        self.assertNotEqual(base, digit_recheck.fingerprint(context, threshold=0.5))

    def test_rows_round_trip_and_rerun_tables_keep_only_used_answers(self):
        existing = [{'t': 'a', 'fp': 'old', 'p': 0.1}, {'t': 'b', 'fp': 'keep', 'p': 0.2}]
        rows = digit_recheck.merged_rows(existing, {'a': {'new': 0.69999}})
        self.assertEqual(rows, [{'t': 'a', 'fp': 'new', 'p': 0.69999}, {'t': 'b', 'fp': 'keep', 'p': 0.2}])
        # One fingerprint has one answer: another table's row follows a re-asked value.
        again = digit_recheck.merged_rows(rows, {'c': {'keep': 0.9}})
        self.assertEqual({r['p'] for r in again if r['fp'] == 'keep'}, {0.9})
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'x.digit-recheck.jsonl'
            digit_recheck.write_store(path, rows)
            first = path.read_text()
            self.assertEqual(digit_recheck.read_store(path), rows)
            digit_recheck.write_store(path, rows)
            self.assertEqual(path.read_text(), first)
            header = json.loads(first.splitlines()[0])
            for field in ('model', 'instructions', 'criteria', 'threshold'):
                self.assertIn(field, header)

    def test_store_sits_beside_the_manifest_and_is_not_a_manifest(self):
        target = {'jurisdiction': '131001', 'fiscal_year': 2025, 'document_kind': 'settlement'}
        path = run.recheck_store_path({'target': target, 'direction': 'expenditure'})
        self.assertEqual(path.name, 'expenditure.digit-recheck.jsonl')
        self.assertEqual(path.parent, manifest.manifest_path(target, 'expenditure').parent)
        self.assertFalse(path.match('*.json'))


class StopOnlyTests(unittest.TestCase):
    def test_replay_never_calls_the_api(self):
        tables, words = fixture()
        spy = Spy({'１０款': 0.9})
        first = Recheck(ask=spy)
        result = check_digit_coverage(words, tables, recheck=first)
        stored = {fp: p for fp, p in result['jev']['answers'].items()}
        self.assertEqual(len(stored), 2)

        def refuse(contexts):
            raise AssertionError('the API must not be called on replay')
        replay = check_digit_coverage(words, tables, recheck=Recheck(stored, ask=refuse))
        def stops(r):
            return [u for u in r['uncovered'] if u.get('rule')]
        self.assertEqual(stops(replay), stops(result))
        self.assertEqual(replay['counts'], result['counts'])
        self.assertEqual(replay['passed'], result['passed'])

    def test_missing_answers_without_a_key_stop_instead_of_being_skipped(self):
        tables, words = fixture()[0], [w for w in fixture()[1] if w['text'] != '888,888']
        with self.assertRaises(RecheckUnavailable):
            check_digit_coverage(words, tables, recheck=Recheck({}, ask=None))
        with tempfile.TemporaryDirectory() as directory:
            wide = Path(directory) / 't.parquet'
            write_coverage_words(wide, words)
            with self.assertRaises(ValueError):
                check_table_coverage(wide, tables, recheck=Recheck({}, ask=None))

    def test_probability_at_threshold_stops_weak_and_reported_digits(self):
        tables, words = fixture()
        words = [w for w in words if w['text'] != '888,888']
        result = check_digit_coverage(words, tables, recheck=Recheck(ask=Spy({'１０款': 0.7, '7,777': 0.95})))
        self.assertFalse(result['passed'])
        stops = {u['text']: u for u in result['uncovered']}
        self.assertEqual(set(stops), {'１０款', '7,777'})
        self.assertEqual(stops['１０款']['rule'], 'non_amount')
        self.assertEqual(stops['7,777']['rule'], 'reported')
        self.assertEqual(result['counts']['jev_blocked'], 2)

    def test_low_probability_clears_nothing(self):
        tables, words = fixture()
        words = [w for w in words if w['text'] != '888,888']
        plain = check_digit_coverage(words, tables)
        result = check_digit_coverage(words, tables, recheck=Recheck(ask=Spy(default=0.69)))
        self.assertTrue(result['passed'])
        self.assertEqual(result['counts'], plain['counts'])
        self.assertEqual([r['text'] for r in result['reported']], ['7,777'])

    def test_a_digit_blocked_in_the_band_is_never_cleared_by_jev(self):
        tables, words = fixture()
        spy = Spy(default=0.0)
        result = check_digit_coverage(words, tables, recheck=Recheck(ask=spy))
        blocked = [u for u in result['uncovered'] if u['text'] == '888,888']
        self.assertEqual(len(blocked), 1)
        self.assertFalse(result['passed'])
        self.assertNotIn('rule', blocked[0])      # stopped by the band, not by Jev
        self.assertEqual(blocked[0]['jev'], 0.0)  # the answer is only a hint

    def test_blocked_digit_without_key_keeps_its_own_reason(self):
        tables, words = fixture()
        result = check_digit_coverage(words, tables, recheck=Recheck({}, ask=None))
        self.assertEqual([u['text'] for u in result['uncovered']], ['888,888'])

    def test_only_weak_and_out_of_band_digits_are_asked(self):
        nodes = [node('n1', 10.), node('n2', 30., code='2', name='民生費')]
        amounts = [amount('n1', 10.), amount('n2', 30., '200,000')]
        words = [word('総務費', 0., 10., 40.), word('100,000', 100., 10., 140.),   # label, amount
                 word('2', 0., 30., 6.), word('民生費', 8., 30., 40.), word('200,000', 100., 30., 140.),
                 word('歳出合計', 0., 50., 40.), word('300,000', 100., 50., 140.),  # control total
                 word('１０款', 200., 70., 230.), word('7,777', 300., 90., 340.)]
        spy = Spy()
        check_digit_coverage(words, NodeTables(nodes, amounts), recheck=Recheck(ask=spy),
                             exclusions=[{'kind': '本文', 'reason': 't', 'page': 1, 'bbox': [290., 85., 350., 105.]}])
        self.assertEqual(sorted(spy.asked), ['１０款'])   # 7,777 sits in a declared exclusion

    def test_subject_code_printed_with_its_level_mark_is_a_label_and_never_asked(self):
        subject = dict(node('k1', code='1', name='償還金'), level_header='項')
        tables = NodeTables([subject], [amount('k1')])
        words = [word('1項', 0., 10., 18.), word('償還金', 20., 10., 40.), word('100,000', 100., 10., 140.),
                 word('（項）1', 0., 30., 18.)]
        spy = Spy(default=0.99)
        # （項）1 is not inside the node's box, so only 1項 is explained by the node.
        result = check_digit_coverage(words, tables, recheck=Recheck(ask=spy))
        self.assertEqual(result['counts'].get('label'), 1)
        self.assertEqual([u['text'] for u in result['uncovered']], ['（項）1'])

    def test_a_level_mark_of_another_code_stays_a_question(self):
        subject = dict(node('k1', code='1', name='償還金'), level_header='項')
        tables = NodeTables([subject], [amount('k1')])
        words = [word('2項', 0., 10., 18.), word('100,000', 100., 10., 140.)]
        spy = Spy(default=0.0)
        check_digit_coverage(words, tables, recheck=Recheck(ask=spy))
        self.assertEqual(spy.asked, ['2項'])

    def test_a_decision_number_is_explained_by_its_form_and_never_asked(self):
        tables = NodeTables([node()], [amount()])
        words = [word('令和', 200., 30., 215.), word('７', 216., 30., 222.), word('年', 223., 30., 229.),
                 word('第', 230., 30., 236.), word('７', 237., 30., 243.), word('号', 244., 30., 250.),
                 word('7,777', 300., 50., 340.)]
        spy = Spy(default=0.99)
        result = check_digit_coverage(words, tables, recheck=Recheck(ask=spy))
        self.assertEqual(spy.asked, ['7,777'])
        self.assertTrue(result['passed'] is False)  # 7,777 is stopped by its Jev answer; the number is not
        self.assertEqual([u['text'] for u in result['uncovered']], ['7,777'])

    def test_a_split_decision_number_fragment_is_not_asked(self):
        tables = NodeTables([node()], [amount()])
        words = [word('第', 230., 30., 236.), word('7号', 237., 30., 250.), word('7,777', 300., 50., 340.)]
        spy = Spy()
        check_digit_coverage(words, tables, recheck=Recheck(ask=spy))
        self.assertEqual(spy.asked, ['7,777'])

    def test_verify_store_never_asks_and_stops_on_a_missing_answer(self):
        with tempfile.TemporaryDirectory() as directory:
            recheck = Recheck.from_store(Path(directory) / 'none.jsonl', environ={'TYPESAFE_API_KEY': 'x'},
                                         ask_missing=False)
            self.assertIsNone(recheck.ask)
            with self.assertRaises(RecheckUnavailable):
                recheck.answers([{'対象の数字': '5'}])

    def test_missing_questions_are_batched_in_fingerprint_order(self):
        seen = []

        def capture(contexts):
            seen.append([c['対象の数字'] for c in contexts])
            return [0.1] * len(contexts)
        recheck = Recheck(ask=capture)
        contexts = [{'対象の数字': t} for t in ('c', 'a', 'b')]
        recheck.answers(contexts)
        expected = [c['対象の数字'] for c in sorted(contexts, key=recheck.fingerprint)]
        self.assertEqual(seen, [expected])

    def test_take_used_returns_required_answers_once(self):
        recheck = Recheck(ask=Spy(default=0.2))
        context = {'対象の数字': '5'}
        recheck.answers([context])
        recheck.answers([{'対象の数字': 'hint'}], required=False)
        self.assertEqual(recheck.take_used(), {recheck.fingerprint(context): 0.2})
        self.assertEqual(recheck.take_used(), {})

    def test_each_question_carries_no_rule_reason(self):
        tables, words = fixture()
        seen = []

        def capture(contexts):
            seen.extend(contexts)
            return [0.0] * len(contexts)
        check_digit_coverage(words, tables, recheck=Recheck(ask=capture))
        self.assertTrue(seen)
        for context in seen:
            self.assertEqual(set(context), {'対象の数字', '同じ行（左から。対象は【】）', '数字の列の見出し',
                                            'すぐ上の行', 'すぐ下の行'})


if __name__ == '__main__':
    unittest.main()
