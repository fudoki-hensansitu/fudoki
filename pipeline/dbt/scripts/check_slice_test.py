"""Reference identity mismatches report both sides instead of raising KeyError."""
import csv
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import MagicMock, patch

import check_slice


class CheckSliceTest(unittest.TestCase):
    def test_same_count_with_missing_and_extra_identities_lists_both(self):
        with TemporaryDirectory() as directory:
            reference = Path(directory) / 'reference.csv'
            with reference.open('w') as stream:
                writer = csv.writer(stream)
                writer.writerow(['jurisdiction_code', 'kan_code', 'kou_code', 'moku_code',
                                 'amount_yen', 'rule_id', 'status', 'cofog_code'])
                writer.writerow(['x', '1', '1', 'expected', 10, 'r', 'assigned', '01'])
            con = MagicMock()
            con.execute.return_value.fetchall.side_effect = [
                [('x', 1, 10)], [('x', '1', '1', 'actual', 'name', 10, 'r', 'assigned', '01')]]
            with patch.object(check_slice, 'EXPECTED', {'x': (1, 10)}), \
                 patch.object(check_slice.duckdb, 'connect') as connect:
                connect.return_value.__enter__.return_value = con
                with self.assertRaises(ValueError) as error:
                    check_slice.check(Path(directory) / 'warehouse', reference)
            message = str(error.exception)
            for text in ['COFOG reference differs', "'actual'", "'expected'", "'actual': None", "'expected': None"]:
                self.assertIn(text, message)

    def test_descendant_code_with_changed_rule_passes(self):
        with TemporaryDirectory() as directory:
            reference = Path(directory) / 'reference.csv'
            with reference.open('w') as stream:
                writer = csv.writer(stream)
                writer.writerow(['jurisdiction_code', 'kan_code', 'kou_code', 'moku_code',
                                 'amount_yen', 'rule_id', 'status', 'cofog_code'])
                writer.writerow(['x', '1', '1', 'm', 10, 'old-rule', 'assigned', '01'])
            con = MagicMock()
            con.execute.return_value.fetchall.side_effect = [
                [('x', 1, 10)], [('x', '1', '1', 'm', 'name', 10, 'new-rule', 'tentative', '01.3.1')],
                [], [('a', None)]]
            with patch.object(check_slice, 'EXPECTED', {'x': (1, 10)}), \
                 patch.object(check_slice.duckdb, 'connect') as connect:
                connect.return_value.__enter__.return_value = con
                output = check_slice.check(Path(directory) / 'warehouse', reference)
            self.assertEqual(output['cofog_reference_matches'], 1)

    def test_unrelated_code_change_still_fails(self):
        with TemporaryDirectory() as directory:
            reference = Path(directory) / 'reference.csv'
            with reference.open('w') as stream:
                writer = csv.writer(stream)
                writer.writerow(['jurisdiction_code', 'kan_code', 'kou_code', 'moku_code',
                                 'amount_yen', 'rule_id', 'status', 'cofog_code'])
                writer.writerow(['x', '1', '1', 'm', 10, 'old-rule', 'assigned', '09.8'])
            con = MagicMock()
            con.execute.return_value.fetchall.side_effect = [
                [('x', 1, 10)], [('x', '1', '1', 'm', 'name', 10, 'new-rule', 'tentative', '01.3.1')]]
            with patch.object(check_slice, 'EXPECTED', {'x': (1, 10)}), \
                 patch.object(check_slice.duckdb, 'connect') as connect:
                connect.return_value.__enter__.return_value = con
                with self.assertRaises(ValueError):
                    check_slice.check(Path(directory) / 'warehouse', reference)


if __name__ == '__main__':
    unittest.main()
