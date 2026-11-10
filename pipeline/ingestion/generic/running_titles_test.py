import unittest
from types import SimpleNamespace

from ingestion.generic.layout import Glyph
from ingestion.generic.observe import Word
from ingestion.generic.patterns.layout import running_titles


def glyph(text, x0, y0, page=1, offset=0.0, width=None):
    return Glyph(text, x0, y0, x0 + (width if width is not None else 10 * len(text)), y0 + 9, page, offset)


class RunningTitlesTest(unittest.TestCase):
    def test_both_title_forms_name_their_level_code_and_label(self):
        self.assertEqual(running_titles.title([glyph('(款)', 0, 0), glyph('1', 30, 0), glyph('議会費', 50, 0)]), ('款', '1', '議会費'))
        self.assertEqual(running_titles.title([glyph('第2項', 0, 0), glyph('防災費', 40, 0)]), ('項', '2', '防災費'))
        self.assertIsNone(running_titles.title([glyph('1', 0, 0), glyph('議会費', 20, 0)]))

    def test_the_unit_after_an_amount_is_not_part_of_the_amount(self):
        words = [glyph('事務費', 0, 0), glyph('361,665千円', 100, 0), glyph('291,731', 200, 0, width=35), glyph('千円', 237, 0)]
        self.assertEqual([w.text for w in running_titles.drop_units(words)], ['事務費', '361,665', '291,731'])

    def test_a_wrapped_last_character_kei_goes_back_to_its_name(self):
        words = [glyph('21', 0, 0), glyph('旧施設解体工事実施設', 20, 0), glyph('計', 20, 18), glyph('1,839', 200, 18)]
        result = running_titles.rejoin_total_tails(words)
        kei = next(w for w in result if w.text == '計')
        self.assertEqual((kei.y0, kei.x0), (0, 120))
        self.assertEqual(kei.original, (20, 18, 30, 27))  # still printed where it is

    def test_a_full_width_count_joins_the_line_it_counts_and_a_lone_count_is_not_an_item(self):
        words = [glyph('丹羽教育研究奨励賞', 0, 0), glyph('１人', 0, 18), glyph('５０，０００円', 200, 18),
                 glyph('葬祭扶助', 0, 36), glyph('２２，７７６千円', 200, 36), glyph('１０４人', 10, 54)]
        result = running_titles.rejoin_total_tails(words)
        count = next(w for w in result if w.text == '１人')
        self.assertEqual(count.y0, 0)
        self.assertNotIn('１０４人', [w.text for w in result])
        # A count whose line has no yen amount is left where it is.
        plain = running_titles.rejoin_total_tails([glyph('事業', 0, 0), glyph('１人', 0, 18), glyph('5,000', 200, 18)])
        self.assertEqual(next(w for w in plain if w.text == '１人').y0, 18)

    def test_an_amount_printed_on_the_next_page_is_read_on_its_name_and_keeps_its_printed_place(self):
        band = lambda words, page: SimpleNamespace(kind='label', header=('説明',), words=words, page=page)
        before = SimpleNamespace(bands=[band([glyph('2', 300, 800, 224, 300), glyph('法外援護事業', 320, 800, 224, 300)], 224)])
        after = SimpleNamespace(bands=[band([glyph('343', 500, 145, 226, 300), glyph('学童服', 320, 163, 226, 300)], 226)])
        running_titles.carry_amounts([before, after])
        carried = next(w for w in before.bands[0].words if w.text == '343')
        self.assertEqual((carried.y0, carried.page), (800, 226))
        self.assertEqual(carried.original, (200, 145, 230, 154))
        self.assertEqual([w.text for w in after.bands[0].words], ['学童服'])
        # A name that already has its amount takes none.
        before = SimpleNamespace(bands=[band([glyph('1', 300, 800, 224, 300), glyph('事業', 320, 800, 224, 300),
                                              glyph('100', 500, 800, 224, 300)], 224)])
        after = SimpleNamespace(bands=[band([glyph('343', 500, 145, 226, 300)], 226)])
        running_titles.carry_amounts([before, after])
        self.assertEqual([w.text for w in after.bands[0].words], ['343'])

    def test_full_width_digits_cut_into_touching_words_are_one_word(self):
        words = [Word('２', 315, 145, 324.7, 155), Word('４', 324.7, 145, 334.2, 155), Word('か', 334.2, 145, 343.7, 155),
                 Word('所', 343.7, 145, 353.2, 155), Word('10', 63, 145, 73, 155), Word('需', 76, 145, 86, 155)]
        self.assertEqual(sorted(w.text for w in running_titles.join_full_width(words)), ['10', '需', '２４か所'])

    def test_a_glued_or_cut_yen_amount_is_one_amount_apart_from_its_name(self):
        split = running_titles.split_glued_yen([glyph('月額２７，９８０円', 0, 0)])
        self.assertEqual([w.text for w in split], ['月額', '２７，９８０円'])
        self.assertGreater(split[1].x0 - split[0].x1, 2.5)
        joined = running_titles.join_split_yen([glyph('１', 0, 0, width=10), glyph('０，４２０円', 10, 0)])
        self.assertEqual([w.text for w in joined], ['１０，４２０円'])


if __name__ == '__main__':
    unittest.main()
