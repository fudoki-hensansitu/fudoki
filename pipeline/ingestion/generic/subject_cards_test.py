import unittest

from ingestion.generic.observe import Page, Rule, Word
from ingestion.generic.patterns.layout import subject_cards


def word(text, x0, y0=0.0, width=None):
    return Word(text, x0, y0, x0 + (width if width is not None else 10 * len(text)), y0 + 9)


class SubjectCardsTest(unittest.TestCase):
    def test_the_blocks_of_a_card_are_told_by_their_headings(self):
        line = lambda *texts: [word(t, 40 * i) for i, t in enumerate(texts)]
        self.assertEqual(subject_cards.kind(line('目', '本年度予算額', '前年度予算額', '比較増減額')), 'header')
        self.assertIsNone(subject_cards.kind(line('款', '本年度予算額', '前年度予算額')))  # the 歳出 list of 款
        self.assertEqual(subject_cards.kind(line('財', '源', '内', '訳')), 'funds')
        self.assertEqual(subject_cards.kind(line('節', '区', '分')), 'setsu')
        self.assertEqual(subject_cards.kind(line('計', '上', '説', '明')), 'notes')

    def test_an_amount_before_the_department_or_inside_its_line_ends_the_line(self):
        department = [word('1', 0), word('事業', 20), word('98,000', 200), word('〔', 260), word('国保課', 270), word('〕', 300)]
        moves = subject_cards.after_departments(department)
        self.assertEqual(moves, {id(department[2]): 310 + 4 - 200})
        basis = [word('対象医療費', 20), word('16,527,123', 100), word('負担率8／10', 200)]
        self.assertEqual(subject_cards.after_departments(basis), {id(basis[1]): 270 + 4 - 100})
        count = [word('人口', 20), word('212,388', 100), word('人', 175), word('（令和6年1月1日現在）', 190)]
        self.assertEqual(subject_cards.after_departments(count), {})

    def test_a_kan_page_of_its_kou_and_the_right_half_of_the_kan_list_are_left_out(self):
        page = lambda *texts: Page(1, 600, 800, [word(t, 60 * i) for i, t in enumerate(texts)])
        self.assertTrue(subject_cards.summary_page(page('項', '本年度', '前年度', '比較')))
        self.assertTrue(subject_cards.summary_page(page('比', '較', '国都支出金', 'その他', '一般財源')))
        self.assertFalse(subject_cards.summary_page(page('目', '本年度予算額', '前年度予算額', '比較増減額')))

    def test_a_department_without_brackets_also_takes_the_amount_after_it(self):
        bare = [word('2', 0), word('徴収事務', 20), word('17,122千円', 200), word('保険年金課', 300)]
        self.assertEqual(subject_cards.after_departments(bare), {id(bare[2]): 350 + 4 - 200})
        spelled = [word('1', 0), word('事業', 20), word('16,238,313千円', 200), *[word(c, 340 + 10 * i) for i, c in enumerate('子育て支援課･')]]
        self.assertEqual(subject_cards.after_departments(spelled), {id(spelled[2]): 410 + 4 - 200})

    def test_a_number_printed_in_pieces_is_one_word(self):
        joined = subject_cards.join_comma_splits([word('20,', 100, width=14), word('765千円', 116), word('事業', 10)])
        self.assertEqual(sorted(w.text for w in joined), ['20,765千円', '事業'])
        parens = subject_cards.join_open_parens([word('(', 88, width=3), word('1)', 93), word('各種援助', 110)])
        self.assertEqual(sorted(w.text for w in parens), ['(1)', '各種援助'])

    def test_the_lines_that_print_the_moku_amount_again_are_found(self):
        notes = [word('療養の給付に要する経費を計上', 0, 0), word('6,626,796千円', 300, 0),
                 word('1', 0, 20), word('療養給付費', 20, 20), word('6,626,796千円', 300, 20),
                 word('合', 20, 40), word('計', 60, 40), word('6,626,796千円', 300, 40)]
        found = subject_cards.restated_lines(notes, {6626796})
        self.assertEqual([[w.text for w in line][0] for line in found], ['療養の給付に要する経費を計上', '合'])
        self.assertEqual(subject_cards.restated_lines(notes, {1}), [])

    def test_an_office_heading_is_laid_out_where_its_items_start(self):
        heading = [word('日本橋特別出張所', 61.9, 0), word('2,332,236千円', 385, 0), word('[', 461, 0, width=5),
                   word('日本橋特別出張所', 466, 0), word(']', 540, 0, width=5)]
        item = [word('1', 65.0, 18), word('日本橋特別出張所管理事業', 96, 18), word('835,627千円', 350, 18)]
        moves = subject_cards.office_headings(heading + item)
        self.assertAlmostEqual(moves[id(heading[0])], 3.1)
        self.assertNotIn(id(heading[1]), moves)


    def test_scan_pieces_of_an_amount_or_a_mark_are_joined(self):
        joined = subject_cards.join_comma_splits([word('960', 0, width=19), word('382千円', 24, width=36),
                                                  word('14', 100, width=11), word(',291件', 113, width=31),
                                                  word('7', 200, width=7), word('05', 207, width=11)])
        self.assertEqual(sorted(w.text for w in joined), ['14,291件', '705', '960,382千円'])
        self.assertEqual([w.text for w in subject_cards.join_open_parens([word('(目', 0, width=14), word(')', 18, width=5)])],
                         ['(目)'])
        self.assertEqual([w.text for w in subject_cards.split_marks([word('（目）地域密着型介護', 0)])], ['（目）', '地域密着型介護'])

    def test_scan_fragments_bars_and_glued_numbers_are_taken_apart(self):
        inner = word('頁', 283, width=7)
        self.assertEqual([w.text for w in subject_cards.contained_fragments([word('本年度予算額', 186, width=103), inner])],
                         ['本年度予算額'])
        self.assertEqual([w.text for w in subject_cards.strip_bars([word('|4共済費', 297)])], ['4共済費'])
        self.assertEqual([w.text for w in subject_cards.split_code([word('2高', 65, width=34), word('額療養費', 98)], 178)],
                         ['2', '高', '額療養費'])
        self.assertEqual([w.text for w in subject_cards.cut_at(Word('7028旅', 159, 0, 202, 9), 178)], ['702', '8旅'])
        self.assertEqual([w.text for w in subject_cards.cut_at(Word('13510需用費', 279, 0, 359, 9), 298)], ['135', '10需用費'])

    def test_a_block_is_divided_by_the_strokes_that_cross_it_whole(self):
        rules = [Rule(0, 100, 400, 100), Rule(0, 200, 400, 200), Rule(0, 300, 400, 300),  # rows of the block
                 Rule(150, 100, 150, 300),  # a cell edge from the first row to the last
                 Rule(250, 100, 250, 130),  # a short stroke inside a cell
                 Rule(100, 120, 300, 120)]  # a rule across part of the block
        page = Page(1, 400, 600, [], rules)
        verticals, horizontals = subject_cards.dividing(page, 90, 310, 0, 400)
        self.assertEqual(verticals, [150])
        self.assertEqual(horizontals, [100, 200, 300])
        # The last card of a page: the empty space under its last row does not count against an edge.
        verticals, _ = subject_cards.dividing(page, 90, 560, 0, 400)
        self.assertEqual(verticals, [150])


if __name__ == '__main__':
    unittest.main()
