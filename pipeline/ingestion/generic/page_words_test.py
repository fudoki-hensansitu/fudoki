"""bbox の行組み。評価の結果・プレスの金額や年度の列が、隣の数とつながると数字が変わる。"""
import unittest

from ingestion.generic.page_words import Page, Word, lines


def page(*words: Word) -> Page:
    return Page(1, 600, 800, list(words))


class LinesTest(unittest.TestCase):
    def test_numbers_and_ascii_keep_a_space_but_japanese_words_join(self):
        words = [Word('Hello', 0, 0, 30, 10), Word('World', 32, 0, 62, 10), Word('258', 64, 0, 79, 10),
                 Word('324', 81, 0, 96, 10), Word('保育', 98, 0, 118, 10), Word('園費', 119, 0, 139, 10)]
        self.assertEqual(lines(page(*words)), ['Hello World 258 324 保育園費'])

    def test_a_word_slightly_off_the_baseline_stays_on_the_row(self):
        # 行の字の高さは中央値で見るので、低い字の語が少しずれても別の行にならない
        words = [Word('目標', 0, 100, 20, 110), Word('1', 30, 102.8, 35, 108.5), Word('回', 40, 100, 50, 110),
                 Word('次の行', 0, 120, 30, 130)]
        self.assertEqual(lines(page(*words)), ['目標 1 回', '次の行'])


if __name__ == '__main__':
    unittest.main()
