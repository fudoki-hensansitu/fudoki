import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('generic_scan_convert', Path(__file__).with_name('convert.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class RuleInkTest(unittest.TestCase):
    INK = {'kind': 'unread ink in amount column', 'page': 63, 'box': [169.0, 333.0, 181.5, 350.0]}

    def test_declared_rule_ink_no_longer_stops_the_table(self):
        other = {'kind': 'unread ink in amount column', 'page': 63, 'box': [230.0, 333.0, 242.5, 350.0]}
        kept = module.drop_rule_ink([self.INK, other], [{'id': 'p63', 'page': 63, 'boxes': [self.INK['box']], 'reason': '縦罫の切れ端'}])
        self.assertEqual(kept, [other])

    def test_only_unread_ink_is_dropped(self):
        seam = {'kind': 'unread strip seam', 'page': 63, 'box': self.INK['box']}
        with self.assertRaises(ValueError):
            module.drop_rule_ink([seam], [{'id': 'p63', 'page': 63, 'boxes': [self.INK['box']], 'reason': '縦罫の切れ端'}])

    def test_a_declaration_that_matches_no_ink_stops(self):
        with self.assertRaisesRegex(ValueError, 'p64'):
            module.drop_rule_ink([self.INK], [{'id': 'p64', 'page': 64, 'boxes': [self.INK['box']], 'reason': '縦罫の切れ端'}])


if __name__ == '__main__':
    unittest.main()
