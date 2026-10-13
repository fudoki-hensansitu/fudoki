import unittest

from ingestion.generic.observe import Page, Rule, Word
from ingestion.generic.scan import _cell_words, _text, agreed_headers


class TextTest(unittest.TestCase):
    def test_minus_and_separators(self):
        self.assertEqual(_text('A80,636,880'), '△80,636,880')
        self.assertEqual(_text('15,936120'), '15,936,120')
        self.assertEqual(_text('3，995,000'), '3,995,000')
        self.assertEqual(_text('0'), '0')
        self.assertEqual(_text('予備費'), '予備費')


class CellWordsTest(unittest.TestCase):
    def test_pieces_of_an_amount_rejoin_within_a_cell(self):
        pieces = [Word('15', 374, 217, 385, 228), Word('936', 390, 217, 403, 227), Word('120', 407, 217, 422, 228)]
        self.assertEqual([w.text for w in _cell_words(pieces, [359, 423])], ['15,936,120'])

    def test_a_rule_keeps_codes_apart(self):
        pieces = [Word('7', 13, 132, 20, 140), Word('1', 20.5, 132, 30, 140), Word('2', 30.5, 132, 35, 140)]
        self.assertEqual([w.text for w in _cell_words(pieces, [10, 20, 30, 78])], ['7', '1', '2'])

    def test_codes_and_kanji_join_but_a_name_keeps_its_amount(self):
        pieces = [Word('2', 337, 223, 350, 231), Word('款', 350, 223, 363, 231), Word('3', 407, 223, 412, 231),
                  Word('節へ', 412, 223, 430, 231), Word('△71,317,130', 470, 222, 527, 231)]
        self.assertEqual([w.text for w in _cell_words(pieces, [331, 541])], ['2款', '3節へ', '△71,317,130'])

    def test_a_piece_across_a_rule_is_cut(self):
        self.assertEqual([w.text for w in _cell_words([Word('款項', 42, 122, 61, 133)], [42, 52, 60])], ['款', '項'])


class AgreedHeadersTest(unittest.TestCase):
    def test_pages_on_one_frame_share_the_header_most_read(self):
        rules = [Rule(x, 100, x, 300) for x in (10, 50, 100)] + [Rule(10, y, 100, y) for y in (100, 120, 300)]

        def page(number, header):
            return Page(number, 200, 400, [Word(header, 55, 105, 70, 115), Word('目', 20, 105, 30, 115),
                                           Word('1,000', 60, 130, 95, 140)], rules)
        pages = agreed_headers([page(1, '計'), page(2, '計'), page(3, '言十')])
        self.assertEqual([sorted(w.text for w in p.words if w.y0 < 120) for p in pages], [['目', '計']] * 3)


if __name__ == '__main__':
    unittest.main()
