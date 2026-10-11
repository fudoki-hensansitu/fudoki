"""Tests for the shared printed-amount reading (ingestion and dbt staging agree)."""
import re
import unittest
from pathlib import Path

from shared.amount import FISCAL_YEAR_PATTERN, is_fiscal_year_notation, number, parse_amount


class AmountTest(unittest.TestCase):
    def test_plain_and_grouped(self):
        self.assertEqual(parse_amount('754,711,008'), 754711008)
        self.assertEqual(parse_amount('0'), 0)

    def test_minus_signs(self):
        self.assertEqual(parse_amount('△1,000'), -1000)
        self.assertEqual(parse_amount('▲500'), -500)

    def test_layout_is_ignored(self):
        self.assertEqual(parse_amount('(767,030,000)'), 767030000)
        self.assertEqual(parse_amount('<751,607,601>'), 751607601)
        self.assertEqual(parse_amount('円\n174,501,657'), 174501657)
        self.assertEqual(parse_amount('174,501,657円'), 174501657)

    def test_dash_reads_as_zero_only_through_number(self):
        for dash in ('－', '―', '—', '-', 'ー'):
            self.assertEqual(number(dash), 0)
            self.assertIsNone(parse_amount(dash))

    def test_fiscal_year_notation(self):
        for text in ('令和 6 年度', '令和 2 ～ 6 年度', '平成30～令和4年度', '令和元～ 5 年度',
                     '令和 3・5・6 年度', '令和 7 年度', '令和8年度', '平成31年度', '令和元年度'):
            self.assertTrue(is_fiscal_year_notation(text), text)
        for text in ('支出済額', '翌年度繰越額', '予算現額', '事業説明', '前年度決算額',
                     '予備費支出', '流用増減', '年度', '令和', '7年度', '令和7年', None):
            self.assertFalse(is_fiscal_year_notation(text), text)

    def test_fiscal_year_pattern_matches_dbt_macro(self):
        macro = Path(__file__).resolve().parents[1] / 'dbt/macros/fiscal_year_notation.sql'
        literals = re.findall(r"'([^']*)'", macro.read_text())
        self.assertIn(FISCAL_YEAR_PATTERN, literals)

    def test_unreadable_is_none(self):
        for text in (None, '', '見出し', '1,00', '12円34', '(100'):
            self.assertIsNone(parse_amount(text) if text is not None else parse_amount(None))
            if text is not None:
                self.assertIsNone(number(text))


if __name__ == '__main__':
    unittest.main()
