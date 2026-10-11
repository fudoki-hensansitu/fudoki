"""Tests for the shared printed-amount reading (ingestion and dbt staging agree)."""
import unittest

from shared.amount import number, parse_amount


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

    def test_unreadable_is_none(self):
        for text in (None, '', '見出し', '1,00', '12円34', '(100'):
            self.assertIsNone(parse_amount(text) if text is not None else parse_amount(None))
            if text is not None:
                self.assertIsNone(number(text))


if __name__ == '__main__':
    unittest.main()
