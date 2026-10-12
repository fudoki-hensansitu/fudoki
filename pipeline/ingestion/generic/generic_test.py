import unittest

from ingestion.generic.layout import Band, Glyph, is_amount, logical_pages, split_digits_at_rules
from ingestion.generic.observe import Page, Rule, Word, merge_rules
from ingestion.generic.sums import bracket
from ingestion.generic.repair import Report, clip_to_page, crop_to_box
from ingestion.generic.tree import (Built, Group, Item, _leading_amount, _split_code, _split_line, number_span, owner,
                                   same_position, shape_depth, subject_items)
from ingestion.generic.units import check as check_units


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


class TrialRulesTest(unittest.TestCase):
    """Shared rules added after trying three jurisdictions the rules had not seen (trial.md)."""

    def test_a_line_of_only_a_grouped_amount_is_an_amount_not_an_item_numbered_10(self):
        label, money = _split_line([glyph('10', 1127, 685, 9), glyph(',000', 1136, 685, 18)])
        self.assertEqual(label, [])
        self.assertEqual(''.join(g.text for run in money for g in run), '10,000')
        label, money = _split_line([glyph('10', 1127, 685, 9)])
        self.assertEqual([g.text for g in label], ['10'])

    def test_digits_split_only_where_a_rule_runs_between_characters(self):
        joined = Word('１１', 21.14, 120.6, 40.94, 129.6)  # 項1・目1 joined by Poppler across the rule at 31.2
        self.assertEqual([w.text for w in split_digits_at_rules(joined, [Rule(31.2, 50, 31.2, 800)])], ['１', '１'])
        overrun = Word('10', 22.0, 120.6, 31.0, 129.6)  # a 10 overrunning a narrow band: the rule crosses the 0
        self.assertEqual([w.text for w in split_digits_at_rules(overrun, [Rule(28.8, 50, 28.8, 800)])], ['10'])

    def test_an_amount_running_into_the_next_band_keeps_its_digits(self):
        self.assertEqual(_leading_amount(glyph('44,406,439,217明許', 662, 700)).text, '44,406,439,217')
        self.assertEqual(_leading_amount(glyph('301,286,948', 662, 700)).text, '301,286,948')

    def test_numbers_of_one_shape_at_another_position_are_another_level(self):
        group = Group([], '備考', False)
        item = lambda code, name, x: Item(group, 1, [[glyph(code, x, 0, 4.5 * len(code)), glyph(name, x + 4.5 * len(code) + 2, 0)]],
                                          code, name, x)
        order, anchors = [], {}
        depths = [shape_depth(item(code, name, x), 1, order, [], anchors)
                  for code, name, x in (('1', '財政管理事務', 944), ('8', '旅費', 962), ('10', '需用費', 958),
                                        ('2', '契約事務', 944), ('4', '共済費', 962.5))]
        self.assertEqual(depths, [1, 2, 2, 1, 2])  # right-aligned 8 and 10 share a level below 事業

    def test_a_header_printed_again_mid_page_is_not_body_and_its_title_names_the_kan(self):
        verticals = [Rule(x, 50, x, 400) for x in (10, 100, 200)]
        horizontals = [Rule(10, y, 200, y) for y in (50, 70, 100, 150, 170, 200, 400)]
        header = lambda y: [Word('科', 20, y, 29, y + 9), Word('目', 40, y, 49, y + 9),
                            Word('支出', 110, y, 128, y + 9), Word('済額', 130, y, 148, y + 9)]
        words = header(55) + [Word('1', 20, 80, 24.5, 89), Word('総務費', 30, 80, 57, 89), Word('1,000', 150, 80, 172.5, 89),
                              Word('第2款', 20, 155, 47, 164), Word('民生費', 50, 155, 77, 164)] + header(175) + \
            [Word('1', 20, 210, 24.5, 219), Word('社会福祉費', 30, 210, 75, 219), Word('2,000', 150, 210, 172.5, 219)]
        logical = logical_pages([Page(1, 300, 500, words, verticals + horizontals)])[0]
        body = [w.text for band in logical.bands for w in band.words]
        self.assertEqual(body, ['1', '総務費', '1', '社会福祉費', '1,000', '2,000'])
        self.assertEqual([(code, name) for code, name, _ in logical.titles], [('2', '民生費')])

    def test_rules_off_the_page_are_dropped_and_a_rotated_page_keeps_its_turned_box(self):
        report = Report()
        half = Page(77, 595, 842, [Word('支出済額', 40, 100, 80, 110)],
                    [Rule(-300, 120, 500, 120), Rule(-200, 50, -200, 800), Rule(300, 50, 300, 800)])
        clip_to_page(half, report)
        self.assertEqual(half.rules, [Rule(0, 120, 500, 120), Rule(300, 50, 300, 800)])
        self.assertEqual(report.off_page_rules, 1)
        turned = Page(1, 842, 1191, [Word('備考', 1000, 100, 1020, 110)], [Rule(1150, 50, 1150, 800)])
        clip_to_page(turned, report)
        self.assertEqual(turned.rules, [Rule(1150, 50, 1150, 800)])

    def test_a_page_cut_from_a_spread_by_its_cropbox_keeps_only_its_half(self):
        import tempfile
        from pathlib import Path
        import pypdfium2 as pdfium
        document = pdfium.PdfDocument.new()
        for bottom, top in ((0, 595.5), (595.5, 1191)):  # one A3 spread turned 90°, cut in two by CropBox
            page = document.new_page(842, 1191)
            page.set_rotation(90)
            page.set_cropbox(0, bottom, 842, top)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'spread.pdf'
            document.save(path)
            document.close()
            spread = lambda number: Page(number, 842, 1191, [Word('議会費', 60, 300, 90, 309), Word('支出済額', 700, 100, 740, 109)],
                                         [Rule(50, 120, 1100, 120)])
            pages = [spread(1), spread(2)]
            crop_to_box(path, pages, Report())
        self.assertEqual([[w.text for w in p.words] for p in pages], [['議会費'], ['支出済額']])
        self.assertEqual(pages[1].rules, [Rule(595.5, 120, 1100, 120)])

    def test_an_amount_on_the_name_line_below_the_code_belongs_to_that_item(self):
        band = Band(30, 98, 54, ('科目', '目'), [213.4, 551.4], 101, 551.4)
        group = Group([band], '科目', True)
        moku = Item(group, 54, [[glyph('1', 51, 221, 4)], [glyph('議会費', 51, 232)]], '1', '議会費', 51, level=0)
        amount_band = Band(98, 151, 54, ('予算現額', '当初予算額'), [213.4, 551.4], 101, 551.4)
        found = owner([glyph('82,694,000', 112, 232, 37)], amount_band, [group], {id(group): [moku]})
        self.assertIs(found, moku)

    def test_a_parenthesised_transfer_remark_does_not_make_its_item_a_note(self):
        from ingestion.generic.tree import PAREN_TAIL, TRANSFER
        self.assertIsNone(TRANSFER.search(PAREN_TAIL.sub('', '需用費（同事業、委託料へ流用△1,815,000）')))
        self.assertIsNotNone(TRANSFER.search(PAREN_TAIL.sub('', '○同目・旅費から同目・災害補償費へ流用')))

    def test_the_separator_after_a_number_is_not_part_of_the_name(self):
        self.assertEqual(_split_code('1.議会費'), ('1', '議会費'))
        self.assertEqual(_split_code('01.01.01から流用'), ('01', '.01.01から流用'))  # a dotted code stays as printed

    def test_a_kan_printed_in_the_summary_and_the_detail_counts_once(self):
        nodes = [{'node_key': key, 'parent_node_key': None, 'axis_header': '科目', 'code_text': '1', 'name_text': name}
                 for key, name in (('summary', '議会費'), ('detail', '議会費'))]
        amounts = [{'node_key': key, 'header_path': '支出済額', 'amount_text': '139,266,890', 'unit_text': '円'}
                   for key in ('summary', 'detail')]
        total = [{'kind': 'total amount', 'header': '支出済額', 'text': '139,266,890', 'label': '歳出合計'}]
        self.assertTrue(check_units(Built(nodes, amounts, [], total), 'settlement')['sum_matches'])
        unnamed = [{**node, 'code_text': None, 'name_text': None} for node in nodes]
        self.assertEqual(check_units(Built(unnamed, amounts, [], total), 'settlement')['kan_sum'], 2 * 139266890)

    def test_an_amount_on_the_line_below_its_item_belongs_to_it(self):
        band = Band(40, 125, 50, ('科目', '目'), [213.4, 551.4], 101, 551.4)
        group = Group([band], '科目', True)
        moku = Item(group, 50, [[glyph('1.', 72, 230, 6), glyph('議会費', 80, 230)]], '1', '議会費', 72, level=0)
        amount_band = Band(125, 186, 50, ('予算現額', '当初予算額'), [213.4, 551.4], 101, 551.4)
        found = owner([glyph('142,678,000', 130, 242, 44)], amount_band, [group], {id(group): [moku]})
        self.assertIs(found, moku)

    def test_numbers_align_by_start_or_by_end_with_a_digit_more_or_less(self):
        one, ten = glyph('1報酬', 795, 0, 22.5), glyph('10需用費', 790.3, 0, 31.5)  # right-aligned 1 and 10
        self.assertTrue(same_position(number_span(ten), number_span(one), ten))
        business, item = glyph('0106200広域', 782, 0, 54), glyph('01消耗品費', 801, 0, 45)  # ends meet by chance
        self.assertFalse(same_position(number_span(item), number_span(business), item))
        self.assertEqual(number_span(glyph('13使用料', 791, 0, 40)), (791, 800.0, 2))  # digits' own width, not the word's average


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


class SpreadAndOwnerTest(unittest.TestCase):
    def test_spread_halves_match_rows_under_one_shift(self):
        from ingestion.generic.layout import same_rows
        from ingestion.generic.observe import Page, Rule
        rows = lambda ys: [Rule(10, y, 500, y) for y in ys]
        left = Page(1, 600, 800, [], rows([140.8, 160.9, 181.1, 201.3, 221.4]))
        right = Page(2, 600, 800, [], rows([139.0, 159.2, 179.3, 199.5, 219.6]))
        other = Page(3, 600, 800, [], rows([300, 420, 600]))
        self.assertTrue(same_rows(left, right))
        self.assertFalse(same_rows(left, other))

    def test_leading_zero_is_a_bullet_and_marks_leave_the_name(self):
        from ingestion.generic.tree import _split_code
        self.assertEqual(_split_code('0ごみ・資源の排出'), (None, 'ごみ・資源の排出'))
        self.assertEqual(_split_code('〇区議会の運営'), (None, '区議会の運営'))
        self.assertEqual(_split_code('12委託料'), ('12', '委託料'))

    def test_a_word_starting_with_a_comma_continues_the_number(self):
        from ingestion.generic.observe import Page, Word
        from ingestion.generic.repair import Report, repair_positions
        page = Page(1, 600, 800, [Word('2', 100, 100, 104, 109), Word(',181', 108, 100, 122, 109),
                                  Word(',817', 126, 100, 140, 109)], [])
        repair_positions(page, Report())
        self.assertEqual([w.text for w in page.words], ['2,181,817'])

    def test_a_number_ending_with_a_comma_continues_on_its_right(self):
        from ingestion.generic.observe import Page, Word
        from ingestion.generic.repair import Report, repair_positions
        page = Page(1, 600, 800, [Word('5,', 1119.0, 345.2, 1124.7, 354), Word('184,344', 1128.4, 345.2, 1158.3, 354)], [])
        repair_positions(page, Report())
        self.assertEqual([w.text for w in page.words], ['5,184,344'])

    def test_amount_goes_to_the_item_on_its_line_before_its_cell(self):
        from ingestion.generic.tree import Group, Item, owner
        label = Band(0, 100, 1, ('目',), [100, 200], 90, 300)
        money = Band(100, 200, 1, ('支出済額',), [100, 200], 90, 300)
        subject = Group([label], '科目', True)
        setsu_band = Band(50, 100, 1, ('節',), [100, 200], 90, 300)
        setsu = Group([setsu_band], '節', False)
        moku = Item(subject, 1, [[glyph('3趣旨普及費', 5, 108)]], '3', '趣旨普及費', 5, level=0)
        sub = Item(setsu, 1, [[glyph('7報償費', 55, 150)]], '7', '報償費', 55)
        found = {id(subject): [moku], id(setsu): [sub]}
        self.assertIs(owner([glyph('2,260,000', 120, 108, 40)], money, [subject, setsu], found), moku)
        self.assertIs(owner([glyph('1,000', 120, 150, 30)], money, [subject, setsu], found), sub)
