import unittest

from ingestion.generic.patterns.readings.compared_years import Reader

PROFILE = {
    'frame_heading': '支出済額',
    'left_columns': ['予算現額', '前年度予算額', 'ratio', '支出済額', '前年度決算額'],
    'right_columns': ['ratio', '不用額', '前年度／不用額'],
    'bracketed': {'不用額': '翌年度繰越額', '前年度／不用額': '前年度／翌年度繰越額'},
    'balances': {'予算現額': ['支出済額', '不用額', '翌年度繰越額'],
                 '前年度予算額': ['前年度決算額', '前年度／不用額', '前年度／翌年度繰越額']},
    'note': 'synthetic compared-year table',
}
WORKFLOW = {'reading': {'pattern': 'compared_years', 'profile': 'unused.json'}, 'components': []}


def word(page, x0, y0, x1, text):
    return {'page': page, 'xMin': x0, 'yMin': y0, 'xMax': x1, 'yMax': y0 + 9, 'text': text}


def year_line(page, y, xs):
    return [word(page, x, y, x + 11, '６' if i % 2 == 0 else '５') for i, x in enumerate(xs)]


def spread(budget='1,000', spent='700', unused='100', carried='(200)'):
    """A left page over a revenue frame, an expenditure frame, one 款 and the 合計 row; its right page."""
    left = [word(1, 50, 40, 60, '収'), word(1, 61, 40, 70, '入'), word(1, 71, 40, 80, '済'), word(1, 81, 40, 90, '額'),
            *year_line(1, 60, [140, 220, 300]),  # the revenue frame's three columns: never taken for the expenditure
            word(1, 400, 100, 410, '支'), word(1, 411, 100, 420, '出'), word(1, 421, 100, 430, '済'), word(1, 431, 100, 440, '額'),
            word(1, 40, 120, 50, '款'), *year_line(1, 120, [140, 220, 300, 400, 480]),
            word(1, 40, 150, 45, '1'), word(1, 50, 150, 80, '総務費'),
            word(1, 150, 150, 190, budget), word(1, 230, 150, 270, '900'), word(1, 300, 150, 315, '1.2'),
            word(1, 420, 150, 450, spent), word(1, 500, 150, 530, '800'),
            word(1, 40, 180, 50, '合'), word(1, 60, 180, 70, '計'),
            word(1, 150, 180, 190, budget), word(1, 230, 180, 270, '900'), word(1, 420, 180, 450, spent),
            word(1, 500, 180, 530, '800')]
    right = [*year_line(2, 120, [60, 160, 260]),
             word(2, 60, 150, 75, '9.9'),
             word(2, 150, 141, 190, carried), word(2, 170, 155, 190, unused),
             word(2, 275, 150, 295, '100'),
             word(2, 150, 180, 190, '(200)'), word(2, 170, 193, 190, unused)]
    return {1: left, 2: right}


class ComparedYearsTest(unittest.TestCase):
    def setUp(self):
        self.reader = Reader(PROFILE, WORKFLOW)

    def test_reads_the_expenditure_frame_and_the_bracketed_carry_over(self):
        rows, _, exclusions, _ = self.reader.read_spread(1, 2, spread())
        self.assertEqual(len(rows), 1)  # the 合計 row is no 款
        row = rows[0]
        self.assertEqual((row['款_番号'], row['款_名称']), ('1', '総務費'))
        self.assertEqual(row['款_予算現額'], '1,000')
        self.assertEqual(row['款_支出済額'], '700')
        self.assertEqual(row['款_不用額'], '100')
        self.assertEqual(row['款_翌年度繰越額'], '200')
        self.assertEqual(row['款_前年度／不用額'], '100')
        self.assertEqual(row['款_翌年度繰越額_物理頁'], 2)
        self.assertEqual({e['kind'] for e in exclusions}, {'数量表', '総括'})

    def test_a_short_amount_set_right_stays_in_its_column(self):
        # `778` set right in the column of the digit at 100 has its centre (145) nearer the next digit (160).
        self.assertEqual(Reader.column([100.0, 160.0], word(2, 140, 150, 150, '778')), 0)
        self.assertEqual(Reader.column([100.0, 160.0], word(2, 150, 150, 175, '4,372,917')), 1)
        self.assertIsNone(Reader.column([100.0, 160.0], word(2, 80, 150, 95, '12')))

    def test_an_amount_read_into_another_column_breaks_the_balance(self):
        with self.assertRaisesRegex(ValueError, '予算現額 ≠ 支出済額'):
            self.reader.read_spread(1, 2, spread(spent='600'))


if __name__ == '__main__':
    unittest.main()
