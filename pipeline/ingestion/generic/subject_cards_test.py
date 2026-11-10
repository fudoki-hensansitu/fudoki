import unittest

from ingestion.generic.observe import Page, Word
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


if __name__ == '__main__':
    unittest.main()
