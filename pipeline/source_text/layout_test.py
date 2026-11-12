import unittest

from source_text.layout import display_width, page_text


def word(x0, y0, text, w=10.0, h=10.0):
    return (x0, y0, x0 + w * len(text), y0 + h, text)


class PageTextTest(unittest.TestCase):
    def test_table_row_keeps_values_on_one_line_aligned_to_header(self):
        words = [
            word(100, 0, 'R4'), word(200, 0, 'R5'), word(300, 0, 'R6'),
            word(0, 20, '目標'), word(100, 20, '258'), word(200, 20, '324'), word(300, 20, '390'),
            word(0, 40, '実績'), word(100, 40, '236'), word(200, 40, '310'),
        ]
        lines = page_text(400, 1000, words).split('\n')
        self.assertEqual([l.split() for l in lines], [['R4', 'R5', 'R6'], ['目標', '258', '324', '390'], ['実績', '236', '310']])
        column = lambda line, text: display_width(line[:line.index(text)])
        self.assertEqual(column(lines[0], 'R5'), column(lines[1], '324'))

    def test_portrait_page_is_not_split_at_a_table_column_gap(self):
        words = [word(0, y, f'区分{y}') for y in range(0, 100, 20)] + [word(600, y, f'{y}円') for y in range(0, 100, 20)]
        self.assertEqual(len(page_text(1000, 1400, words).split('\n')), 5)

    def test_two_columns_are_read_left_then_right(self):
        words = [word(0, y, f'左{y}') for y in range(0, 100, 20)] + [word(800, y + 10, f'右{y}') for y in range(0, 100, 20)]
        text = page_text(1400, 1000, words)
        self.assertLess(text.index('左80'), text.index('右0'))

    def test_ascii_words_keep_a_space_but_japanese_words_join(self):
        words = [word(0, 0, 'Hello', w=5), word(28, 0, 'World', w=5), word(100, 0, '258', w=5), word(117, 0, '324', w=5),
                 word(200, 0, '保育', w=10), word(222, 0, '園費', w=10)]
        self.assertEqual(page_text(400, 1000, words).split(), ['Hello', 'World', '258', '324', '保育園費'])

    def test_spread_table_shifted_a_few_points_is_not_split(self):
        words = [word(0, y, f'左{y}', h=12) for y in range(50, 230, 30)] + [word(900, y + 7, f'右{y}', h=12) for y in range(50, 230, 30)]
        self.assertNotIn('\n\n', page_text(1400, 900, words))

    def test_empty_page(self):
        self.assertEqual(page_text(1400, 1000, []), '')


if __name__ == '__main__':
    unittest.main()
