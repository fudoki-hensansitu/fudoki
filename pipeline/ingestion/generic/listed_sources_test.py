import unittest

from ingestion.generic.layout import Glyph
from ingestion.generic.observe import Word
from ingestion.generic.patterns.layout import listed_sources


class ListedSourcesTest(unittest.TestCase):
    def test_an_amount_and_the_next_source_in_one_word_are_two_words(self):
        words = [Word('特財：国庫支出金', 828.4, 291.2, 901.2, 300), Word('60,852、都支出金', 915.0, 291.2, 987.9, 300),
                 Word('文書、物品搬送（総務部）', 817.6, 438.0, 926.9, 447)]
        result = listed_sources.split_listed(words)
        self.assertEqual([w.text for w in result], ['特財：国庫支出金', '60,852', '、都支出金', '文書、物品搬送（総務部）'])
        self.assertEqual(result[1].x1, result[2].x0)

    def test_each_source_after_an_amount_is_read_as_a_line_of_its_own_and_keeps_its_printed_place(self):
        glyph = lambda t, x: Glyph(t, x, 291.2, x + 10 * len(t), 300, 5, 0)
        words = [glyph('特財：国庫支出金', 828), glyph('60,852', 915), glyph('、都支出金', 950), glyph('3,282', 1000)]
        result = listed_sources.source_lines(words)
        moved = [w for w in result if w.y0 != 291.2]
        self.assertEqual([w.text for w in moved], ['、都支出金', '3,282'])
        self.assertTrue(all(w.y0 == 291.2 + listed_sources.STEP for w in moved))
        self.assertEqual(moved[0].original, (950, 291.2, 1000, 300))


if __name__ == '__main__':
    unittest.main()
