import unittest

from ingestion.generic.layout import Band, Glyph, is_amount
from ingestion.generic.observe import Rule, merge_rules
from ingestion.generic.sums import bracket
from ingestion.generic.tree import Group, _split_line, subject_items


def glyph(text, x0, y0, width=None):
    width = width if width is not None else 9 * len(text)
    return Glyph(text, x0, y0, x0 + width, y0 + 9, 1, 0)


class RulesTest(unittest.TestCase):
    def test_parallel_strokes_merge_into_one_rule(self):
        rules = merge_rules([Rule(89.6, 80, 89.6, 400), Rule(90.4, 80, 90.4, 400), Rule(91.2, 400, 91.2, 770)])
        self.assertEqual(len(rules), 1)
        self.assertEqual((rules[0].y0, rules[0].y1), (80, 770))

    def test_distant_rules_stay_apart(self):
        rules = merge_rules([Rule(10, 0, 10, 100), Rule(30, 0, 30, 100)])
        self.assertEqual(len(rules), 2)


class LineTest(unittest.TestCase):
    def test_amount_glued_to_a_name_is_split_inside_a_word(self):
        label, money = _split_line([glyph('事務【人事課】112,408,0', 270, 100), glyph('43', 270 + 9 * 16, 100, 9)])
        self.assertEqual(''.join(g.text for g in label), '事務【人事課】')
        self.assertEqual(''.join(g.text for run in money for g in run), '112,408,043')

    def test_separated_amount(self):
        label, money = _split_line([glyph('議長', 291, 100), glyph('7,956,000', 493, 100)])
        self.assertEqual([g.text for g in label], ['議長'])
        self.assertTrue(is_amount(money[0][0].text))


class SubjectTest(unittest.TestCase):
    def bands(self):
        return [Band(19.8, 28.8, 1, ('款',), [160.7, 187.5], 160.7, 776.8),
                Band(28.8, 37.7, 1, ('項',), [160.7, 187.5], 160.7, 776.8),
                Band(37.7, 95.8, 1, ('目',), [160.7, 187.5], 160.7, 776.8)]

    def test_codes_in_each_level_band_split_and_the_wrapped_name_joins_the_deepest(self):
        bands = self.bands()
        bands[0].words = [glyph('3', 22.1, 166, 4.5)]
        bands[1].words = [glyph('2', 31.0, 166, 4.5)]
        bands[2].words = [glyph('1', 39.9, 166, 4.5), glyph('児童福祉', 46.6, 159), glyph('総務費', 46.6, 172)]
        found = subject_items(Group(bands, '科目', True))
        self.assertEqual([(i.level, i.code, i.name) for i in found],
                         [(0, '3', ''), (1, '2', ''), (2, '1', '児童福祉総務費')])

    def test_a_name_that_runs_across_bands_stays_one_item(self):
        bands = self.bands()
        bands[0].words = [glyph('1議', 22.1, 166, 15.7)]
        bands[2].words = [glyph('会', 57.0, 166), glyph('費', 85.3, 166)]
        found = subject_items(Group(bands, '科目', True))
        self.assertEqual([(i.level, i.code, i.name) for i in found], [(0, '1', '議会費')])

    def test_two_digit_code_split_by_poppler_stays_one_code(self):
        bands = self.bands()
        bands[0].words = [glyph('1', 19.8, 166, 4.5), glyph('0', 24.3, 166, 4.5)]
        bands[1].words = [glyph('2', 31.0, 166, 4.5)]
        bands[2].words = [glyph('2', 39.9, 166, 4.5)]
        found = subject_items(Group(bands, '科目', True))
        self.assertEqual([(i.level, i.code) for i in found], [(0, '10'), (1, '2'), (2, '2')])


class SumTest(unittest.TestCase):
    def test_sums_decide_the_bracketing(self):
        # 総務費 5,000 = 総務管理費 3,000 (= 一般管理費 2,000 + 文書費 1,000) + 徴税費 2,000 (= 税務総務費 2,000)
        values = [3000, 2000, 1000, 2000, 2000]
        parents, count = bracket(values, [None] * 5, 5000, 'sum')
        self.assertEqual(parents, [-1, 0, 0, -1, 3])
        self.assertEqual(count, 1)

    def test_equal_amounts_are_ambiguous_until_numbering_narrows_them(self):
        # 1,000 / 1,000 / 1,000 summing to 2,000: either the first or the second holds the third.
        self.assertEqual(bracket([1000, 1000, 1000], [None] * 3, 2000, 'sum')[1], 2)
        parents, count = bracket([1000, 1000, 1000], [1, None, 2], 2000, 'code+sum')
        self.assertEqual((parents, count), ([-1, 0, -1], 1))

    def test_unclosed_sequence_reports_no_bracketing(self):
        self.assertEqual(bracket([1000, 500], [None, None], 2000, 'sum'), (None, 0))


if __name__ == '__main__':
    unittest.main()
