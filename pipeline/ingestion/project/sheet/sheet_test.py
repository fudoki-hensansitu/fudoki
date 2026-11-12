import unittest

from ingestion.project import sheet


class AmountTest(unittest.TestCase):
    def test_units_and_signs(self):
        self.assertEqual(sheet.amount('1,234', '千円'), 1_234_000)
        self.assertEqual(sheet.amount('1,234', '円'), 1_234)
        self.assertEqual(sheet.amount('▲1,234', '円'), -1_234)
        self.assertEqual(sheet.amount('△5', '千円'), -5_000)
        self.assertIsNone(sheet.amount('―', '円'))
        self.assertIsNone(sheet.amount(None, '円'))


class ParseTest(unittest.TestCase):
    WORKFLOW = {
        'fields': [
            '^事業名 (?P<name>.+)\\n(?P<name_more>.+) 課$',
            {'pattern': '^予算 (?P<budget>[\\d,]+)', 'unit': '円'},
            '^決算 (?P<settled>[\\d,]+)',
            '^方向 (?P<grade>\\S+)',
        ],
        'unit': '千円',
    }

    def test_fields(self):
        text = sheet.norm('事業名 広報\n活動 課\n予算 1,500\n決算 2\n方向 成果拡大に向けて見直し')
        got = sheet.parse(text, 3, self.WORKFLOW)
        self.assertEqual(got.name, '広報活動')
        self.assertEqual(got.budget_yen, 1_500)
        self.assertEqual(got.settled_yen, 2_000)
        self.assertEqual(got.grade_label, '成果拡大に向けて見直し')

    def test_missing_name_is_skipped(self):
        self.assertIsNone(sheet.parse('方向 縮小', 2, self.WORKFLOW))



class DirectionTest(unittest.TestCase):
    def test_default_order(self):
        cases = {'対象・規模等の拡大': 'expand', '事業の廃止等に向けた検討': 'consider_end', '取組みの一部廃止': 'reduce',
                 '成果拡大に向けて見直し': 'improve', '整理・統合に向けて見直し': 'merge', '休止・完了': 'complete',
                 '事業の廃止': 'end', '重点的に推進': 'expand', '維持・推進': 'keep', 'その他・対象外': None, None: None}
        for text, code in cases.items():
            self.assertEqual(sheet.direction_code(text), code, text)

    def test_overrides_come_first(self):
        self.assertEqual(sheet.direction_code('E', {'^E$': 'keep'}), 'keep')
        with self.assertRaises(ValueError):
            sheet.direction_code('X', {'X': 'unknown'})

if __name__ == '__main__':
    unittest.main()
