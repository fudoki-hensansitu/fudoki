"""Whole-label corrections preserve original text and avoid unrelated names."""
from pathlib import Path
import json
import tempfile
import unittest

from ingestion.lib.tree_checks import check_tree
from ingestion.lib.ocr_names import (AmountDictionary, AmountRule, NameDictionary, NameRule,
    correct_amount, correct_name, correct_name_preserving_layout, load_amount_dictionary,
    load_name_dictionary)


class SharedNameCorrections(unittest.TestCase):
    def setUp(self):
        self.setsu = load_name_dictionary(Path(__file__).with_name('fiscal_setsu_name_corrections.json'))
        self.subject = load_name_dictionary(Path(__file__).with_name('fiscal_subject_name_corrections.json'))

    def test_source_confirmed_setsu_and_subject_patterns(self):
        cases=[(self.setsu,'負担金·補助及び交付金','負担金・補助及び交付金','setsu-contribution-middle-dot'),
               (self.setsu,'償還金·利子及び割引料','償還金・利子及び割引料','setsu-redemption-middle-dot'),
               (self.subject,'徵収費','徴収費','subject-collection-character'),
               (self.subject,'健康診查費','健康診査費','subject-health-examination-character')]
        for dictionary,before,after,rule in cases:
            with self.subTest(before=before):
                result=correct_name(before,dictionary)
                self.assertEqual((result['raw_name'],result['corrected_name'],result['rule_id']), (before,after,rule))
                self.assertEqual(result['dictionary_sha256'],dictionary.sha256)

    def test_wrapping_spacing_and_original_fullwidth_glyphs_survive_matching(self):
        before=' 負担金·補助\n　及び交付金 '
        result=correct_name_preserving_layout(before,self.setsu)
        self.assertEqual(result['raw_name'],before)
        self.assertEqual(result['corrected_name'],' 負担金・補助\n　及び交付金 ')
        self.assertEqual(result['layout_policy'],'preserve-whitespace-and-unchanged-glyphs')
        self.assertEqual(correct_name_preserving_layout('健康 診查費',self.subject)['corrected_name'],'健康 診査費')

    def test_printed_numbers_partial_names_unknowns_and_original_old_glyph_are_unchanged(self):
        negatives=['0','１,０００','△181,000','1 徵収費','19 負担金·補助及び交付金',
            '徵収費を含む事業','健康診查費補助','負担金·補助','償還金·利子','不明の名称',
            '多摩市後期高齡者医療特別会計','齡']
        for dictionary in [self.setsu,self.subject]:
            for before in negatives:
                with self.subTest(before=before,dictionary=dictionary.sha256):
                    result=correct_name_preserving_layout(before,dictionary)
                    self.assertEqual(result['corrected_name'],before)
                    self.assertIsNone(result['rule_id'])

    def test_roles_do_not_share_rules(self):
        self.assertIsNone(correct_name('徵収費',self.setsu)['rule_id'])
        self.assertIsNone(correct_name('負担金·補助及び交付金',self.subject)['rule_id'])

    def test_length_change_uses_declared_whole_name_without_guessing_wrap_positions(self):
        result=correct_name_preserving_layout('備品\n入費',self.setsu)
        self.assertEqual(result['raw_name'],'備品\n入費')
        self.assertEqual(result['corrected_name'],'備品購入費')
        self.assertEqual(result['layout_policy'],'declared-name-length-change')

    def test_care_origin_confirmed_whole_names(self):
        cases=[('賦課徵収費','賦課徴収費'),
            ('介護認定審查会費','介護認定審査会費'),
            ('介護認定調查費','介護認定調査費'),
            ('審查支払手数料','審査支払手数料'),
            ('高額医療合算介護サビス等費','高額医療合算介護サービス等費'),
            ('高額医療合算介護サ一ビス等費','高額医療合算介護サービス等費'),
            ('包括的支援事業·任意事業費','包括的支援事業・任意事業費'),
            ('介護予防·生活支援サービス事業費','介護予防・生活支援サービス事業費')]
        for before,after in cases:
            with self.subTest(before=before):
                result=correct_name(before,self.subject)
                self.assertEqual(result['corrected_name'],after)
                self.assertIsNotNone(result['rule_id'])
                for negative in [before+'補助',before[:-1],'1 '+before,'不明'+before,'齡']:
                    self.assertEqual(correct_name(negative,self.subject)['corrected_name'],negative)
                    self.assertIsNone(correct_name(negative,self.subject)['rule_id'])
        self.assertEqual(correct_name_preserving_layout('介護認定審\n查会費',self.subject)['corrected_name'],
            '介護認定審\n査会費')
        changed=correct_name_preserving_layout('高額医療合\n算介護サ\nビス等費',self.subject)
        self.assertEqual(changed['corrected_name'],'高額医療合算介護サービス等費')
        self.assertEqual(changed['layout_policy'],'declared-name-length-change')

    def test_rules_are_single_pass_and_do_not_normalize_original_old_glyphs(self):
        dictionary=NameDictionary('test',(NameRule('first','徵収費','徴収費','test'),
            NameRule('second','徴収費','別名','test')))
        self.assertEqual(correct_name('徵収費',dictionary)['corrected_name'],'徴収費')
        for name in ['△181,000','0','１,０００','多摩市後期高齡者医療特別会計','高額医療合算介護サービス等費']:
            self.assertIsNone(correct_name(name,self.subject)['rule_id'])
            self.assertEqual(correct_name_preserving_layout(name,self.subject)['corrected_name'],name)

    def test_ambiguous_matching_names_are_rejected(self):
        with self.assertRaises(ValueError):
            NameDictionary('test',(NameRule('a','徵収費','徴収費','test'),NameRule('b','徵 収費','別名','test')))


class AmountCorrections(unittest.TestCase):
    def dictionary(self, rules):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'amounts.json'
            path.write_text(json.dumps({'schema_version': 1,
                'normalization': 'NFKC_REMOVE_WHITESPACE', 'rules': rules}))
            return load_amount_dictionary(path)

    def test_declared_amount_is_applied_without_rewriting_the_observation(self):
        dictionary = self.dictionary([{'id': 'amount-1', 'page': 1,
            'observation_id': 'p1:full-page:a0:result0:r109',
            'observed_amount': '84, 365, 635', 'corrected_amount': '84,365,635',
            'reason': 'OCRが数字の間に空白を入れた。桁と符号は原典画像で確認した。'}])
        result = correct_amount('84, 365, 635', page=1,
            observation_id='p1:full-page:a0:result0:r109', dictionary=dictionary)
        self.assertEqual(result['raw_amount'], '84, 365, 635')
        self.assertEqual(result['corrected_amount'], '84,365,635')
        self.assertEqual(result['rule_id'], 'amount-1')
        self.assertEqual(result['dictionary_sha256'], dictionary.sha256)

    def test_position_binds_the_correction(self):
        dictionary = self.dictionary([{'id': 'amount-1', 'page': 1,
            'observation_id': 'p1:full-page:a0:result0:r109',
            'observed_amount': '1000', 'corrected_amount': '1000', 'reason': 'test'}])
        for page, observation_id in [(2, 'p1:full-page:a0:result0:r109'),
                                     (1, 'p1:full-page:a0:result0:r110')]:
            result = correct_amount('1000', page=page, observation_id=observation_id, dictionary=dictionary)
            self.assertIsNone(result['rule_id'])
            self.assertEqual(result['corrected_amount'], '1000')

    def test_stale_observed_declaration_does_not_pass_silently(self):
        dictionary = self.dictionary([{'id': 'amount-1', 'page': 1,
            'observation_id': 'r1', 'observed_amount': '1,000',
            'corrected_amount': '1,001', 'reason': 'test'}])
        with self.assertRaises(ValueError):
            correct_amount('2,000', page=1, observation_id='r1', dictionary=dictionary)

    def test_rule_shape_must_be_an_amount_and_location_is_unique(self):
        with self.assertRaisesRegex(ValueError, 'one numeric value'):
            AmountDictionary('test', (AmountRule('a', 1, 'r1', 'C', '0!', 'test'),))
        with self.assertRaisesRegex(ValueError, 'one glyph'):
            AmountDictionary('test', (AmountRule('a', 1, 'r1', '備品入費', '0', 'test'),))
        with self.assertRaises(ValueError):
            AmountDictionary('test', (AmountRule('a', 1, 'r1', '備品入費', '備品購入費', 'test'),))
        with self.assertRaises(ValueError):
            AmountDictionary('test', (AmountRule('a', 1, 'r1', '1,000', '2,000', 'test'),
                AmountRule('b', 1, 'r1', '3,000', '4,000', 'test')))
        with self.assertRaises(ValueError):
            AmountDictionary('test', (AmountRule('a', 0, 'r1', '1,000', '2,000', 'test'),))

    def test_unsupported_schema_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'amounts.json'
            for payload in [{}, {'schema_version': 2, 'normalization': 'NFKC_REMOVE_WHITESPACE', 'rules': []},
                            {'schema_version': 1, 'normalization': 'NONE', 'rules': []}]:
                path.write_text(json.dumps(payload))
                with self.assertRaises(ValueError):
                    load_amount_dictionary(path)

    def test_tree_check_accepts_a_right_and_rejects_a_wrong_amount_declaration(self):
        nodes = [{'node_key': 'do-1', 'parent_node_key': None, 'axis_header': '款', 'level_header': '款'},
                 {'node_key': 'do-1/moku-1', 'parent_node_key': 'do-1', 'axis_header': '款', 'level_header': '目'}]
        def checked(corrected):
            dictionary = self.dictionary([{'id': 'amount-1', 'page': 3, 'observation_id': 'r7',
                'observed_amount': '1,600', 'corrected_amount': corrected, 'reason': 'test'}])
            moku = correct_amount('1,600', page=3, observation_id='r7', dictionary=dictionary)['corrected_amount']
            amounts = [{'node_key': 'do-1', 'header_path': '支出済額', 'unit_text': '円', 'amount_text': '1,000'},
                       {'node_key': 'do-1/moku-1', 'header_path': '支出済額', 'unit_text': '円', 'amount_text': moku}]
            return check_tree(nodes, amounts)['passed']
        self.assertTrue(checked('1,000'))
        self.assertFalse(checked('900'))

    def test_correction_location_types_are_checked(self):
        dictionary = self.dictionary([])
        for kwargs in [{'page': '1', 'observation_id': 'r1'}, {'page': 1, 'observation_id': 1}]:
            with self.assertRaises(TypeError):
                correct_amount('1,000', dictionary=dictionary, **kwargs)

if __name__ == '__main__':
    unittest.main()
