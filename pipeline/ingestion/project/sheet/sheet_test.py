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
        'grades': {'成果拡大': 'A', '見直し|縮小': 'C', '現状維持': 'B'},
    }

    def test_fields(self):
        text = sheet.norm('事業名 広報\n活動 課\n予算 1,500\n決算 2\n方向 成果拡大に向けて見直し')
        got = sheet.parse(text, 3, self.WORKFLOW)
        self.assertEqual(got.name, '広報活動')
        self.assertEqual(got.budget_yen, 1_500)
        self.assertEqual(got.settled_yen, 2_000)
        self.assertEqual((got.grade_code, got.grade_label), ('A', '成果拡大に向けて見直し'))

    def test_unmapped_grade_is_empty_and_missing_name_is_skipped(self):
        got = sheet.parse('事業名 X\nY 課\n方向 その他', 1, self.WORKFLOW)
        self.assertEqual((got.grade_code, got.grade_label), (None, 'その他'))
        self.assertIsNone(sheet.parse('方向 縮小', 2, self.WORKFLOW))


if __name__ == '__main__':
    unittest.main()
