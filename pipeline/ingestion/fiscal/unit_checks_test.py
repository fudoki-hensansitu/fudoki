"""The unit check: the 款 sum against the printed 歳出合計, on any converter's finished table."""
import unittest

from ingestion.fiscal import unit_checks
from ingestion.lib.tree_checks import check_tree


def node(key, parent, level, name, axis='款項目', depth=1):
    return {'node_key': key, 'parent_node_key': parent, 'axis_header': axis, 'depth': depth, 'level_header': level,
            'code_text': key[-1], 'name_text': name, 'physical_page': 1, 'x0': 10.0, 'y0': 10.0, 'x1': 40.0, 'y1': 20.0}


def amount(key, text, unit='円', header='支出済額'):
    return {'node_key': key, 'header_path': header, 'amount_text': text, 'unit_text': unit,
            'physical_page': 1, 'x0': 300.0, 'y0': 10.0, 'x1': 360.0, 'y1': 20.0}


def table(*kan, unit='円'):
    """One 款 with one 項 each (the 項 repeats its 款's amount), the axis named like a legacy converter does."""
    nodes, amounts = [], []
    for index, text in enumerate(kan, 1):
        nodes += [node(f'k{index}', None, '款', f'款{index}'), node(f'k{index}-1', f'k{index}', '項', f'項{index}', depth=2)]
        amounts += [amount(f'k{index}', text, unit), amount(f'k{index}-1', text, unit)]
    return nodes, amounts


def scope(*fragments, label=('歳', '出', '合', '計'), page=1):
    """A coverage scope with one 歳出合計 row: the label's characters, then the number fragments `(text, x0, x1)`."""
    words = [{'page': page, 'bbox': [20.0 + 12 * index, 700.0, 30.0 + 12 * index, 710.0], 'text': char}
             for index, char in enumerate(label)]
    words += [{'page': page, 'bbox': [x0, 700.0, x1, 710.0], 'text': text} for text, x0, x1 in fragments]
    return {'words': words, 'amount_columns': [{'header': '支出済額', 'x_range': [95.0, 438.0]}]}


class UnitCheckTest(unittest.TestCase):
    def test_settlement_needs_a_kan_axis_even_when_the_tree_and_digits_pass(self):
        nodes = [node('detail', None, None, '説明', axis='備考')]
        amounts = [amount('detail', '10', header='備考')]
        self.assertTrue(check_tree(nodes, amounts)['passed'])
        for partial in (False, True):
            with self.subTest(partial=partial):
                result = unit_checks.check_table(nodes, amounts, document_kind='settlement',
                                                 account='介護保険特別会計', partial=partial)
                self.assertEqual(result['status'], 'stopped')
                self.assertIn('款の科目軸がない', unit_checks.describe(result))

    def test_budget_amounts_cannot_stand_in_for_executed_subject_amounts(self):
        nodes, amounts = table('100,000,000')
        nodes.append(node('m1', 'k1-1', '目', '事業', depth=3))
        amounts.append(amount('m1', '100,000,000'))
        for a in amounts:
            a['header_path'] = '予算現額'
        self.assertTrue(check_tree(nodes, amounts)['passed'])
        result = unit_checks.check_table(nodes, amounts, document_kind='settlement', account='一般会計')
        self.assertEqual(result['status'], 'stopped')
        self.assertEqual(result['subject_check']['executed_moku'], 0)
        self.assertIn('款の支出済額がない', unit_checks.describe(result))
        self.assertIn('目の支出済額が過半に満たない（0/1）', unit_checks.describe(result))

    def test_moku_requires_more_than_half_and_counts_printed_zero_once(self):
        nodes, amounts = table('100,000,000')
        nodes += [node(f'm{i}', 'k1-1', '目', f'事業{i}', depth=3) for i in range(4)]
        amounts += [amount('m0', '100,000,000'), amount('m1', '0'), amount('m1', '0')]
        result = unit_checks.check_table(nodes, amounts, document_kind='settlement', account='一般会計')
        self.assertEqual((result['status'], result['subject_check']['executed_moku']), ('stopped', 2))
        amounts += [amount('m2', '0')]
        result = unit_checks.check_table(nodes, amounts, document_kind='settlement', account='一般会計')
        self.assertEqual((result['status'], result['subject_check']['executed_moku']), ('digits', 3))

    def test_another_axis_and_annotations_do_not_fill_a_subjects_missing_amount(self):
        nodes, amounts = table('100,000,000')
        nodes += [node('m1', 'k1-1', None, '事業', depth=3),
                  node('note', 'm1', '目', '注記', axis='注記', depth=3)]
        amounts += [amount('m1', '100,000,000', header='不用額'), amount('note', '100,000,000')]
        result = unit_checks.check_table(nodes, amounts, document_kind='settlement', account='一般会計')
        self.assertEqual((result['status'], result['subject_check']['moku'],
                          result['subject_check']['executed_moku']), ('stopped', 1, 0))
        amounts.append(amount('m1', '100,000,000'))
        self.assertEqual(unit_checks.check_table(nodes, amounts, document_kind='settlement',
                                                 account='一般会計')['status'], 'digits')

    def test_initial_budget_does_not_require_executed_amounts(self):
        nodes, amounts = table('100,000', unit='千円')
        for a in amounts:
            a['header_path'] = '本年度予算額'
        result = unit_checks.check_table(nodes, amounts, document_kind='initial', account='一般会計')
        self.assertFalse(result['stopped'])
        self.assertFalse(result['subject_check']['applicable'])

    def test_revenue_does_not_get_the_new_expenditure_gate(self):
        nodes, amounts = table('100,000,000')
        nodes.append(node('m1', 'k1-1', '目', '収入', depth=3))
        for a in amounts:
            a['header_path'] = '予算現額'
        result = unit_checks.check_table(nodes, amounts, document_kind='settlement', account='一般会計',
                                         direction='revenue')
        self.assertFalse(result['subject_check']['applicable'])
        self.assertFalse(result['stopped'])

    def test_a_missing_axis_is_stopped_as_a_missing_subject_axis(self):
        from ingestion.fiscal.subject_checks import check_subject
        nodes, amounts = table('100,000,000')
        for n in nodes:
            del n['axis_header']
        result = check_subject(nodes, amounts, 'settlement')
        self.assertFalse(result['passed'])
        self.assertEqual(result['kan'], 0)

    def test_declared_enterprise_form_keeps_tree_and_unit_checks(self):
        nodes, amounts = table('100,000,000')
        for a in amounts:
            a['header_path'] = '金額（円）'
        ordinary = unit_checks.check_table(nodes, amounts, document_kind='settlement', account='下水道事業会計')
        enterprise = unit_checks.check_table(nodes, amounts, document_kind='settlement', account='下水道事業会計',
                                            statement_kind='public-enterprise')
        self.assertTrue(ordinary['stopped'])
        self.assertFalse(enterprise['stopped'])
        self.assertFalse(enterprise['subject_check']['applicable'])
        self.assertTrue(check_tree(nodes, amounts)['passed'])
        amounts[-1]['amount_text'] = '99,999,999'
        self.assertFalse(check_tree(nodes, amounts)['passed'])
        # The declaration exempts only subject presence; a comparable unit mismatch still stops.
        nodes, amounts = table('100,000,000')
        result = unit_checks.check_table(nodes, amounts, document_kind='settlement', account='下水道事業会計',
                                         statement_kind='public-enterprise', scope=scope(('1', 300.0, 360.0)))
        self.assertTrue(result['stopped'])

    def test_kan_sum_equal_to_the_printed_total_matches(self):
        nodes, amounts = table('100,000,000', '50,000,000')
        # The text layer cuts one number into fragments inside its column.
        result = unit_checks.check_table(nodes, amounts, document_kind='settlement', account='一般会計',
                                         scope=scope(('150,000,', 300.0, 340.0), ('000', 341.0, 360.0)))
        self.assertEqual((result['status'], result['printed_total'], result['kan_sum']), ('matched', 150_000_000, 150_000_000))
        self.assertFalse(result['stopped'])

    def test_one_thousand_fold_mistake_passes_the_tree_check_and_stops_here(self):
        # A table read in 円 whose original prints 千円: every parent equals its children, only the total shows it.
        nodes, amounts = table('100,000,000', '50,000,000')
        self.assertTrue(check_tree(nodes, amounts)['passed'])
        result = unit_checks.check_table(nodes, amounts, document_kind='settlement', account='介護保険特別会計',
                                         scope=scope(('150,000', 300.0, 360.0)))
        self.assertEqual(result['status'], 'stopped')
        self.assertIn('印字の歳出合計 150,000', unit_checks.describe(result))

    def test_a_general_account_without_a_printed_total_is_stopped_on_the_digits(self):
        nodes, amounts = table('100,000', '50,000')
        result = unit_checks.check_table(nodes, amounts, document_kind='settlement', account='一般会計')
        self.assertEqual(result['status'], 'stopped')
        self.assertIs(result['digits_ok'], False)
        nodes, amounts = table('100,000,000', '50,000,000')
        self.assertEqual(unit_checks.check_table(nodes, amounts, document_kind='settlement', account='一般会計')['status'],
                         'digits')

    def test_a_special_account_without_a_printed_total_is_unchecked_not_stopped(self):
        nodes, amounts = table('100,000', '50,000')
        result = unit_checks.check_table(nodes, amounts, document_kind='settlement', account='国民健康保険特別会計')
        self.assertEqual((result['status'], result['stopped']), ('unchecked', False))

    def test_a_volume_of_an_account_is_reported_and_never_stopped(self):
        nodes, amounts = table('100,000,000')
        result = unit_checks.check_table(nodes, amounts, document_kind='settlement', account='一般会計', partial=True,
                                         scope=scope(('999,999,999', 300.0, 360.0)))
        self.assertEqual((result['status'], result['stopped'], result['sum_matches']), ('partial', False, False))

    def test_a_number_is_placed_by_the_款_amounts_above_it_not_by_declared_columns(self):
        nodes, amounts = table('100,000,000')
        found = unit_checks.printed_totals(scope(('1,234', 100.0, 140.0), ('100,000,000', 300.0, 360.0)), nodes, amounts)
        self.assertEqual([(item['text'], item['header'], item['unit']) for item in found], [('100,000,000', '支出済額', '円')])
        # The converter's declared columns are not read: one box for a whole group of columns names no header.
        wide = scope(('100,000,000', 300.0, 360.0))
        wide['amount_columns'] = [{'header': 'x', 'x_range': [0.0, 1000.0]}]
        self.assertEqual(len(unit_checks.printed_totals(wide, nodes, amounts)), 1)

    def test_a_number_no_amount_aligns_with_is_left_out_and_never_stops_the_table(self):
        # The number's right edge lines up with no 款 amount: nothing is placed, so nothing is compared.
        nodes, amounts = table('100,000,000')
        elsewhere = scope(('7,000,000,000', 100.0, 200.0))
        self.assertEqual(unit_checks.printed_totals(elsewhere, nodes, amounts), [])
        result = unit_checks.check_table(nodes, amounts, document_kind='settlement', account='国民健康保険特別会計',
                                         scope=elsewhere)
        self.assertEqual((result['status'], result['stopped']), ('unchecked', False))

    def test_a_total_on_a_page_of_its_own_is_placed_by_the_columns_of_the_other_pages(self):
        nodes, amounts = table('100,000,000')
        found = unit_checks.printed_totals(scope(('100,000,000', 300.0, 360.0), page=2), nodes, amounts)
        self.assertEqual([(item['page'], item['header']) for item in found], [(2, '支出済額')])

    def test_the_amounts_of_a_spread_go_on_across_the_right_page_on_the_same_baseline(self):
        nodes, amounts = table('100,000,000')
        left = scope(('50,000,000', 100.0, 160.0))        # the label and a budget number, page 1
        right = scope(('100,000,000', 300.0, 360.0), label=('－',), page=2)   # numbers only, page 2
        both = {'words': left['words'] + right['words']}
        found = unit_checks.printed_totals(both, nodes, amounts)
        self.assertEqual([item['text'] for item in found], ['100,000,000'])
        # A page that prints a name of its own is a row of its own, not the rest of the total.
        named = scope(('100,000,000', 300.0, 360.0), label=('議', '会', '費'), page=2)
        self.assertEqual(unit_checks.printed_totals({'words': left['words'] + named['words']}, nodes, amounts), [])
        # The kind word of a stacked carry-over cell on the total's line (`継続` `費逓次繰越`) is no name.
        stacked = scope(('100,000,000', 300.0, 360.0), label=('継続', '費逓次繰越'), page=2)
        found = unit_checks.printed_totals({'words': left['words'] + stacked['words']}, nodes, amounts)
        self.assertEqual([item['text'] for item in found], ['100,000,000'])

    def test_two_different_totals_of_the_reported_phase_are_not_compared(self):
        nodes, amounts = table('100,000,000')
        first = scope(('100,000,000', 300.0, 360.0))
        second = scope(('46,053,000,000', 300.0, 360.0), page=2)
        second['words'] = [{**w, 'bbox': [w['bbox'][0], 400.0, w['bbox'][2], 410.0]} for w in second['words']]
        result = unit_checks.check_table(nodes, amounts, document_kind='settlement', account='国民健康保険特別会計',
                                         scope={'words': first['words'] + second['words']})
        self.assertEqual((result['status'], result['printed_totals'], result['ambiguous_totals']), ('unchecked', 0, True))

    def test_two_columns_are_not_joined_into_one_number(self):
        nodes, amounts = table('100,000,000')
        found = unit_checks.printed_totals(scope(('0', 280.0, 290.0), ('100,000,000', 300.0, 360.0)), nodes, amounts)
        self.assertEqual([item['text'] for item in found], ['100,000,000'])

    def test_a_row_without_the_total_label_is_not_a_total(self):
        nodes, amounts = table('100,000,000')
        found = unit_checks.printed_totals(scope(('7,000', 300.0, 360.0), label=('合', '計')), nodes, amounts)
        self.assertEqual(found, [])

    def test_the_converter_names_the_subject_axis_freely(self):
        for axis in ('科目', '款項', '款項目'):
            nodes, amounts = table('100,000,000')
            for item in nodes:
                item['axis_header'] = axis
            with self.subTest(axis=axis):
                result = unit_checks.check_table(nodes, amounts, document_kind='settlement', account='一般会計',
                                                 scope=scope(('100,000,000', 300.0, 360.0)))
                self.assertEqual((result['status'], result['kan_sum']), ('matched', 100_000_000))

    def test_a_scope_is_found_by_the_table_id_and_two_of_one_name_are_refused(self):
        import json
        import tempfile
        from pathlib import Path
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / 'a').mkdir()
            self.assertIsNone(unit_checks.find_scope(root, 'one'))
            (root / 'a/one.coverage.json').write_text(json.dumps({'words': []}))
            self.assertEqual(unit_checks.find_scope(root, 'one'), {'words': []})
            (root / 'one.coverage.json').write_text('{}')
            with self.assertRaisesRegex(ValueError, 'Several coverage scopes'):
                unit_checks.find_scope(root, 'one')


if __name__ == '__main__':
    unittest.main()
