"""Hierarchy sum checks against printed parent amounts, on small synthetic tables."""
import unittest

from ingestion.fiscal.sum_check import parse_amount, verify_tables


def table(columns, *rows):
    return [dict(zip(columns, row)) for row in rows]


def document(*idents):
    return {'tables': [{'table_id': ident} for ident in idents]}


def run(rows, checks, others=None):
    tables = {'t': rows, **(others or {})}
    return verify_tables(document(*tables), {'t': checks}, tables.__getitem__, {})[0]


# 目 printed once and repeated on every 節 row; 節 identified by its printed position.
COLUMNS = ['目_番号', '目_頁', '目_計', '節_番号', '節_頁', '節_金額']
SETSU = {'name': '節→目', 'parent': {'key': ['目_番号', '目_頁']}, 'child': {'key': ['節_番号', '節_頁']},
         'columns': [['目_計', '節_金額']]}


class ParseAmountTest(unittest.TestCase):
    def test_printed_layout_is_ignored_but_absent_or_ambiguous_text_is_not_an_amount(self):
        cases = {'1,234,567': 1234567, '△1,000': -1000, '▲ 2,000': -2000, '-6,000,000': -6000000,
                 '1,959,393, 091': 1959393091, '774,472,949 円': 774472949, '円\n174,501,657': 174501657,
                 '(836,078)': 836078, '０': 0, '0': 0}
        for text, expected in cases.items():
            with self.subTest(text=text):
                self.assertEqual(parse_amount(text), expected)
        for text in (None, '', '－', '103,371,120,00', '繰越明許費', '1,000 千円'):
            with self.subTest(text=text):
                self.assertIsNone(parse_amount(text))


class SumCheckTest(unittest.TestCase):
    def test_repeated_parent_counts_once_and_equal_children_are_not_merged(self):
        rows = table(COLUMNS, ('1', 10, '300', '1', 10, '100'), ('1', 10, '300', '2', 10, '100'),
                     ('1', 10, '300', '3', 11, '100'))
        result = run(rows, [SETSU])
        self.assertEqual(result['status'], '一致')
        self.assertEqual(result['results'][0]['child_sum'], 300)

    def test_mismatch_reports_the_difference(self):
        rows = table(COLUMNS, ('1', 10, '300', '1', 10, '100'), ('1', 10, '300', '2', 10, '150'))
        found = run(rows, [SETSU])['results'][0]
        self.assertEqual((found['status'], found['difference']), ('不一致', -50))

    def test_inconsistent_repeats_of_one_printed_cell_are_mismatches(self):
        rows = table(COLUMNS, ('1', 10, '300', '1', 10, '100'), ('1', 10, '301', '2', 10, '200'))
        found = run(rows, [SETSU])['results'][0]
        self.assertEqual((found['status'], found['reason']), ('不一致', '親の反復値が一致しない'))

    def test_blank_child_is_pending_unless_declared_unprinted(self):
        rows = table(COLUMNS, ('1', 10, '300', '1', 10, '300'), ('1', 10, '300', '2', 10, None))
        self.assertEqual(run(rows, [SETSU])['results'][0]['reason'], '子の金額が空欄・未読')
        declared = {**SETSU, 'child': {**SETSU['child'], 'blank': [{'where': {'節_番号': '2'}, 'reason': '印字なし'}]}}
        found = run(rows, [declared])['results'][0]
        self.assertEqual((found['status'], found['reason']), ('検算不可', '印字なし'))
        self.assertNotIn('child_sum', found)

    def test_blank_parent_is_uncheckable_only_when_children_are_confirmed_unprinted(self):
        rows = table(COLUMNS, ('1', 10, None, '1', 10, None))
        self.assertEqual(run(rows, [SETSU])['results'][0]['status'], '保留')
        declared = {**SETSU, 'child': {**SETSU['child'], 'blank': [{'reason': '印字なし'}]}}
        found = run(rows, [declared])['results'][0]
        self.assertEqual((found['status'], found['reason']), ('検算不可', '親・子とも金額が空欄'))
        rows = table(COLUMNS, ('1', 10, None, '1', 10, '5'))
        self.assertEqual(run(rows, [declared])['results'][0]['status'], '保留')

    def test_child_owned_by_two_parents_is_pending_and_parentless_children_are_reported(self):
        rows = table(COLUMNS, ('1', 10, '100', '1', 10, '100'), ('2', 12, '100', '1', 10, '100'))
        self.assertEqual(run(rows, [SETSU])['results'][0]['reason'], '子の所属が一意でない')
        check = {**SETSU, 'parent': {**SETSU['parent'], 'where': {'目_番号': '1'}}}
        rows = table(COLUMNS, ('1', 10, '100', '1', 10, '100'), ('2', 12, '100', '1', 12, '100'))
        self.assertEqual(run(rows, [check])['results'][-1]['reason'], '親が見つからない子がある')

    def test_rows_without_the_parent_kind_are_not_children(self):
        rows = table(COLUMNS, ('1', 10, '100', '1', 10, '100'), (None, None, None, '9', 30, '7'))
        self.assertEqual(run(rows, [SETSU])['status'], '一致')

    def test_child_kinds_add_up_and_leaves_can_be_skipped(self):
        columns = ['事業_位置', '事業_金額', '内訳_位置', '内訳_金額', '内表_位置', '内表_金額']
        rows = table(columns, (1, '60', 2, '10', None, None), (1, '60', None, None, 3, '50'),
                     (9, '5', None, None, None, None))
        check = {'name': '内訳・内表→事業', 'parent': {'key': ['事業_位置']}, 'columns': [['事業_金額', '内訳_金額']],
                 'child': [{'key': ['内訳_位置']}, {'key': ['内表_位置'], 'columns': ['内表_金額']}]}
        self.assertEqual(run(rows, [check])['counts'], {'一致': 1, '検算不可': 1})
        self.assertEqual(run(rows, [{**check, 'skip_leaves': True}])['counts'], {'一致': 1})

    def test_excerpt_explains_only_a_shortfall(self):
        rows = table(COLUMNS, ('1', 10, '300', '1', 10, '100'), ('2', 12, '50', '1', 12, '80'))
        found = run(rows, [{**SETSU, 'excerpt': '主な内訳だけを印字'}])['results']
        self.assertEqual([(item['status'], item.get('reason')) for item in found],
                         [('検算不可', '主な内訳だけを印字'), ('不一致', None)])

    def test_parent_in_another_table_links_by_declared_child_columns(self):
        summary = table(['款', '項', '支出済額'], ('1', '1', '30'))
        detail = table(['款_番号', '項_番号', '項_頁', '項_支出済額'], ('1', '1', 5, '30'), ('1', '1', 5, '30'))
        check = {'name': '款項表の項＝明細書の項', 'parent': {'key': ['款', '項']},
                 'child': {'table': 'detail', 'key': ['項_番号', '項_頁'], 'parent_key': ['款_番号', '項_番号']},
                 'columns': [['支出済額', '項_支出済額']]}
        self.assertEqual(run(summary, [check], {'detail': detail})['status'], '一致')

    def test_declarations_must_reference_real_columns_and_every_table_declares_its_checks(self):
        rows = table(COLUMNS, ('1', 10, '300', '1', 10, '300'))
        broken = {**SETSU, 'columns': [['目_計', '節_支出済額']]}
        self.assertEqual(run(rows, [broken])['status'], '宣言不整合')
        self.assertEqual(verify_tables(document('t'), None, {'t': rows}.__getitem__, {})[0]['status'], '未宣言')
        uncheckable = run(rows, [{'name': '注記', 'uncheckable': '金額の階層がない'}])
        self.assertEqual((uncheckable['status'], uncheckable['results'][0]['reason']), ('検算不可', '金額の階層がない'))


if __name__ == '__main__':
    unittest.main()
