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


class RepairTest(unittest.TestCase):
    def page(self, words):
        from ingestion.generic.observe import Page, Word
        return Page(1, 600, 800, [Word(*w) for w in words], [])

    def test_touching_digits_join_but_never_backwards(self):
        from ingestion.generic.repair import Report, repair_positions
        page = self.page([('1', 10, 100, 14.4, 109), ('3', 14.4, 100, 18.8, 109), (',', 18.8, 100, 21, 109),
                          ('0', 200, 100, 204, 109), ('272', 100, 100.4, 113, 109.4)])
        report = Report()
        repair_positions(page, report)
        self.assertEqual(sorted(w.text for w in page.words), ['0', '13,', '272'])

    def test_a_character_drawn_as_two_overlapping_glyphs_becomes_one_word(self):
        from ingestion.generic.repair import Report, repair_positions
        page = self.page([('八', 676.6, 130.5, 685.9, 139.2), ('刀', 676.6, 130.5, 684.4, 139.2)])
        repair_positions(page, Report())
        self.assertEqual([w.text for w in page.words], ['八刀'])

    def test_dictionary_respects_context(self):
        from ingestion.generic.repair import Report, apply_dictionary
        page = self.page([('誰でも使える', 0, 0, 50, 9), ('介誰保険', 0, 20, 40, 29), ('１゜0', 0, 40, 20, 49), ('゜', 0, 60, 5, 69)])
        report = Report()
        apply_dictionary(page, report)
        self.assertEqual([w.text for w in page.words], ['誰でも使える', '介護保険', '１00', '0'])
        self.assertEqual(report.hits['誰→護'], 1)

    def test_health_needs_misreadings_not_missing_headings(self):
        from ingestion.generic.repair import health, is_broken
        narrative = self.page([('動物の適正な捕獲を行った', 0, 0, 100, 9)])
        self.assertFalse(is_broken(health([narrative])))
        misread = self.page([('需用晋 旅晋 連営 施設幣備 健巌 派憤', 0, 0, 200, 9)])
        self.assertTrue(is_broken(health([misread])))

    def test_glyphs_never_join_across_a_vertical_rule(self):
        from ingestion.generic.observe import Rule
        from ingestion.generic.repair import Report, words_from_glyphs
        glyphs = [((10, 100, 14, 106), '1'), ((14.5, 100, 18.5, 106), '0'), ((19.5, 100, 23.5, 106), '5')]
        self.assertEqual([w.text for w in words_from_glyphs(glyphs, Report())], ['105'])
        split = words_from_glyphs(glyphs, Report(), [Rule(19, 90, 19, 120)])
        self.assertEqual(sorted(w.text for w in split), ['10', '5'])


class PatternTest(unittest.TestCase):
    def test_vertical_characters_in_one_column_read_as_one_word(self):
        from ingestion.generic.observe import Page, Rule, Word
        from ingestion.generic.repair import Report, join_vertical
        page = Page(1, 600, 800, [Word('保', 68, 174.6, 77, 183.6), Word('健', 68, 183.6, 77, 192.6),
                                  Word('費', 68, 192.6, 77, 201.6), Word('1', 82.6, 186.8, 87.1, 195.8)],
                    [Rule(80, 150, 80, 300)])
        join_vertical(page, Report())
        self.assertIn('保健費', [w.text for w in page.words])

    def test_numbering_shapes(self):
        from ingestion.generic.tree import Item, shape_of
        band = Band(0, 100, 1, ('備考',), [], 0, 100)
        shape = lambda value: shape_of(Item(Group([band], '備考', False), 1, [[glyph(value, 0, 0)]], None, value, 0))
        self.assertEqual([shape('○事業'), shape('(1)運営'), shape('①旅費'), shape('ア 郵便料'), shape('12委託料'), shape('アシスタント')],
                         ['bullet', 'paren', 'circled', 'kana', 'number', None])


class UnitTest(unittest.TestCase):
    def test_default_by_document_kind_when_nothing_is_printed(self):
        from ingestion.generic.layout import Logical
        from ingestion.generic.units import resolve
        pages = [Logical([1], [], None, []), Logical([2], [], None, [])]
        self.assertEqual(resolve(pages, 'initial')['default'], 1)
        self.assertEqual([p.unit for p in pages], ['千円', '千円'])

    def test_kan_sum_must_equal_the_printed_total(self):
        from ingestion.generic.tree import Built
        from ingestion.generic.units import check
        nodes = [{'node_key': 'k', 'axis_header': '科目', 'parent_node_key': None}]
        amounts = [{'node_key': 'k', 'header_path': '本年度予算額', 'amount_text': '281,800,047', 'unit_text': '千円'}]
        total = [{'kind': 'total amount', 'header': '本年度予算額', 'text': '56,360,000', 'label': '歳出合計'}]
        result = check(Built(nodes, amounts, [], total), 'initial')
        self.assertTrue(result['stopped'])
        self.assertFalse(result['sum_matches'])
