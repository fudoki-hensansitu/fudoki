"""評価の結果の合計の行の読み方。捻出額（予算削減額）と A〜D の数を取り違えると、やめた事業の節の数字が全部ずれる。"""
import unittest

from ingestion.project.layouts.shinagawa_result import parse


class ParseTest(unittest.TestCase):
    def test_reads_the_total_row_and_the_grade_counts_above_it(self):
        lines = [(4, ' 15    監査委員事務局         1              0           1           0            0           22'),
                 (4, '                              16           339         271         26'),
                 (4, '            合計       652                                                       1,522,098'),
                 (4, '                            （2.5％）       （52.0％）     （41.6%）     （4.0%）')]
        result = parse(lines)
        self.assertEqual((result.page, result.evaluated_count, result.reduced_thousand), (4, 652, 1522098))
        self.assertEqual(result.grade_counts, {'A': 16, 'B': 339, 'C': 271, 'D': 26})

    def test_older_label_reads_the_same(self):
        lines = [(6, '                      40       262     324     39'),
                 (6, '    全体集計       665                                    2,364,986')]
        self.assertEqual(parse(lines).reduced_thousand, 2364986)

    def test_grade_counts_that_do_not_add_up_stop(self):
        lines = [(4, '16 339 271 25'), (4, '合計 652 1,522,098')]
        with self.assertRaisesRegex(ValueError, '和'):
            parse(lines)

    def test_a_second_total_row_stops(self):
        lines = [(4, '1 1 1 1'), (4, '合計 4 10'), (5, '1 1 1 1'), (5, '合計 4 10')]
        with self.assertRaisesRegex(ValueError, '2 個'):
            parse(lines)
