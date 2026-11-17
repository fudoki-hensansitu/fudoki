"""1つの科目の升に項と目の番号が罫なしで並ぶ頁（quirk `nearest_subject_code`）。名前だけの行を付け違えると科目の木が変わる。"""
import unittest

from ingestion.generic.layout import Glyph
from ingestion.generic.patterns.quirks.nearest_subject_code import owner


def piece(text: str, y0: float, x0: float = 100.0) -> list[Glyph]:
    return [Glyph(text, x0, y0, x0 + 10 * len(text), y0 + 10, 1, 0.0)]


def centre(glyphs: list[Glyph]) -> float:
    return sum((g.y0 + g.y1) / 2 for g in glyphs) / len(glyphs)


class OwnerTest(unittest.TestCase):
    # 東村山市 R5 当初 国民健康保険: 項 `4` と目の名前 `趣旨普及費` が1行、その下に目 `1 一般被保険` / `者移送費`
    tokens = [(1, piece('4', 100.0, 60.0)), (2, piece('1', 120.0))]

    def test_a_name_on_a_row_of_several_codes_goes_to_the_deepest(self):
        self.assertEqual(owner([(1, piece('4', 100.0, 60.0)), (2, piece('1', 100.0))], piece('趣旨普及費', 100.0), centre), 1)

    def test_a_name_under_a_code_goes_to_the_row_above(self):
        self.assertEqual(owner(self.tokens, piece('者移送費', 132.0), centre), 1)
        self.assertEqual(owner(self.tokens, piece('趣旨普及費', 108.0), centre), 0)

    def test_a_name_above_every_code_keeps_the_cells_rule(self):
        self.assertIsNone(owner(self.tokens, piece('一般被保険', 80.0), centre))


if __name__ == '__main__':
    unittest.main()
