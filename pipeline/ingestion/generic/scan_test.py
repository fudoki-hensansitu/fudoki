import unittest

from ingestion.generic.observe import Page, Rule, Word
from ingestion.generic.scan import _cell_words, _text, agreed_headers, apply_variant_chars
from unittest.mock import patch
from copy import deepcopy


class TextTest(unittest.TestCase):
    def test_only_horizontal_ink_joining_two_vertical_rules_closes_a_row(self):
        from pathlib import Path
        import numpy as np
        from ingestion.generic import scan
        from ingestion.lib import pdf_rules
        image = np.full((200, 200), 255, dtype=np.uint8)
        image[20:181, 20:22] = 0
        image[20:181, 80:82] = 0
        image[60:62, 20:82] = 0  # one complete short cell boundary
        image[100:102, 30:70] = 0  # detached text stroke
        image[140:142, 20:82] = 0
        image[140:142, 45:48] = 255  # interrupted stroke cannot establish a rule
        detected = pdf_rules.PageRules(1, 100, 100,
            (pdf_rules.Rule(10.5, 10, 90), pdf_rules.Rule(40.5, 10, 90)), ())
        with patch.object(pdf_rules, 'render', return_value=image):
            result = scan.short_rows(Path('x.pdf'), detected)
        self.assertEqual(result.vertical, detected.vertical)
        self.assertEqual([(r.position, r.start, r.end) for r in result.horizontal], [(30.5, 10.5, 41.0)])

    def test_small_ocr_zero_matches_its_label_before_a_previous_wrapped_line(self):
        from ingestion.generic.layout import Band, Glyph
        from ingestion.generic.tree import Group, Item, owner
        label = Band(0, 40, 1, ('節',), [0, 100], 0, 100)
        group = Group([label], '節', False)
        line = lambda value, y: [Glyph(value, 5, y, 35, y + 9, 1, 0)]
        previous = Item(group, 1, [line('13委託料', 20), line('続き', 39)], '13', '委託料', 5)
        current = Item(group, 1, [line('18負担金', 42)], '18', '負担金', 5)
        money = Band(40, 70, 1, ('繰越額',), [0, 100], 0, 100)
        zero = [Glyph('0', 60, 41.2, 63, 45.7, 1, 0)]
        found = {id(group): [previous, current]}
        self.assertIs(owner(zero, money, [group], found, ocr=True), current)
        self.assertIs(owner(zero, money, [group], found), previous)
        # A print on the earlier code line still belongs to that earlier item.
        earlier = [Glyph('0', 60, 21.2, 63, 25.7, 1, 0)]
        self.assertIs(owner(earlier, money, [group], found, ocr=True), previous)

    def test_minus_and_separators(self):
        self.assertEqual(_text('A80,636,880'), '△80,636,880')
        self.assertEqual(_text('15,936120'), '15,936,120')
        self.assertEqual(_text('3，995,000'), '3,995,000')
        self.assertEqual(_text('-101、 261,000'), '△101,261,000')
        self.assertEqual(_text('一 般 管 理 費'), '一 般 管 理 費')
        self.assertEqual(_text('0'), '0')
        self.assertEqual(_text('予備費'), '予備費')


class CorrectionTest(unittest.TestCase):
    def test_code_corrections_bind_raw_words_only_in_subject_columns(self):
        from pathlib import Path
        from ingestion.generic import scan
        from ingestion.generic.layout import Band, Logical
        from ingestion.lib.pdf_rules import PageRules
        item = {'id': 'r', 'kind': 'region', 'raw_text': '712', 'bbox_pdf_pt': [10, 40, 35, 50]}
        child = {**item, 'id': 'w', 'kind': 'word', 'parent_id': 'r'}
        observation = {'pages': [{'page_number': 1, 'regions': [{'observations': [item, child]}]}]}
        original = deepcopy(observation)
        band = Band(0, 40, 1, ('科目', '目'), [30, 100], 30, 100, kind='label')
        logical = Logical([1], [band], '円', [])
        rule = {'id': 'code', 'page': 1, 'observation_id': 'w', 'observed_code': '712',
                'corrected_code': '711', 'reason': '原画で7・1・1と確認'}
        with patch.object(scan.pdf_rules, 'detect', return_value=PageRules(1, 100, 100, (), ())), \
                patch.object(scan, '_layout', return_value=[logical]):
            corrected = scan.pages(observation, Path('x.pdf'), code_corrections=[rule])
            self.assertEqual([w.text for w in corrected[0].words], ['711'])
            self.assertEqual(observation, original)
            for changes in ({'observed_code': '７１２'}, {'observation_id': 'absent'}, {'page': 2},
                            {'corrected_code': '7A1'}, {'observation_id': 'r'}):
                with self.subTest(changes=changes), self.assertRaises(ValueError):
                    scan.pages(observation, Path('x.pdf'), code_corrections=[{**rule, **changes}])
            band.header = ('支出済額',)
            band.kind = 'amount'
            with self.assertRaisesRegex(ValueError, 'label column'):
                scan.pages(observation, Path('x.pdf'), code_corrections=[rule])

    def test_a_code_correction_that_drops_a_stroke_shrinks_the_word_box_to_the_digits(self):
        from pathlib import Path
        from ingestion.generic import scan
        from ingestion.generic.layout import Band, Logical
        from ingestion.lib.pdf_rules import PageRules
        line = {'id': 'r', 'kind': 'region', 'raw_text': '181', 'bbox_pdf_pt': [10, 40, 40, 50]}
        word = {**line, 'id': 'w', 'kind': 'word', 'parent_id': 'r'}
        other_line = {**line, 'id': 'q', 'bbox_pdf_pt': [10, 60, 40, 70]}
        other = {**other_line, 'id': 'x', 'kind': 'word', 'parent_id': 'q'}
        observation = {'pages': [{'page_number': 1, 'regions': [{'observations': [line, word, other_line, other]}]}]}
        band = Band(0, 40, 1, ('節', '区分'), [30, 100], 30, 100, kind='label')
        rule = {'id': 'code', 'page': 1, 'observation_id': 'w', 'observed_code': '181',
                'corrected_code': '18', 'reason': '原画で18と確認（縦罫線の一部が1に読まれた）'}
        with patch.object(scan.pdf_rules, 'detect', return_value=PageRules(1, 100, 100, (), ())), \
                patch.object(scan, '_layout', return_value=[Logical([1], [band], '円', [])]):
            words = scan.pages(observation, Path('x.pdf'), code_corrections=[rule])[0].words
        self.assertEqual([(w.text, w.x1) for w in sorted(words, key=lambda w: w.y0)], [('18', 30), ('181', 40)])

    def test_a_column_without_a_header_takes_the_header_of_the_column_beside_it(self):
        from ingestion.generic import scan
        from ingestion.generic.layout import Band, Logical
        bands = [Band(0, 40, 1, ('科目', '款'), [30, 100], 30, 100, kind='label'),
                 Band(0, 40, 1, (), [30, 100], 40, 100, kind='label'),
                 Band(0, 40, 1, ('項目',), [30, 100], 50, 100, kind='label'),
                 Band(0, 40, 1, (), [30, 100], 60, 100, kind='label'),
                 Band(0, 40, 1, ('当初予算額',), [30, 100], 70, 100, kind='amount')]
        with patch('ingestion.generic.layout.logical_pages', return_value=[Logical([1], bands, '円', [])]):
            scan._layout([], None)
        # Two empty columns in a row take it from the right; one beside an amount column stays empty.
        self.assertEqual([b.header for b in bands], [('科目', '款'), ('項目',), ('項目',), (), ('当初予算額',)])

    def test_a_contained_comma_in_another_tile_is_kept_in_its_complete_amount(self):
        from ingestion.generic import scan
        from ingestion.lib.pdf_rules import PageRules
        from pathlib import Path
        complete = {'id': 'full', 'kind': 'region', 'raw_text': '80.000', 'bbox_pdf_pt': [10, 20, 40, 30]}
        comma = {'id': 'comma', 'kind': 'region', 'raw_text': '，', 'bbox_pdf_pt': [20, 27, 23, 30.3]}
        separate = {**comma, 'id': 'separate', 'bbox_pdf_pt': [20, 47, 23, 50.3]}
        zero = {**comma, 'id': 'zero', 'raw_text': 'C'}
        observation = {'page_number': 1, 'regions': [{'id': 'upper', 'observations': [complete]},
            {'id': 'lower', 'observations': [comma, separate, zero]}]}
        original = deepcopy(observation)
        result = scan.page(observation, Path('x.pdf'), detected=PageRules(1, 100, 100, (), ()))
        self.assertEqual([w.text for w in result.words], ['80,000', ',', 'C'])
        self.assertEqual(observation, original)

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
        with patch.object(scan.pdf_rules, 'detect', return_value=rules), \
                patch.object(scan, 'short_rows', side_effect=lambda pdf, rules, *_: rules):
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

    def paddle_words(self, text, children, box, cuts):
        from ingestion.generic import scan
        from ingestion.lib.pdf_rules import PageRules, Rule as PdfRule
        from pathlib import Path
        line = {'id': 'p1:full-page:a0:result0:r0', 'kind': 'region', 'raw_text': text, 'bbox_pdf_pt': box,
                'attempt_id': 'p1:full-page:a0'}
        words = [{'id': f'{line["id"]}:w{i}', 'kind': 'word', 'parent_id': line['id'], 'raw_text': t, 'bbox_pdf_pt': b}
                 for i, (t, b) in enumerate(children)]
        observed = {'page_number': 1, 'regions': [{'observations': [line, *words]}]}
        rules = PageRules(1, 400, 100, tuple(PdfRule(x, 0, 100) for x in cuts), ())
        with patch.object(scan.pdf_rules, 'detect', return_value=rules):
            return [(w.text, round(w.x0), round(w.x1)) for w in scan.page(observed, Path('x.pdf')).words]

    def test_a_paddle_line_is_cut_at_the_rule_by_where_its_characters_sit(self):
        # `12,828,111同項…`: cut by a share of the box per character, the rule lands after `12,828`
        children = [('12', [100, 10, 112, 20]), (',', [114, 10, 116, 20]), ('828', [118, 10, 140, 20]),
                    (',', [142, 10, 144, 20]), ('111', [146, 10, 168, 20]), ('同', [173, 10, 183, 20]),
                    ('項', [183, 10, 193, 20]), ('、', [194, 10, 196, 20])]
        self.assertEqual(self.paddle_words('12,828,111同項、', children, [100, 10, 196, 20], [60, 171, 300]),
                         [('12,828,111', 100, 168), ('同項、', 173, 196)])

    def test_number_fragments_of_two_cells_are_not_joined_over_a_rule(self):
        # `12,828,111` of one cell and `111,000` of the next, a rule between: one word would be cut by a share of its box
        children = [('12', [100, 10, 112, 20]), (',', [114, 10, 116, 20]), ('828', [118, 10, 140, 20]),
                    (',', [142, 10, 144, 20]), ('111', [146, 10, 168, 20]), ('111', [173, 10, 195, 20]),
                    (',', [197, 10, 199, 20]), ('000', [201, 10, 223, 20])]
        self.assertEqual(self.paddle_words('12,828,111111,000', children, [100, 10, 223, 20], [60, 172, 300]),
                         [('12,828,111', 100, 168), ('111,000', 173, 223)])

    def test_a_rule_across_the_first_character_of_an_amount_does_not_split_it(self):
        # `1,981,045,000` over a rule 2pt from its left: the rule is not between two fragments, the amount stays one word
        children = [('1', [100, 10, 108, 20]), (',', [110, 10, 112, 20]), ('981', [114, 10, 136, 20]),
                    (',', [138, 10, 140, 20]), ('045', [142, 10, 164, 20]), (',', [166, 10, 168, 20]), ('000', [170, 10, 192, 20]),
                    ('同', [200, 10, 210, 20])]
        self.assertEqual(self.paddle_words('1,981,045,000同', children, [100, 10, 210, 20], [102, 300]),
                         [('1,981,045,000', 100, 192), ('同', 200, 210)])

    def test_a_dash_is_no_missed_amount_and_a_name_stroke_is_still_missed(self):
        from ingestion.lib.scan_ocr import _without_dashes
        page = {'regions': [{'observations': [
            {'kind': 'region', 'raw_text': '円', 'bbox_pdf_pt': [150, 90, 155, 95]},
            {'kind': 'region', 'raw_text': '費', 'bbox_pdf_pt': [60, 90, 66, 96]}]}]}
        dash, bar, stroke = (150.0, 120.0, 154.5, 120.8), (30.0, 120.0, 40.0, 120.8), (61.0, 120.0, 65.0, 126.0)
        self.assertEqual(_without_dashes([dash, bar, stroke], page), [bar, stroke])

    def test_a_digit_run_after_a_comma_that_a_rule_crosses_ends_its_amount_after_three_digits(self):
        # `11,726,051,000` | `5,918,437,000` (281000): the fragment `0005` crosses the rule; cut by a share of its
        # box (two digits of four) the first amount lost a digit (`1,172,605,100`)
        children = [('11', [136.0, 10, 139.9, 20]), (',', [140.8, 10, 141.8, 20]), ('726', [143.7, 10, 149.7, 20]),
                    (',', [150.7, 10, 151.6, 20]), ('051', [154.5, 10, 160.3, 20]), (',', [161.2, 10, 162.2, 20]),
                    ('0005', [164.1, 10, 175.6, 20]), (',', [176.6, 10, 177.5, 20]), ('918', [179.5, 10, 185.2, 20]),
                    (',', [186.2, 10, 187.1, 20]), ('437', [190.0, 10, 194.8, 20]), (',', [196.7, 10, 197.7, 20]),
                    ('000', [199.6, 10, 205.4, 20])]
        words = self.paddle_words('11,726,051,0005,918,437,000', children, [136, 10, 206, 20], [60, 171.2, 300])
        self.assertEqual([w[0] for w in words], ['11,726,051,000', '5,918,437,000'])

    def test_a_character_box_starting_just_before_its_rule_belongs_to_the_next_cell(self):
        children = [('159', [100, 10, 120, 20]), ('同', [124.6, 10, 134, 20]), ('項', [134, 10, 144, 20])]
        self.assertEqual(self.paddle_words('159同項', children, [100, 10, 144, 20], [60, 125.5, 300]),
                         [('159', 100, 120), ('同項', 125, 144)])

    def test_a_minus_sign_set_apart_from_its_digits_is_one_amount(self):
        # `△ 15,673,555` (132195): the sign's box ends 5.8pt before the digits, over 0.6 of the line height
        children = [('△', [771.8, 273.5, 773.3, 282.2]), ('15', [779.0, 273.5, 784.8, 282.2]), (',', [786.2, 273.5, 787.7, 282.2]),
                    ('673', [792.0, 273.5, 802.1, 282.2]), (',', [803.5, 273.5, 804.9, 282.2]), ('555', [809.3, 273.5, 817.9, 282.2])]
        self.assertEqual(self.paddle_words('△15,673,555', children, [768.9, 273.5, 820.5, 282.2], [300, 900]),
                         [('△15,673,555', 769, 820)])

    def test_the_boxes_of_a_spaced_out_name_keep_the_order_the_line_is_spelled(self):
        # `3広報費` (132195): the box of `広` starts left of the `3` before it; sorted by x it read `広3報費`
        children = [('3', [44.4, 131.7, 46.3, 143.5]), ('広', [41.0, 131.7, 65.5, 143.5]),
                    ('報', [64.6, 131.7, 89.3, 143.5]), ('費', [88.3, 131.7, 105.8, 143.5])]
        words = self.paddle_words('3広報費', children, [40.6, 131.7, 105.8, 143.5], [22, 300])
        self.assertEqual(''.join(t for t, _, _ in words), '3広報費')

    def test_children_that_do_not_spell_the_line_are_not_used_but_the_unit_is_split_off(self):
        # the children lost `2,`; the line still ends in its own 円, and the amount is not cut by the rule
        children = [('490', [30, 10, 50, 20]), (',', [51, 10, 52, 20]), ('840', [54, 10, 74, 20]), ('円', [80, 10, 90, 20])]
        self.assertEqual(self.paddle_words('2,490,840円', children, [10, 10, 90, 20], [25, 300]),
                         [('2,490,840', 10, 80), ('円', 80, 90)])

    def test_a_name_correction_may_put_back_a_lost_character_but_never_changes_a_digit(self):
        from ingestion.generic.scan import apply_name_corrections
        line = {'id': 'r', 'kind': 'region', 'raw_text': '3款民生費', 'bbox_pdf_pt': [0, 0, 10, 10]}
        observation = {'pages': [{'page_number': 1, 'regions': [{'observations': [line]}]}]}
        rule = {'id': 'x', 'page': 1, 'observation_id': 'r', 'observed_name': '3款民生費', 'corrected_name': '第3款民生費', 'reason': '原典'}
        fixed = apply_name_corrections(observation, [rule])
        self.assertEqual(fixed['pages'][0]['regions'][0]['observations'][0]['raw_text'], '第3款民生費')
        self.assertEqual(line['raw_text'], '3款民生費')
        for bad in ({'corrected_name': '第5款民生費'}, {'corrected_name': '民生費'}, {'corrected_name': '第3款環境費'}):
            with self.assertRaisesRegex(ValueError, 'replaces characters'):
                apply_name_corrections(observation, [{**rule, **bad}])

    def test_a_rule_that_removes_no_amount_character_does_not_change_its_source_box(self):
        word = Word('18,802', 528.4, 352.8, 550.04, 363.1)
        kept = _cell_words([word], [498, 549, 600])[0]
        self.assertEqual((kept.text, kept.x0, kept.y0, kept.x1, kept.y1),
                         (word.text, word.x0, word.y0, word.x1, word.y1))


class AgreedHeadersTest(unittest.TestCase):
    def test_pages_on_one_frame_share_the_header_most_read(self):
        rules = [Rule(x, 100, x, 300) for x in (10, 50, 100)] + [Rule(10, y, 100, y) for y in (100, 120, 300)]

        def page(number, header):
            return Page(number, 200, 400, [Word(header, 55, 105, 70, 115), Word('目', 20, 105, 30, 115),
                                           Word('1,000', 60, 130, 95, 140)], rules)
        pages = agreed_headers([page(1, '計'), page(2, '計'), page(3, '言十')])
        self.assertEqual([sorted(w.text for w in p.words if w.y0 < 120) for p in pages], [['目', '計']] * 3)


    def test_declared_readings_stop_rather_than_overwrite_a_read_amount(self):
        from ingestion.generic.scan import add_code_readings, read_headers
        page = Page(1, 200, 400, [Word('額', 60, 20, 66, 26), Word('1,000', 60, 130, 95, 140)], [])
        headed = read_headers([page], [{'id': 'h', 'pages': [1], 'box': [50, 15, 100, 30], 'text': '予算現額'}])
        self.assertEqual(sorted(w.text for w in headed[0].words), ['1,000', '予算現額'])
        with self.assertRaises(ValueError):
            read_headers([page], [{'id': 'h', 'pages': [1], 'box': [50, 125, 100, 145], 'text': '計'}])
        with self.assertRaises(ValueError):
            read_headers([page], [{'id': 'h', 'pages': [2], 'box': [50, 15, 100, 30], 'text': '計'}])
        amount = r'△?(0|[1-9][0-9]{0,2}(,[0-9]{3})*)'
        filled = add_code_readings([page], [{'id': 'z', 'page': 1, 'box': [100, 130, 105, 140], 'amount': '0'}], 'amount', amount)
        self.assertIn('0', [w.text for w in filled[0].words])
        with self.assertRaises(ValueError):
            add_code_readings([page], [{'id': 'z', 'page': 1, 'box': [90, 130, 105, 140], 'amount': '0'}], 'amount', amount)
        with self.assertRaises(ValueError):
            add_code_readings([page], [{'id': 'z', 'page': 1, 'box': [100, 130, 105, 140], 'amount': '1000'}], 'amount', amount)


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

    def test_similar_subject_names_with_distinct_codes_keep_separate_amount_owners(self):
        from ingestion.generic.tree import Group, Item, repeats
        group = Group([], '科目', True)
        for first, second in [('1', '2'), ('6', '7')]:
            names = ('常備消防費', '非常備消防費') if first == '1' else ('社会教育費', '社会体育費')
            previous = Item(group, 1, [], first, names[0], 0)
            item = Item(group, 2, [], second, names[1], 0)
            self.assertFalse(repeats(previous, item, ocr=True))


class VariantCharsTest(unittest.TestCase):
    def observation(self, engine):
        return {'pages': [{'page_number': 1, 'engine': engine, 'regions': [{'id': 'full-page', 'observations': [
            {'id': 'p1:full-page:a0:result0:r0', 'raw_text': '賦課徵収費'}, {'id': 'p1:full-page:a0:result0:r1', 'raw_text': '1,234'},
            {'id': 'p1:unit-0:r0', 'raw_text': '增減'}]}]}]}

    def test_a_paddle_name_gets_the_japanese_forms_and_the_receipt_names_the_observations(self):
        original = self.observation('paddle')
        result, receipt = apply_variant_chars(original)
        self.assertEqual([o['raw_text'] for o in result['pages'][0]['regions'][0]['observations']], ['賦課徴収費', '1,234', '増減'])
        self.assertEqual(original['pages'][0]['regions'][0]['observations'][0]['raw_text'], '賦課徵収費')
        self.assertEqual(sorted(receipt), sorted(['徵→徴 1 件（p1:full-page:a0:result0:r0）', '增→増 1 件（p1:unit-0:r0）']))

    def test_a_vision_observation_is_left_as_it_is(self):
        original = self.observation('vision')
        self.assertEqual(apply_variant_chars(original)[1], [])
        self.assertEqual(apply_variant_chars(original)[0]['pages'][0]['regions'][0]['observations'][0]['raw_text'], '賦課徵収費')


class EnterpriseSectionTest(unittest.TestCase):
    def test_a_page_keeps_only_the_sections_of_its_direction(self):
        from ingestion.generic.scan import direction_sections
        page = lambda number, words, rules=(): Page(number, 600, 800, list(words), list(rules))
        title = lambda text, y: [Word(c, 40 + 18 * i, y, 54 + 18 * i, y + 12) for i, c in enumerate(text)]
        body = lambda text, y: Word(text, 100, y, 160, y + 10)
        first = page(1, [*title('収入', 80), body('収入の行', 120), *title('支出', 300), body('支出の行', 340)],
                     [Rule(50, 90, 50, 700), Rule(50, 130, 500, 130), Rule(50, 350, 500, 350)])
        second = page(2, [body('続きの行', 100)])   # no title: it goes on with the section before it
        kept, skipped, sectioned = direction_sections([first, second], 'expenditure')
        self.assertEqual([[w.text for w in p.words if len(w.text) > 1] for p in kept], [['支出の行'], ['続きの行']])
        self.assertEqual((skipped, sectioned), ([], {1}))
        self.assertEqual([(r.y0, r.y1) for r in kept[0].rules if r.vertical], [(298.0, 700)])
        self.assertEqual([r.y0 for r in kept[0].rules if not r.vertical], [350])
        revenue, skipped, _ = direction_sections([first, second], 'revenue')
        self.assertEqual([w.text for w in revenue[0].words if len(w.text) > 1], ['収入の行'])
        self.assertEqual([p.number for p in revenue], [1])
        self.assertEqual(skipped, [2])   # the continuation belongs to the 支出 section
        plain = [page(1, [body('歳出の行', 100)])]
        self.assertEqual(direction_sections(plain, 'expenditure'), (plain, [], set()))

    def test_a_digit_read_twice_at_a_tile_seam_is_no_second_word(self):
        from ingestion.generic.scan import drop_covered_digits
        amount = Word('11,547,449', 381, 327.5, 432.8, 340.7)
        again = Word('9', 428.3, 327.1, 430.2, 340.0)       # the left end of the next tile's line, inside the amount
        neighbour = Word('9', 440, 327.1, 442, 340.0)       # a lone 9 of its own cell stays
        self.assertEqual(drop_covered_digits([amount, again, neighbour]), [amount, neighbour])

    def test_a_revenue_heading_over_the_sections_does_not_make_the_page_a_revenue_page(self):
        from ingestion.generic.build import page_titles
        from ingestion.generic.scan import direction_sections
        title = lambda text, y: [Word(c, 40 + 18 * i, y, 54 + 18 * i, y + 12) for i, c in enumerate(text)]
        words = [Word('歳入', 300, 20, 330, 32), *title('収入', 80), Word('収入の行', 100, 120, 160, 130),
                 *title('支出', 300), Word('支出の行', 100, 340, 160, 350)]
        page = Page(1, 600, 800, words, [Rule(50, 130, 500, 130), Rule(50, 350, 500, 350)])
        kept, skipped, sectioned = direction_sections([page], 'expenditure')
        self.assertEqual((skipped, sectioned), ([], {1}))
        self.assertIn('支出の行', [w.text for w in kept[0].words])
        # the whole-page title is read only from the pages no section title divided
        self.assertEqual(page_titles([p for p in kept if p.number not in sectioned]), {})

    def test_a_word_alone_in_the_margin_is_no_section_title(self):
        from ingestion.generic.scan import direction_sections
        words = [Word('支出', 40, 600, 76, 612), Word('本文', 100, 300, 140, 310)]
        page = Page(1, 600, 800, words, [Rule(50, 100, 500, 100)])   # no table's top rule under it
        self.assertEqual(direction_sections([page], 'revenue'), ([page], [], set()))
