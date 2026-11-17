"""節の金額と説明の番号が罫をはさんで接する頁（quirk `code_after_amount`）。読み違えると節の金額が桁ごと変わる。"""
import unittest

from ingestion.generic.patterns.quirks.code_after_amount import pieces, read_twice


def reading(id_: str, text: str, x0: float, x1: float, y0: float = 200.0, y1: float = 210.0) -> dict:
    return {'id': id_, 'raw_text': text, 'bbox_pdf_pt': [x0, y0, x1, y1]}


class ReadTwiceTest(unittest.TestCase):
    def test_the_digit_past_the_rule_is_the_next_numbers_when_its_line_reads_it_too(self):
        # 東村山市 R5 当初 p41: `11` が罫 224.8 をまたぎ、`133443一般会計繰出金` が罫から始まる。節の金額は 1
        readings = [reading('a', '11', 218.1, 228.6), reading('b', '133443一般会計繰出金', 224.6, 322.2)]
        self.assertEqual(read_twice(readings, [224.8]), {'a': ('1', [218.1, 200.0, 224.8, 210.0])})

    def test_grouped_amount_with_a_digit_read_on(self):
        # p43: `25,0001` と `131346一般被保険者…`。節の金額は 25,000
        readings = [reading('a', '25,0001', 168.9, 204.7), reading('b', '131346一般被保険者国保税還付金', 199.9, 352.2)]
        self.assertEqual(read_twice(readings, [200.8])['a'][0], '25,000')

    def test_an_amount_whose_box_only_overruns_the_rule_stays_whole(self):
        # 次の行が同じ数字で始まらなければ、罫の先は枠の余白（`15` と `1 市民協働事業費`）
        readings = [reading('a', '15', 190.0, 203.0), reading('b', '1 市民協働事業費', 201.0, 300.0)]
        self.assertEqual(read_twice(readings, [200.8]), {})

    def test_another_row_does_not_count(self):
        readings = [reading('a', '11', 218.1, 228.6), reading('b', '133443一般会計繰出金', 224.6, 322.2, 230.0, 240.0)]
        self.assertEqual(read_twice(readings, [224.8]), {})


class PiecesTest(unittest.TestCase):
    def test_a_short_amount_is_cut_before_the_code_digits(self):
        self.assertEqual(pieces('70131317一般被保険者移送費', {'code_digits': 6}), ('70', '131317一般被保険者移送費'))

    def test_without_code_digits_only_grouped_amounts_are_cut(self):
        self.assertIsNone(pieces('70131317一般被保険者移送費'))
        self.assertEqual(pieces('445,6791'), ('445,679', '1'))

    def test_a_run_of_only_the_code_is_not_cut(self):
        self.assertIsNone(pieces('131317', {'code_digits': 6}))
