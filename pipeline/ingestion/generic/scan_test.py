import unittest

from ingestion.generic.observe import Page, Rule, Word
from ingestion.generic.scan import _cell_words, _text, agreed_headers
from unittest.mock import patch
from copy import deepcopy


class TextTest(unittest.TestCase):
    def test_minus_and_separators(self):
        self.assertEqual(_text('A80,636,880'), '△80,636,880')
        self.assertEqual(_text('15,936120'), '15,936,120')
        self.assertEqual(_text('3，995,000'), '3,995,000')
        self.assertEqual(_text('-101、 261,000'), '△101,261,000')
        self.assertEqual(_text('一 般 管 理 費'), '一 般 管 理 費')
        self.assertEqual(_text('0'), '0')
        self.assertEqual(_text('予備費'), '予備費')


class CorrectionTest(unittest.TestCase):
    def test_an_intact_line_amount_keeps_the_sign_missing_from_its_word_range(self):
        from ingestion.generic import scan
        from ingestion.lib.pdf_rules import PageRules
        from pathlib import Path
        item = {'id': 'r', 'kind': 'region', 'raw_text': '-21,000', 'bbox_pdf_pt': [10, 20, 50, 30]}
        child = {**item, 'id': 'w', 'kind': 'word', 'parent_id': 'r',
                 'raw_text': '21,000', 'bbox_pdf_pt': [13, 20, 50, 30]}
        observation = {'pages': [{'page_number': 1, 'regions': [{'observations': [item, child]}]}]}
        with patch.object(scan.pdf_rules, 'detect', return_value=PageRules(1, 100, 100, (), ())):
            self.assertEqual(scan.pages(observation, Path('x.pdf'))[0].words[0].text, '△21,000')
            correction = scan.amount_dictionary([{'id': 'fixed', 'page': 1, 'observation_id': 'w',
                'observed_amount': '21,000', 'corrected_amount': '27,000', 'reason': '原典で確認'}])
            self.assertEqual(scan.pages(observation, Path('x.pdf'), correction)[0].words[0].text, '27,000')

    def test_wrapped_header_correction_does_not_change_a_body_name(self):
        from ingestion.generic import scan
        rules = [Rule(x, 10, x, 100) for x in (0, 40, 80)] + [Rule(0, y, 80, y) for y in (10, 30, 100)]
        page = Page(1, 100, 120, [Word('款', 5, 15, 25, 25), Word('当初', 45, 13, 65, 19),
                                Word('子算額', 45, 22, 75, 28), Word('1当初子算額', 5, 40, 35, 50),
                                Word('1,000', 45, 40, 75, 50)], rules)
        logical = scan._layout([page], None)[0]
        self.assertEqual(logical.bands[1].header, ('当初予算額',))
        self.assertEqual(logical.bands[0].words[0].text, '1当初子算額')
        self.assertEqual(page.words[2].text, '子算額')

    def test_unit_row_is_not_reread_as_money_and_thousands_mark_is_kept(self):
        from pathlib import Path
        from ingestion.generic import scan
        from ingestion.lib.pdf_rules import PageRules, Rule as ImageRule
        words = [Word('款', 5, 15, 25, 25), Word('支出済額', 45, 15, 75, 25),
                 Word('不用額', 85, 15, 115, 25), Word('比較', 125, 15, 155, 25),
                 Word('繰越', 162, 15, 178, 25), Word('1民生費', 5, 50, 35, 59),
                 Word('千', 62, 31, 66, 35), Word('円', 70, 31, 75, 35), Word('円', 110, 31, 115, 35),
                 Word('円', 150, 31, 155, 35), Word('门', 170, 31, 175, 35), Word('C', 170, 50, 175, 59)]
        observations = [{'id': str(i), 'kind': 'region', 'raw_text': w.text,
                         'bbox_pdf_pt': [w.x0, w.y0, w.x1, w.y1]} for i, w in enumerate(words)]
        observation = {'pages': [{'page_number': 1, 'regions': [{'observations': observations}]}]}
        rules = PageRules(1, 200, 120, tuple(ImageRule(x, 10, 100) for x in (0, 40, 80, 120, 160, 180)),
                          tuple(ImageRule(y, 0, 180) for y in (10, 30, 100)))
        correction = scan.amount_dictionary([{'id': 'bad-unit', 'page': 1, 'observation_id': '10',
            'observed_amount': '门', 'corrected_amount': '0', 'reason': 'wrong target'}])
        with patch.object(scan.pdf_rules, 'detect', return_value=rules):
            found = scan.pages(observation, Path('x.pdf'))
            self.assertIn('千', [w.text for w in found[0].words])
            self.assertIn('C', [w.text for w in found[0].words])
            self.assertNotIn('门', [w.text for w in found[0].words])
            with self.assertRaisesRegex(ValueError, 'unit glyph'):
                scan.pages(observation, Path('x.pdf'), correction, {'繰越': {'kind': 'amount'}})

    def test_a_region_correction_replaces_its_word_pieces_without_changing_the_observation(self):
        from ingestion.generic import scan
        from ingestion.lib.pdf_rules import PageRules
        from pathlib import Path
        item = {'id': 'r', 'kind': 'region', 'raw_text': '21,000', 'bbox_pdf_pt': [10, 20, 50, 30]}
        child = {**item, 'id': 'w', 'kind': 'word', 'parent_id': 'r'}
        observation = {'pages': [{'page_number': 1, 'regions': [{'observations': [item, child]}]}]}
        original = deepcopy(observation)
        rule = {'id': 'fixed', 'page': 1, 'observation_id': 'r', 'observed_amount': '21,000',
                'corrected_amount': '27,000', 'reason': '原典で確認'}
        dictionary = scan.amount_dictionary([rule])
        with patch.object(scan.pdf_rules, 'detect', return_value=PageRules(1, 100, 100, (), ())):
            pages = scan.pages(observation, Path('x.pdf'), dictionary)
            self.assertEqual([w.text for w in pages[0].words], ['27,000'])
            self.assertEqual(observation, original)
            with self.assertRaisesRegex(ValueError, 'differs from the observation'):
                scan.pages(observation, Path('x.pdf'), scan.amount_dictionary([{**rule, 'observed_amount': '20,000'}]))
            with self.assertRaisesRegex(ValueError, 'matched no observation'):
                scan.pages(observation, Path('x.pdf'), scan.amount_dictionary([{**rule, 'page': 2}]))

    def test_digitless_reading_cannot_change_a_name_column(self):
        from ingestion.generic import scan
        from ingestion.generic.layout import Band
        from ingestion.lib.pdf_rules import PageRules
        from pathlib import Path
        item = {'id': 'r', 'kind': 'region', 'raw_text': 'C', 'bbox_pdf_pt': [10, 20, 15, 30]}
        observation = {'pages': [{'page_number': 1, 'regions': [{'observations': [item]}]}]}
        dictionary = scan.amount_dictionary([{'id': 'zero', 'page': 1, 'observation_id': 'r',
            'observed_amount': 'C', 'corrected_amount': '0', 'reason': '原典で確認'}])
        band = Band(0, 40, 1, ('事故繰越',), [], 10, 50)
        with patch.object(scan.pdf_rules, 'detect', return_value=PageRules(1, 100, 100, (), ())), \
                patch('ingestion.generic.layout.page_bands', return_value=([band], [])):
            with self.assertRaisesRegex(ValueError, 'declared amount column'):
                scan.pages(observation, Path('x.pdf'), dictionary)
            result = scan.pages(observation, Path('x.pdf'), dictionary, {'事故繰越': {'kind': 'amount'}})
            self.assertEqual(result[0].words[0].text, '0')


class SequenceInkTest(unittest.TestCase):
    def test_empty_code_cell_is_located_by_the_next_two_and_a_neighbouring_name(self):
        from ingestion.generic.layout import Band, Glyph, Logical
        from ingestion.generic.scan import code_holes
        code = Band(0, 15, 1, ('項',), [10, 30, 60, 90], 10, 90, kind='label')
        name = Band(15, 100, 1, ('目',), [10, 30, 60, 90], 10, 90, kind='label')
        code.words = [Glyph('2', 5, 65, 10, 74, 1, 0)]
        name.words = [Glyph('一般管理費', 20, 35, 65, 44, 1, 0)]
        logical = Logical([1], [code, name], '円', [], ocr=True)
        holes = code_holes([logical])
        self.assertEqual([(h['page'], h['expected']) for h in holes], [(1, 1)])
        code.words.insert(0, Glyph('1', 5, 35, 8, 44, 1, 0))
        self.assertEqual(code_holes([logical]), [])

    def test_only_an_isolated_thin_one_in_a_located_hole_is_added(self):
        import numpy as np
        from pathlib import Path
        from ingestion.generic import scan
        image = np.full((100, 100), 255, np.uint8)
        image[22:35, 22:24] = 0
        page = Page(1, 50, 50, [Word('諸費', 15, 10, 25, 20)])
        hole = {'page': 1, 'expected': 1, 'name': '諸費', 'box': (10, 10, 20, 20), 'height': 8}
        with patch.object(scan, 'code_holes', return_value=[hole]), patch.object(scan.pdf_rules, 'render', return_value=image):
            found, fills = scan.recover_codes([page], Path('x.pdf'))
            self.assertEqual([w.text for w in found[0].words], ['諸費', '1'])
            self.assertEqual(len(fills), 1)
            self.assertEqual([w.text for w in page.words], ['諸費'])
            ruled = Page(1, 50, 50, page.words, [Rule(11.5, 0, 11.5, 50)])
            self.assertEqual(scan.recover_codes([ruled], Path('x.pdf'))[1], [])
            image[33:35, 22:32] = 0  # bracket, not a thin digit
            self.assertEqual(scan.recover_codes([page], Path('x.pdf'))[1], [])
        with patch.object(scan, 'code_holes', return_value=[]), patch.object(scan.pdf_rules, 'render') as render:
            self.assertEqual(scan.recover_codes([page], Path('x.pdf'))[1], [])
            render.assert_not_called()


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


class RepeatedHeadingTest(unittest.TestCase):
    """OCR misreads of the codes and names a continuation page repeats (132055, 132101)."""

    def test_near_codes_are_one_digit_dropped_or_added_or_a_leading_zero(self):
        from ingestion.generic.scan import near_code
        self.assertTrue(near_code('10', '1'))
        self.assertTrue(near_code('2', '02'))
        self.assertTrue(near_code('3', '13'))
        self.assertTrue(near_code('1', None))
        self.assertFalse(near_code('3', '4'))
        self.assertFalse(near_code('12', '21'))

    def test_only_ocr_pages_repeat_a_heading_whose_code_was_misread(self):
        from ingestion.generic.tree import Group, Item, repeats
        group = Group([], '科目', True)
        open_kan = Item(group, 1, [], '10', '教育費', 0)
        self.assertTrue(repeats(open_kan, Item(group, 25, [], '1', '', 0), ocr=True))  # `10 2 3` read `1 2 3`
        self.assertTrue(repeats(open_kan, Item(group, 4, [], '10', '-', 0), ocr=True))  # a scrap beside the code
        self.assertFalse(repeats(open_kan, Item(group, 25, [], '1', '', 0), ocr=False))  # printed text: codes agree or not
        open_moku = Item(group, 23, [], '3', '小学校特別支援教育費', 0)
        self.assertTrue(repeats(open_moku, Item(group, 25, [], '13', '小学校特別支援教育費', 0), ocr=True))
        self.assertFalse(repeats(open_moku, Item(group, 25, [], '4', '小学校指導費', 0), ocr=True))
