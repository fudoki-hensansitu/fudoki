import unittest

from ingestion.generic.convert import (excluded_regions, frame_words, lay_notes, scope_pages, split_notes)
from ingestion.generic.layout import Band, Glyph, Logical
from ingestion.generic.notes import kind_of, reads_as_note
from ingestion.generic.observe import Page, Word
from ingestion.generic.tree import Built
from ingestion.lib.node_tables import validate_exclusions


def glyph(text, x0, y0, width=None, page=1):
    width = width if width is not None else 9 * len(text)
    return Glyph(text, x0, y0, x0 + width, y0 + 9, page, 0)


class NotesTest(unittest.TestCase):
    def test_the_dictionary_gives_the_kind_and_a_transfer_without_its_words_still_has_one(self):
        self.assertEqual(kind_of('02-01-04-03-10-03から流用'), '流用')
        self.assertEqual(kind_of('前年度繰越事業費不用額'), '不用額')
        self.assertEqual(kind_of('各学校営繕工事(翌年度へ繰越明許費19,496,582)'), '繰越額')
        self.assertIsNone(kind_of('同款・同項・同目・災害補償費へ'))
        self.assertEqual(kind_of('同款・同項・同目・災害補償費へ', words=True), '流用')
        self.assertEqual(kind_of('充当', words=True), '充用')
        self.assertIsNone(kind_of('(企画調整課)', words=True))
        self.assertTrue(reads_as_note('流用') and reads_as_note('予備費充当'))
        self.assertFalse(reads_as_note('消耗品費'))


class NoteLayingTest(unittest.TestCase):
    def built(self, annotations, amounts=()):
        return Built([], list(amounts), [], [], annotations)

    def record(self, kind, label, runs, **more):
        return {'kind': kind, 'node_key': 'subject', 'parent_node_key': 'subject', 'heading': None,
                'label': label, 'runs': runs, 'unit': '円', 'hint': None, **more}

    def test_a_remark_becomes_a_note_node_of_its_kind_with_its_own_words_and_a_note_amount(self):
        label = [glyph('02-01-02-15-11-01', 386, 316, 74), glyph('から流用', 465, 316)]
        built = self.built([self.record('annotation', label, [[glyph('△197,000', 514, 316)]])])
        nodes, amounts, unresolved, dropped, codes = lay_notes(built)
        self.assertEqual([(n['axis_header'], n['level_header'], n['name_text'], n['parent_node_key'], n['depth'])
                          for n in nodes], [('注記', '流用', '02-01-02-15-11-01 から流用', 'subject', 1)])
        self.assertEqual([(a['header_path'], a['amount_text'], a['unit_text'], a['node_key'] == nodes[0]['node_key'])
                          for a in amounts], [('注記金額', '△197,000', '円', True)])
        self.assertEqual((unresolved, dropped), ([], set()))
        self.assertEqual([g.text for g in codes], ['02-01-02-15-11-01'])  # printed text, not an amount

    def test_a_kind_line_inside_an_item_leaves_the_item_and_a_remark_without_a_kind_is_left_unadopted(self):
        kind_line = self.record('kind line', [glyph('繰越明許費', 900, 100)], [[glyph('302,000', 1000, 100)]],
                                node_key='item', heading='備考／繰越明許費')
        nameless = self.record('annotation', [glyph('(企画調整課)', 900, 120)], [[glyph('4,021,547', 1000, 120)]])
        amounts = [{'node_key': 'item', 'header_path': '備考／繰越明許費', 'amount_text': '302,000'},
                   {'node_key': 'item', 'header_path': '備考', 'amount_text': '1,000'},
                   {'node_key': 'subject', 'header_path': '備考／注記／(企画調整課)', 'amount_text': '4,021,547'}]
        kept, nodes, note_amounts, unresolved, _ = split_notes(self.built([kind_line, nameless], amounts))
        self.assertEqual([a['header_path'] for a in kept], ['備考'])
        self.assertEqual([n['level_header'] for n in nodes], ['繰越額'])
        self.assertEqual([u['amounts'] for u in unresolved], [['4,021,547']])

    def test_a_reserve_remark_takes_the_kind_its_account_says_when_the_words_have_none(self):
        label = [glyph('02-01-04-03-14-01へ', 342, 544)]
        hinted = self.built([self.record('annotation', label, [[glyph('1,630,000', 500, 544)]], hint='充用')])
        self.assertEqual([n['level_header'] for n in lay_notes(hinted)[0]], ['充用'])


class ScopeTest(unittest.TestCase):
    def test_the_pages_are_the_selected_scope_of_the_account(self):
        source = {'scope': [{'account': '一般会計', 'pages': [[9, 11], [48, 49]]}, {'account': '介護保険', 'pages': [[1, 5]]}]}
        self.assertEqual(scope_pages(source, '一般会計'), [9, 10, 11, 48, 49])
        with self.assertRaises(ValueError):
            scope_pages(source, '病院事業会計')


class ExclusionTest(unittest.TestCase):
    def band(self, header, kind, x0, x1, page=1, offset=0):
        band = Band(x0 + offset, x1 + offset, page, header, [], 130, 700, kind=kind, top=60)
        band.offset = offset
        return band

    def test_the_declared_regions_use_the_shared_vocabulary(self):
        label = [glyph('02-01-02-15-11-01', 386, 316, 74)]
        bands = [self.band(('予算現額',), 'amount', 100, 200), self.band(('予算現額に対する支出割合',), 'label', 674, 739, page=18)]
        built = Built([], [], [], [
            {'kind': 'total amount', 'page': 17, 'text': '2,790,485,621', 'label': '合計', 'box': (94, 631, 159, 641)},
            {'kind': 'total amount', 'page': 17, 'text': '1,000', 'label': '長期総合計画', 'box': (94, 600, 159, 610)}])
        built.skipped = [Logical([238], [self.band(('金額(円)',), 'amount', 640, 700, page=238)], '円', [])]
        observed = [Page(5, 600, 800, [Word('※1', 498, 311, 509, 318), Word('1,000', 10, 10, 40, 19)], [])]
        regions = excluded_regions(built, bands and [Logical([1, 18], bands, '円', [])], label, observed)
        kinds = [(r['kind'], r.get('page'), r.get('pages')) for r in regions]
        self.assertIn(('本文', 1, None), kinds)           # the account code of a note, and the footnote mark on page 5
        self.assertIn(('本文', 5, None), kinds)
        self.assertIn(('数量表', None, [[18, 18]]), kinds)  # a ratio column, the whole column
        self.assertEqual(sum(1 for r in regions if r['kind'] == '総括' and r.get('page') == 17), 1)  # the 合計 row only
        self.assertEqual(sum(1 for r in regions if r['kind'] == '総括' and r.get('page') == 238), 1)  # a frame that is no detail
        validate_exclusions(regions)  # every kind is known and every entry has a reason


class FrameWordsTest(unittest.TestCase):
    def test_only_words_inside_a_ruled_frame_are_in_scope_and_an_item_number_loses_its_separator(self):
        band = Band(30, 200, 1, ('目',), [], 120, 600, kind='label', top=60)
        observed = [Page(1, 600, 800, [Word('1.', 40, 130, 52, 139), Word('款', 40, 70, 49, 79),
                                       Word('2-1', 40, 780, 60, 789), Word('10', 300, 200, 310, 209)], [])]
        words = frame_words(observed, [Logical([1], [band], '円', [])])
        self.assertEqual([(w[0], w[2]) for w in words], [(1, '1'), (1, '款')])


if __name__ == '__main__':
    unittest.main()
