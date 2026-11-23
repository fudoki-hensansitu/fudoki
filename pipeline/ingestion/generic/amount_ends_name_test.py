"""節の名前の終わり（quirk `amount_ends_name`）と、名前に含まれる数（`21世紀`）、宣言した金額の箱の下の墨。読み違えると節が隣の節と1つになる・番号が変わる。"""
import unittest

from ingestion.generic.layout import Band, Glyph
from ingestion.generic.scan import read_ink
from ingestion.generic.tree import Group, _split_code, items


def glyph(text: str, x0: float, y0: float, height: float = 8.0) -> Glyph:
    return Glyph(text, x0, y0, x0 + height * len(text), y0 + height, 1, 0.0)


class CenturyTest(unittest.TestCase):
    def test_a_number_glued_to_a_century_is_part_of_the_name(self):
        self.assertEqual(_split_code('21世紀林業創造の森使用料'), (None, '21世紀林業創造の森使用料'))

    def test_a_number_set_apart_by_a_stop_is_a_code(self):
        self.assertEqual(_split_code('1.世紀の森使用料'), ('1', '世紀の森使用料'))
        self.assertEqual(_split_code('(2)世紀の森使用料'), ('2', '世紀の森使用料'))


class AmountEndsNameTest(unittest.TestCase):
    def group(self, words: list[Glyph]) -> Group:
        band = Band(50.0, 170.0, 1, ('節', '区分'), [90.0, 130.0], 90.0, 130.0, words=words, kind='label')
        return Group([band], '節', False)

    def test_a_cell_of_one_code_does_not_join_a_line_after_the_amount_that_ended_the_name(self):
        # `1 収入金` prints its amount beside it in the column: the line under it (one line pitch below, short) is
        # the next 節, even though the cell holds one code and the line starts where the name could wrap
        words = [glyph('1', 52.0, 100.0, 4.0), glyph('収入金', 60.0, 100.0), glyph('滞納分', 60.0, 110.0)]
        column = [glyph('1,000', 180.0, 100.0, 4.0)]
        settings = {'quirks': {'amount_ends_name': True}}
        names = [item.name for item in items(self.group(words), '節', settings=settings, column_amounts=column)]
        self.assertEqual(names, ['収入金', '滞納分'])


class ReadInkTest(unittest.TestCase):
    def observation(self, ink: list[float]) -> dict:
        return {'pages': [{'page_number': 9, 'unread_ink': [ink]}]}

    def test_ink_inside_a_declared_amount_box_is_read(self):
        readings = [{'page': 9, 'boxes': [[340.0, 88.0, 414.0, 102.0]]}]
        self.assertEqual(read_ink(self.observation([343.0, 89.0, 350.0, 100.0]), readings)['pages'][0]['unread_ink'], [])

    def test_ink_reaching_past_a_declared_amount_box_stays_unread(self):
        # the ink's centre is inside the box, but it runs past the box's right end into the next column
        readings = [{'page': 9, 'boxes': [[340.0, 88.0, 414.0, 102.0]]}]
        ink = [400.0, 89.0, 425.0, 100.0]
        self.assertEqual(read_ink(self.observation(ink), readings)['pages'][0]['unread_ink'], [ink])


if __name__ == '__main__':
    unittest.main()
