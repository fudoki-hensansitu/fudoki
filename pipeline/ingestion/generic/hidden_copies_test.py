"""見えない写しを落とす処理が、同じ額を印字した隣の金額の欄を写しとして落とさないこと。落とすと金額が抜ける。"""
import unittest
from pathlib import Path

from ingestion.generic.observe import Word, drop_hidden_copies


class TwinAmountColumnsTest(unittest.TestCase):
    def test_equal_figures_in_neighbouring_columns_are_kept(self):
        # 決算書の歳入: 予算現額・調定額・収入済額が 68pt おきに並び、多くの行で同じ額になる。名前は写しを持たない
        words = []
        for row in range(60):
            y = 100.0 + row * 10
            words += [Word(f'科目{row}', 40.0, y, 80.0, y + 8), Word(f'{row + 1},000', 232.0, y, 262.0, y + 8),
                      Word(f'{row + 1},000', 300.0, y, 330.0, y + 8),
                      Word(f'{row + 1},000', 368.0, y, 398.0, y + 8), Word('円', 400.0, y, 408.0, y + 8)]
        # 頁を描かずに返る（写しの判定に入らない）ので、PDF は読まない
        self.assertEqual(drop_hidden_copies(Path('/nonexistent.pdf'), 1, 595.0, words), words)


if __name__ == '__main__':
    unittest.main()
