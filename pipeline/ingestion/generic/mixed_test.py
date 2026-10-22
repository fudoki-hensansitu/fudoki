import unittest

from types import SimpleNamespace

from ingestion.generic.layout import Logical, logical_pages
from ingestion.generic.mixed import aligned, completing, frame_rules, learn_frames, gated, learn_origins, moved_unread, numbers, shift, unlearned_amounts
from ingestion.generic.observe import Page, Rule, Word
from ingestion.generic.tree import mixed_document, snap_ocr_levels
from ingestion.lib import pdf_rules


def frame(left, right, columns, top=50, header=100, bottom=400):
    """A ruled frame: outer and column rules from the top, the narrow code columns only below the header."""
    verticals = [Rule(x, top, x, bottom) for x in (left, right, *columns['wide'])]
    verticals += [Rule(x, header, x, bottom) for x in columns['narrow']]
    horizontals = [Rule(left, y, right, y) for y in (top, header, bottom)]
    return verticals + horizontals


TEXT = Page(1, 300, 500, [], frame(10, 200, {'wide': (100,), 'narrow': (40,)}))


class MixedPagesTest(unittest.TestCase):
    def test_only_the_pages_of_the_scope_that_ocr_reads(self):
        source = {'ocr': [{'request': {'pages': [146, 147]}}, {'request': {'pages': [413, 999]}}]}
        self.assertEqual(numbers(source, list(range(78, 426))), [146, 147, 413])
        self.assertEqual(numbers({}, [1, 2]), [])

    def test_a_rendered_frame_gets_the_narrow_columns_the_text_pages_draw_in_a_frame_of_its_width(self):
        # The rendered page lost the dotted rule at 40 (x from the frame's left: 30) and is shifted and a little narrow.
        ocr = Page(2, 300, 500, [], frame(20, 208, {'wide': (108,), 'narrow': ()}))
        added = frame_rules(ocr, learn_frames([TEXT]))
        self.assertEqual([(round(r.x0), r.y0, r.y1) for r in added], [(50, 100, 400)])
        self.assertTrue(all(r.vertical for r in added))

    def test_a_frame_the_text_pages_never_print_is_left_alone(self):
        other = Page(2, 300, 500, [], frame(20, 208, {'wide': (80,), 'narrow': ()}))  # a rule on no edge of the layout
        self.assertEqual(frame_rules(other, learn_frames([TEXT])), [])
        wide = Page(2, 300, 500, [], frame(20, 280, {'wide': (108,), 'narrow': ()}))  # not as wide
        self.assertEqual(frame_rules(wide, learn_frames([TEXT])), [])

    def test_a_rule_the_page_has_is_not_added_again(self):
        self.assertEqual(frame_rules(TEXT, learn_frames([TEXT])), [])

    def test_the_hook_adds_the_columns_to_the_rules_read_from_a_render(self):
        detected = pdf_rules.PageRules(2, 300, 500, (pdf_rules.Rule(20, 50, 400, 1.0), pdf_rules.Rule(108, 50, 400, 1.0),
                                                     pdf_rules.Rule(208, 50, 400, 1.0)),
                                       tuple(pdf_rules.Rule(y, 20, 208, 1.0) for y in (50, 100, 400)))
        completed = completing(learn_frames([TEXT]))(detected)
        self.assertEqual([round(r.position) for r in completed.vertical], [20, 50, 108, 208])
        self.assertEqual(completed.horizontal, detected.horizontal)

    def test_a_page_ocr_read_teaches_no_column_kind(self):
        def page(number, label, amount):
            words = [Word('科目', 20, 55, 38, 64), Word('支出済額', 110, 55, 146, 64), Word(label, 20, 120, 56, 129), Word(amount, 150, 120, 172.5, 129)]
            return Page(number, 300, 500, words, frame(10, 200, {'wide': (100,), 'narrow': ()}))
        pages = [page(1, '総務費', '1,000'), page(2, '民生費', '1,0O0')]  # OCR reads a zero as a letter
        kinds = lambda logicals: [[band.kind for band in logical.bands] for logical in logicals]
        self.assertEqual(kinds(logical_pages(pages)), [['label', 'label'], ['label', 'label']])  # the misread figure turns the column into text
        taught = logical_pages(pages, ocr_pages=frozenset({2}))
        self.assertEqual(kinds(taught), [['label', 'amount'], ['label', 'amount']])
        self.assertEqual([logical.ocr for logical in taught], [False, True])

    def test_an_ocr_heading_the_text_pages_print_keeps_their_spelling(self):
        # The scan correction turns `事故繰越し` into `事故繰越` (a misread elsewhere); this document prints the し.
        def page(number):
            words = [Word('科目', 20, 55, 38, 64), Word('事故繰越し', 110, 55, 155, 64), Word('総務費', 20, 120, 56, 129), Word('1,000', 150, 120, 172.5, 129)]
            return Page(number, 300, 500, words, frame(10, 200, {'wide': (100,), 'narrow': ()}))
        taught = logical_pages([page(1), page(2)], ocr_pages=frozenset({2}))
        self.assertEqual([(band.header, band.kind) for band in taught[1].bands], [(('科目',), 'label'), (('事故繰越し',), 'amount')])

    def test_a_page_scanned_off_the_text_frame_is_moved_to_it(self):
        ocr = Page(2, 300, 500, [Word('総務費', 36, 120, 70, 129)], frame(26, 216, {'wide': (116,), 'narrow': ()}))  # 16pt right
        moved = aligned(ocr, learn_origins([TEXT]))
        self.assertEqual((moved.words[0].x0, moved.words[0].x1), (20, 54))
        self.assertEqual(sorted({r.x0 for r in moved.rules if r.vertical}), [10, 100, 200])
        self.assertIs(aligned(TEXT, learn_origins([TEXT])), TEXT)
        wide = Page(2, 300, 500, [], frame(26, 280, {'wide': (116,), 'narrow': ()}))  # no frame of its width: stays
        self.assertIs(aligned(wide, learn_origins([TEXT])), wide)

    def test_ink_ocr_left_unread_in_an_amount_column_is_unowned_where_the_page_is_moved(self):
        from ingestion.generic.scan import declared_unread
        words = [Word('科目', 20, 55, 38, 64), Word('支出済額', 110, 55, 146, 64), Word('総務費', 20, 120, 56, 129), Word('1,000', 150, 120, 172.5, 129)]
        text = Page(1, 300, 500, words, frame(10, 200, {'wide': (100,), 'narrow': ()}))
        ocr = Page(2, 300, 500, [Word(w.text, w.x0 + 16, w.y0, w.x1 + 16, w.y1) for w in words], frame(26, 216, {'wide': (116,), 'narrow': ()}))
        shifts = {2: shift(ocr, learn_origins([text]))}
        self.assertEqual(shifts, {2: -16})
        logicals = logical_pages([text, aligned(ocr, learn_origins([text]))], ocr_pages=frozenset({2}))
        observation = {'pages': [{'page_number': 2, 'unread_ink': [[176, 140, 182, 148], [36, 140, 60, 148]]}]}  # under 支出済額, under 科目
        built = SimpleNamespace(unowned=[])
        declared_unread(built, logicals, None, moved_unread(observation, shifts))
        self.assertEqual([(u['page'], u['box']) for u in built.unowned], [(2, [160, 140, 166, 148])])

    def test_a_line_the_strip_seam_cut_stops_a_mixed_conversion_in_any_column_where_the_page_is_moved(self):
        from ingestion.generic.convert import OCR_GATES
        from ingestion.generic.scan import declared_unread
        words = [Word('科目', 20, 55, 38, 64), Word('支出済額', 110, 55, 146, 64), Word('総務費', 20, 120, 56, 129), Word('1,000', 150, 120, 172.5, 129)]
        text = Page(1, 300, 500, words, frame(10, 200, {'wide': (100,), 'narrow': ()}))
        ocr = Page(2, 300, 500, [Word(w.text, w.x0 + 16, w.y0, w.x1 + 16, w.y1) for w in words], frame(26, 216, {'wide': (116,), 'narrow': ()}))
        shifts = {2: shift(ocr, learn_origins([text]))}
        logicals = logical_pages([text, aligned(ocr, learn_origins([text]))], ocr_pages=frozenset({2}))
        seams = [[176, 140, 182, 148], [36, 160, 60, 168]]  # under 支出済額, under 科目 (a seam's box is unread ink too)
        observation = {'pages': [{'page_number': 2, 'unread_ink': seams, 'unread_seams': seams}]}
        built = SimpleNamespace(unowned=[])
        declared_unread(built, logicals, None, moved_unread(observation, shifts))
        self.assertEqual([(u['kind'], u['box']) for u in built.unowned],
                         [('unread ink in amount column', [160, 140, 166, 148]), ('unread strip seam', [20, 160, 44, 168])])
        self.assertTrue(all(u['kind'] in OCR_GATES for u in built.unowned))

    def test_amounts_in_an_ocr_column_whose_heading_the_text_pages_do_not_print_are_listed(self):
        def page(number, heading):
            words = [Word('科目', 20, 55, 38, 64), Word(heading, 110, 55, 146, 64), Word('総務費', 20, 120, 56, 129), Word('1,000', 150, 120, 172.5, 129)]
            return Page(number, 300, 500, words, frame(10, 200, {'wide': (100,), 'narrow': ()}))
        logicals = logical_pages([page(1, '支出済額'), page(2, '支王済額')], ocr_pages=frozenset({2}))  # OCR misread 出
        self.assertEqual([band.kind for band in logicals[1].bands], ['label', None])
        self.assertEqual([(u['page'], u['text'] if 'text' in u else u['header']) for u in unlearned_amounts(logicals, frozenset({2}))],
                         [(2, '支王済額')])
        self.assertEqual(unlearned_amounts(logical_pages([page(1, '支出済額'), page(2, '支出済額')], ocr_pages=frozenset({2})), frozenset({2})), [])
        ink = {'pages': [{'page_number': 2, 'unread_ink': [[176, 140, 182, 148]]}]}  # a figure OCR left unread under the misread heading
        self.assertEqual([u['box'] for u in unlearned_amounts(logicals, frozenset({2}), ink)], [(150, 120, 172.5, 129), [176, 140, 182, 148]])
        # A column the settings declare not read is no column of no kind.
        ignored = logical_pages([page(1, '支王済額'), page(2, '支王済額')], columns={'支王済額': {'kind': 'ignore'}}, ocr_pages=frozenset({2}))
        self.assertEqual(unlearned_amounts(ignored, frozenset({2}), ink), [])

    def test_an_ocr_page_the_builder_leaves_out_for_a_misread_amount_heading_is_still_gated(self):
        from ingestion.generic import tree
        page = lambda number, words: Page(number, 300, 500, words, frame(10, 200, {'wide': (100,), 'narrow': ()}))
        left = page(1, [Word('科目', 20, 55, 38, 64), Word('支出済額', 110, 55, 146, 64), Word('1', 20, 120, 24.5, 129),
                        Word('総務費', 30, 120, 57, 129), Word('1,000', 150, 120, 172.5, 129)])
        right = page(2, [Word('不用額', 20, 55, 47, 64), Word('備考', 110, 55, 128, 64), Word('0', 80, 120, 84.5, 129)])
        ocr = page(3, [Word('名称', 20, 55, 38, 64), Word('支王済額', 110, 55, 146, 64), Word('給料', 20, 120, 38, 129),
                       Word('2,000', 150, 120, 172.5, 129)])  # OCR misread both headings
        logicals = logical_pages([left, right, ocr], ocr_pages=frozenset({3}))
        built = tree.build(logicals, pattern='bands', detail='indent')
        self.assertEqual([logical.pages for logical in built.skipped], [[3]])  # no 款 column and no amount column
        self.assertEqual([logical.pages for logical in gated(logicals)], [[3]])
        self.assertEqual([(u['page'], u['header']) for u in unlearned_amounts(gated(logicals), frozenset({3}))], [(3, '支王済額')])

    def test_a_lone_sign_over_a_figure_is_no_unreadable_cell_of_a_declared_amount_column(self):
        from ingestion.generic.scan import declared_unread
        words = [Word('科目', 20, 55, 38, 64), Word('支出済額', 110, 55, 146, 64), Word('総務費', 20, 120, 56, 129),
                 Word('△', 150, 110, 158, 119), Word('1,000', 150, 120, 172.5, 129), Word('民生費', 20, 150, 56, 159), Word('O', 165, 150, 172.5, 159)]
        logicals = logical_pages([Page(1, 300, 500, words, frame(10, 200, {'wide': (100,), 'narrow': ()}))])
        built = SimpleNamespace(unowned=[])
        declared_unread(built, logicals, {'支出済額': {'kind': 'amount'}}, None)
        self.assertEqual([u['text'] for u in built.unowned], ['O'])  # the zero OCR read as a letter, not the sign

    def test_rereads_of_an_ocr_reading_need_ocr_pages(self):
        from ingestion.generic.convert import check_ocr_rereads
        rereads = {'amount_readings': [{'id': 'a'}]}
        with self.assertRaises(ValueError):
            check_ocr_rereads(rereads, [])
        with self.assertRaises(ValueError):
            check_ocr_rereads({'name_corrections': [{'observation_id': 'p1:r0'}]}, [])
        check_ocr_rereads(rereads, [146])
        check_ocr_rereads({'name_corrections': [{'page': 1, 'observed_name': 'a'}]}, [])  # bound to a node, not to OCR

    def test_only_a_document_of_printed_and_ocr_pages_has_its_ocr_levels_set_to_the_printed_ones(self):
        page = lambda ocr: Logical([1], [], None, [], ocr=ocr)
        self.assertEqual([mixed_document([page(a), page(b)]) for a, b in ((False, False), (True, True), (False, True))],
                         [False, False, True])  # a text document, a scan, a text document with OCR pages
        centres = [882.0, 891.0, 900.0]
        starts = [878, 879, 880, 885, 886, 888, 899, 900, 901]  # OCR: a mark misread puts a line between two levels
        items = [SimpleNamespace(indent=x) for x in starts]
        snap_ocr_levels(items, centres)
        self.assertEqual([i.indent for i in items], [882.0] * 3 + [891.0] * 3 + [900.0] * 3)
        few = [SimpleNamespace(indent=x) for x in (878, 886)]  # too few lines to say where the levels are
        snap_ocr_levels(few, centres)
        self.assertEqual([i.indent for i in few], [878, 886])
        one = [SimpleNamespace(indent=x) for x in (880, 881, 882, 883)]
        snap_ocr_levels(one, [882.0])  # one printed level: nothing to group
        self.assertEqual([i.indent for i in one], [880, 881, 882, 883])


if __name__ == '__main__':
    unittest.main()
