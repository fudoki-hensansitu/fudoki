"""紙に貼った訂正（白い FreeText 注釈）と、廃目・廃項の行。読み違えると科目の番号や前年度の金額が変わる。"""
import unittest
from types import SimpleNamespace

from ingestion.generic.observe import Word, covered_by_notes
from ingestion.generic.tree import ABOLISHED, Item, repeats


def note(contents: str, x0: float, top: float, x1: float, bottom: float, fill=(1, 1, 1), subtype="/'FreeText'") -> dict:
    return {'x0': x0, 'top': top, 'x1': x1, 'bottom': bottom, 'contents': contents,
            'data': {'Subtype': subtype, 'C': list(fill), 'F': 4}}


class CoveredByNotesTest(unittest.TestCase):
    def test_a_note_reads_in_place_of_the_number_it_covers(self):
        # 栃木県の予算書 2024: 項 `10` の上に `8` を貼る。Poppler は両方を読む
        words = [Word('10', 52.0, 195.5, 60.0, 203.5), Word('環境性能割交付金', 68.5, 195.5, 132.5, 203.5),
                 Word('8', 58.25, 195.75, 62.25, 203.75)]
        page = SimpleNamespace(annots=[note('8', 52.25, 193.75, 64.25, 213.75)])
        self.assertEqual(covered_by_notes(page, words),
                         [Word('環境性能割交付金', 68.5, 195.5, 132.5, 203.5), Word('8', 56.0, 195.5, 60.0, 203.5)])

    def test_a_note_over_nothing_printed_is_not_read(self):
        words = [Word('の', 406.5, 34.6, 415.5, 43.6), Word('8', 415.8, 33.2, 419.8, 41.2)]
        page = SimpleNamespace(annots=[note('8', 413.8, 31.2, 428.8, 44.2)])
        self.assertEqual(covered_by_notes(page, words), [Word('の', 406.5, 34.6, 415.5, 43.6)])

    def test_a_note_of_several_words_reads_as_those_words(self):
        words = [Word('1,234', 200.0, 195.0, 230.0, 203.0), Word('1,200', 198.0, 195.0, 220.0, 203.0),
                 Word('千円', 222.0, 195.0, 232.0, 203.0)]
        page = SimpleNamespace(annots=[note('1,200 千円', 196.0, 193.0, 242.0, 205.0)])
        self.assertEqual([w.text for w in covered_by_notes(page, words)], ['1,200', '千円'])

    def test_a_note_over_part_of_a_word_stops_the_reading(self):
        # Poppler joins the code to the name (`6総務費`): the note over the code cannot take its place
        words = [Word('6総務費', 52.0, 195.0, 100.0, 203.0), Word('5', 53.0, 195.0, 57.0, 203.0)]
        page = SimpleNamespace(annots=[note('5', 50.0, 193.0, 62.0, 205.0)])
        with self.assertRaises(ValueError):
            covered_by_notes(page, words)

    def test_a_note_whose_text_is_not_read_stops_the_reading(self):
        # Poppler does not print the note's text: dropping the covered number would lose the item's code
        words = [Word('6', 55.9, 474.6, 59.9, 482.6)]
        page = SimpleNamespace(annots=[note('5', 53.8, 472.7, 68.8, 485.7)])
        with self.assertRaises(ValueError):
            covered_by_notes(page, words)

    def test_a_page_whose_media_box_does_not_start_at_zero(self):
        # pdfplumber counts the note from the MediaBox's corner (50, 50), Poppler counts the words from the page's
        words = [Word('6', 100.0, 92.8, 105.6, 102.1), Word('5', 100.0, 93.8, 105.6, 103.1)]
        page = SimpleNamespace(bbox=(50, -50, 650, 350), annots=[note('5', 148.0, 39.0, 157.0, 53.0)])
        self.assertEqual([w.text for w in covered_by_notes(page, words)], ['5'])

    def test_other_annotations_hide_nothing(self):
        words = [Word('6', 55.9, 474.6, 59.9, 482.6)]
        page = SimpleNamespace(annots=[note('', 53.8, 472.7, 68.8, 485.7, fill=(1, 1, 0)),
                                       note('', 53.8, 472.7, 68.8, 485.7, subtype="/'Link'")])
        self.assertEqual(covered_by_notes(page, words), words)


class AbolishedLinesTest(unittest.TestCase):
    def test_two_dropped_lines_are_two_items(self):
        # 就農支援資金貸付事業特別会計 R7: 廃止した2つの項が、それぞれ `(廃項整理)` の行に前年度の額を印字する
        group = SimpleNamespace()
        first = Item(group, 339, [], None, '(廃項整理)', 0)
        second = Item(group, 339, [], None, '(廃項整理)', 0)
        self.assertFalse(repeats(first, second))
        self.assertEqual(ABOLISHED.fullmatch('(廃目整理)').group(1), '目')


if __name__ == '__main__':
    unittest.main()
