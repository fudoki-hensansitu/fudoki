import unittest
from types import SimpleNamespace

from ingestion.generic.layout import Glyph, Logical
from ingestion.generic.observe import Page, Rule, Word
from ingestion.generic.patterns.layout import running_titles


def glyph(text, x0, y0, page=1, offset=0.0, width=None):
    return Glyph(text, x0, y0, x0 + (width if width is not None else 10 * len(text)), y0 + 9, page, offset)


class RunningTitlesTest(unittest.TestCase):
    def test_both_title_forms_name_their_level_code_and_label(self):
        self.assertEqual(running_titles.title([glyph('(款)', 0, 0), glyph('1', 30, 0), glyph('議会費', 50, 0)]), ('款', '1', '議会費'))
        self.assertEqual(running_titles.title([glyph('第2項', 0, 0), glyph('防災費', 40, 0)]), ('項', '2', '防災費'))
        self.assertIsNone(running_titles.title([glyph('1', 0, 0), glyph('議会費', 20, 0)]))
        # The point after the code is the code's (檜原村 `（款） 2.総務費`).
        self.assertEqual(running_titles.title([glyph('（款）', 0, 0), glyph('2.総務費', 40, 0)]), ('款', '2', '総務費'))

    def test_a_line_printing_the_kan_and_the_kou_reads_as_two_titles(self):
        line = [glyph('（款）', 0, 0), glyph('1', 40, 0), glyph('議会費', 60, 0), glyph('（項）', 150, 0),
                glyph('1', 190, 0), glyph('議会費', 210, 0), glyph('（単位：千円）', 600, 0)]
        found = running_titles.titles(Logical([1], [], None, line), None)
        self.assertEqual([(t[0], t[1], t[2]) for t in found], [('款', '1', '議会費'), ('項', '1', '議会費')])

    def test_a_box_drawn_under_the_table_draws_no_column(self):
        rules = [Rule(38, y, 580, y) for y in (128, 160, 490)] + [Rule(x, 128, x, 490) for x in (38, 519.4, 580)]
        rules += [Rule(145, 564, 523.7, 564), Rule(145, 655, 523.7, 655), Rule(145, 564, 145, 655), Rule(523.7, 564, 523.7, 655)]
        page = running_titles.drop_outside_columns(Page(9, 595, 842, [], rules))
        self.assertEqual(sorted(r.x0 for r in page.rules if r.vertical), [38, 519.4, 580])

    def test_a_rule_drawn_in_two_pieces_is_a_full_rule_when_no_rule_spans_the_page(self):
        # 杉並: every horizontal rule of the frame is drawn left of 576 and right of 654, none across.
        rules = [Rule(38, y, 576, y) for y in (60, 120, 500)] + [Rule(654, y, 1150, y) for y in (60, 120, 500)]
        rules += [Rule(38, 300, 400, 300)]  # a short row rule is no full rule
        self.assertEqual(running_titles.full_rules(Page(1, 1191, 842, [], rules)), [60, 120, 500])
        # Pieces further apart than a split rule are two rules.
        apart = [Rule(38, 60, 400, 60), Rule(654, 60, 1150, 60)]
        self.assertEqual(running_titles.full_rules(Page(1, 1191, 842, [], apart)), [])
        # A page with a whole full rule keeps only its whole ones.
        whole = [Rule(38, 60, 1150, 60), Rule(38, 120, 576, 120), Rule(654, 120, 1150, 120)]
        self.assertEqual(running_titles.full_rules(Page(1, 1191, 842, [], whole)), [60])

    def test_a_frame_with_no_header_is_read_in_the_columns_of_the_table_under_it(self):
        columns = (39, 111, 589, 798)
        rules = [Rule(39, y, 798, y) for y in (100, 236, 250, 278, 318, 508)]
        rules += [Rule(x, 100, x, 250) for x in columns] + [Rule(x, 278, x, 508) for x in columns]
        words = [Word('13400110', 595, 103, 630, 112), Word('990', 784, 103, 797, 112), Word('計', 60, 240, 70, 249),
                 Word('（款）', 41, 262, 60, 271), Word('目', 70, 290, 80, 299), Word('説明', 650, 290, 670, 299)]
        page = Page(43, 842, 595, words, rules)
        found = running_titles.headless_top(page)
        self.assertEqual(found, (100, 250))
        inside = running_titles.in_headless_top(page, found)
        self.assertEqual([w.text for w in words if inside(w)], ['13400110', '990', '計'])
        layout_page = running_titles.without_headless_rules(page, found)
        self.assertEqual(sorted({r.y0 for r in layout_page.rules if not r.vertical}), [278, 318, 508])
        # A frame that opens with its header is left as it is.
        headed = Page(42, 842, 595, [Word('目', 70, 104, 80, 113)], rules)
        self.assertIsNone(running_titles.headless_top(headed))

    def test_the_unit_after_an_amount_is_not_part_of_the_amount(self):
        words = [glyph('事務費', 0, 0), glyph('361,665千円', 100, 0), glyph('291,731', 200, 0, width=35), glyph('千円', 237, 0)]
        self.assertEqual([w.text for w in running_titles.drop_units(words)], ['事務費', '361,665', '291,731'])

    def test_a_wrapped_last_character_kei_goes_back_to_its_name(self):
        words = [glyph('21', 0, 0), glyph('旧施設解体工事実施設', 20, 0), glyph('計', 20, 18), glyph('1,839', 200, 18)]
        result = running_titles.rejoin_total_tails(words)
        kei = next(w for w in result if w.text == '計')
        self.assertEqual((kei.y0, kei.x0), (0, 120))
        self.assertEqual(kei.original, (20, 18, 30, 27))  # still printed where it is

    def test_a_full_width_count_joins_the_line_it_counts_and_a_lone_count_is_not_an_item(self):
        words = [glyph('丹羽教育研究奨励賞', 0, 0), glyph('１人', 0, 18), glyph('５０，０００円', 200, 18),
                 glyph('葬祭扶助', 0, 36), glyph('２２，７７６千円', 200, 36), glyph('１０４人', 10, 54)]
        result = running_titles.rejoin_total_tails(words)
        count = next(w for w in result if w.text == '１人')
        self.assertEqual(count.y0, 0)
        self.assertNotIn('１０４人', [w.text for w in result])
        # A count whose line has no yen amount is left where it is.
        plain = running_titles.rejoin_total_tails([glyph('事業', 0, 0), glyph('１人', 0, 18), glyph('5,000', 200, 18)])
        self.assertEqual(next(w for w in plain if w.text == '１人').y0, 18)

    def test_an_amount_printed_on_the_next_page_is_read_on_its_name_and_keeps_its_printed_place(self):
        band = lambda words, page: SimpleNamespace(kind='label', header=('説明',), words=words, page=page)
        before = SimpleNamespace(bands=[band([glyph('2', 300, 800, 224, 300), glyph('法外援護事業', 320, 800, 224, 300)], 224)])
        after = SimpleNamespace(bands=[band([glyph('343', 500, 145, 226, 300), glyph('学童服', 320, 163, 226, 300)], 226)])
        running_titles.carry_amounts([before, after])
        carried = next(w for w in before.bands[0].words if w.text == '343')
        self.assertEqual((carried.y0, carried.page), (800, 226))
        self.assertEqual(carried.original, (200, 145, 230, 154))
        self.assertEqual([w.text for w in after.bands[0].words], ['学童服'])
        # A name that already has its amount takes none.
        before = SimpleNamespace(bands=[band([glyph('1', 300, 800, 224, 300), glyph('事業', 320, 800, 224, 300),
                                              glyph('100', 500, 800, 224, 300)], 224)])
        after = SimpleNamespace(bands=[band([glyph('343', 500, 145, 226, 300)], 226)])
        running_titles.carry_amounts([before, after])
        self.assertEqual([w.text for w in after.bands[0].words], ['343'])

    def test_full_width_digits_cut_into_touching_words_are_one_word(self):
        words = [Word('２', 315, 145, 324.7, 155), Word('４', 324.7, 145, 334.2, 155), Word('か', 334.2, 145, 343.7, 155),
                 Word('所', 343.7, 145, 353.2, 155), Word('10', 63, 145, 73, 155), Word('需', 76, 145, 86, 155)]
        self.assertEqual(sorted(w.text for w in running_titles.join_full_width(words)), ['10', '需', '２４か所'])

    def test_a_glued_or_cut_yen_amount_is_one_amount_apart_from_its_name(self):
        split = running_titles.split_glued_yen([glyph('月額２７，９８０円', 0, 0)])
        self.assertEqual([w.text for w in split], ['月額', '２７，９８０円'])
        self.assertGreater(split[1].x0 - split[0].x1, 2.5)
        joined = running_titles.join_split_yen([glyph('１', 0, 0, width=10), glyph('０，４２０円', 10, 0)])
        self.assertEqual([w.text for w in joined], ['１０，４２０円'])

    def test_an_amount_box_read_past_its_column_rule_ends_at_the_rule(self):
        rules = [Rule(353.5, 100, 353.5, 200), Rule(409.2, 100, 409.2, 200)]
        words = [Word('6,414', 327.0, 168.5, 354.14, 178), Word('事業', 360, 168.5, 380, 178), Word('12', 352, 120, 356, 130)]
        result = running_titles.inside_rules(words, rules)
        self.assertEqual([w.x1 for w in result], [353.5, 380, 356])

    def test_a_title_takes_the_first_of_its_amounts_and_only_when_the_heading_is_declared(self):
        line = [glyph('(款)', 0, 0), glyph('1', 40, 0), glyph('議会費', 60, 0),
                glyph('697,637', 200, 0), glyph('684,875', 300, 0), glyph('12,762', 400, 0)]
        [(level, code, label, _, amount)] = running_titles.titles(Logical([1], [], None, line), '本年度予算額')
        self.assertEqual((level, code, label, amount[0]), ('款', '1', '議会費', '本年度予算額'))
        self.assertEqual(''.join(g.text for g in amount[1]), '697,637')
        [untitled] = running_titles.titles(Logical([1], [], None, line), None)
        self.assertIsNone(untitled[4])

    def test_a_title_keeps_its_amount_only_when_the_pages_hold_its_table_whole(self):
        moku = lambda rows: SimpleNamespace(header=('目',), words=[glyph(t, 0, y) for t, y in rows])

        def logical(kou, rows):
            titles = [('款', '2', '総務費', [glyph('(款)', 0, -40)], ('本年度予算額', [])),
                      ('項', kou, '総務管理費', [glyph('(項)', 0, -20)], ('本年度予算額', []))]
            return Logical([1], [moku(rows)], None, [], level_titles=titles)

        whole = logical('1', [('1 一般管理費', 0), ('2 文書費', 20), ('計', 40)])
        running_titles.complete_titles([whole])
        self.assertEqual([t[4] is not None for t in whole.level_titles], [True, True])
        cut = logical('1', [('3 広報費', 0), ('計', 40)])  # the 項 starts on a page not read
        running_titles.complete_titles([cut])
        self.assertEqual([t[4] for t in cut.level_titles], [None, None])
        open_end = logical('1', [('1 一般管理費', 0), ('2 文書費', 20)])  # no 計: the 項 goes on past the pages
        running_titles.complete_titles([open_end])
        self.assertEqual([t[4] for t in open_end.level_titles], [None, None])


if __name__ == '__main__':
    unittest.main()
