import unittest

from ingestion.generic.layout import Band, Glyph, is_amount, logical_pages, page_bands, split_digits_at_rules
from ingestion.generic.observe import Page, Rule, Word, merge_rules
from ingestion.generic.sums import bracket
from ingestion.generic.repair import Report, clip_to_page, crop_to_box
from ingestion.generic.rows import identities
from ingestion.generic.tree import (Built, Group, Item, _leading_amount, _split_code, _split_line, number_span, owner,
                                   same_position, shape_depth, subject_items)
from ingestion.generic.units import check as check_units


def glyph(text, x0, y0, width=None):
    width = width if width is not None else 9 * len(text)
    return Glyph(text, x0, y0, x0 + width, y0 + 9, 1, 0)


class RulesTest(unittest.TestCase):
    def test_parallel_strokes_merge_into_one_rule(self):
        rules = merge_rules([Rule(89.6, 80, 89.6, 400), Rule(90.4, 80, 90.4, 400), Rule(91.2, 400, 91.2, 770)])
        self.assertEqual(len(rules), 1)
        self.assertEqual((rules[0].y0, rules[0].y1), (80, 770))

    def test_distant_rules_stay_apart(self):
        rules = merge_rules([Rule(10, 0, 10, 100), Rule(30, 0, 30, 100)])
        self.assertEqual(len(rules), 2)


class LineTest(unittest.TestCase):
    def test_amount_glued_to_a_name_is_split_inside_a_word(self):
        label, money = _split_line([glyph('事務【人事課】112,408,0', 270, 100), glyph('43', 270 + 9 * 16, 100, 9)])
        self.assertEqual(''.join(g.text for g in label), '事務【人事課】')
        self.assertEqual(''.join(g.text for run in money for g in run), '112,408,043')

    def test_separated_amount(self):
        label, money = _split_line([glyph('議長', 291, 100), glyph('7,956,000', 493, 100)])
        self.assertEqual([g.text for g in label], ['議長'])
        self.assertTrue(is_amount(money[0][0].text))


class TrialRulesTest(unittest.TestCase):
    """Shared rules added after trying three jurisdictions the rules had not seen (trial.md)."""

    def test_a_line_of_only_a_grouped_amount_is_an_amount_not_an_item_numbered_10(self):
        label, money = _split_line([glyph('10', 1127, 685, 9), glyph(',000', 1136, 685, 18)])
        self.assertEqual(label, [])
        self.assertEqual(''.join(g.text for run in money for g in run), '10,000')
        label, money = _split_line([glyph('10', 1127, 685, 9)])
        self.assertEqual([g.text for g in label], ['10'])

    def test_digits_split_only_where_a_rule_runs_between_characters(self):
        joined = Word('１１', 21.14, 120.6, 40.94, 129.6)  # 項1・目1 joined by Poppler across the rule at 31.2
        self.assertEqual([w.text for w in split_digits_at_rules(joined, [Rule(31.2, 50, 31.2, 800)])], ['１', '１'])
        overrun = Word('10', 22.0, 120.6, 31.0, 129.6)  # a 10 overrunning a narrow band: the rule crosses the 0
        self.assertEqual([w.text for w in split_digits_at_rules(overrun, [Rule(28.8, 50, 28.8, 800)])], ['10'])

    def test_only_a_rule_between_subject_columns_splits_digits_and_amounts_stay_whole(self):
        rules = [Rule(x, 50, x, 200) for x in (10, 30, 50, 100, 150)] + [Rule(10, y, 150, y) for y in (50, 70, 200)]
        words = [Word('項', 15, 55, 24, 64), Word('目', 35, 55, 44, 64), Word('支出済額', 55, 55, 91, 64), Word('不用額', 105, 55, 132, 64),
                 Word('１１', 20, 80, 40, 89),                 # 項1・目1 joined across the rule at x=30
                 Word('1000', 91, 80, 109, 89),                # an amount the rule at x=100 crosses between digits
                 Word('2,000', 60, 95, 90, 104), Word('3,000', 110, 95, 140, 104)]
        bands, _ = page_bands(Page(1, 200, 300, words, rules))
        self.assertEqual({'／'.join(b.header): [w.text for w in b.words] for b in bands},
                         {'項': ['１'], '目': ['１'], '支出済額': ['1000', '2,000'], '不用額': ['3,000']})

    def test_digits_below_where_a_subject_rule_ends_stay_whole(self):
        rules = [Rule(10, 50, 10, 200), Rule(30, 50, 30, 110), Rule(50, 50, 50, 200), Rule(100, 50, 100, 200)] + \
            [Rule(10, y, 100, y) for y in (50, 70, 200)]
        words = [Word('項', 15, 55, 24, 64), Word('目', 35, 55, 44, 64), Word('支出済額', 55, 55, 91, 64),
                 Word('１１', 20, 80, 40, 89),   # crosses the rule x=30 (y 50–110): split
                 Word('１１', 20, 150, 40, 159),  # below where that rule ends: one word
                 Word('2,000', 60, 95, 90, 104)]
        bands, _ = page_bands(Page(1, 200, 300, words, rules))
        texts = {'／'.join(b.header): [w.text for w in b.words] for b in bands}
        self.assertEqual(texts['項'], ['１', '１１'])
        self.assertEqual(texts['目'], ['１'])

    def test_an_amount_running_into_the_next_band_keeps_its_digits(self):
        self.assertEqual(_leading_amount(glyph('44,406,439,217明許', 662, 700)).text, '44,406,439,217')
        self.assertEqual(_leading_amount(glyph('301,286,948', 662, 700)).text, '301,286,948')

    def test_numbers_of_one_shape_at_another_position_are_another_level(self):
        group = Group([], '備考', False)
        item = lambda code, name, x: Item(group, 1, [[glyph(code, x, 0, 4.5 * len(code)), glyph(name, x + 4.5 * len(code) + 2, 0)]],
                                          code, name, x)
        order, anchors = [], {}
        depths = [shape_depth(item(code, name, x), 1, order, [], anchors)
                  for code, name, x in (('1', '財政管理事務', 944), ('8', '旅費', 962), ('10', '需用費', 958),
                                        ('2', '契約事務', 944), ('4', '共済費', 962.5))]
        self.assertEqual(depths, [1, 2, 2, 1, 2])  # right-aligned 8 and 10 share a level below 事業

    def test_a_header_printed_again_mid_page_is_not_body_and_its_title_names_the_kan(self):
        verticals = [Rule(x, 50, x, 400) for x in (10, 100, 200)]
        horizontals = [Rule(10, y, 200, y) for y in (50, 70, 100, 150, 170, 200, 400)]
        header = lambda y: [Word('科', 20, y, 29, y + 9), Word('目', 40, y, 49, y + 9),
                            Word('支出', 110, y, 128, y + 9), Word('済額', 130, y, 148, y + 9)]
        words = header(55) + [Word('1', 20, 80, 24.5, 89), Word('総務費', 30, 80, 57, 89), Word('1,000', 150, 80, 172.5, 89),
                              Word('第2款', 20, 155, 47, 164), Word('民生費', 50, 155, 77, 164)] + header(175) + \
            [Word('1', 20, 210, 24.5, 219), Word('社会福祉費', 30, 210, 75, 219), Word('2,000', 150, 210, 172.5, 219)]
        logical = logical_pages([Page(1, 300, 500, words, verticals + horizontals)])[0]
        body = [w.text for band in logical.bands for w in band.words]
        self.assertEqual(body, ['1', '総務費', '1', '社会福祉費', '1,000', '2,000'])
        self.assertEqual([(code, name) for code, name, _ in logical.titles], [('2', '民生費')])

    def test_rules_off_the_page_are_dropped_inside_the_box_the_pdf_displays(self):
        import tempfile
        from pathlib import Path
        import pypdfium2 as pdfium
        from ingestion.generic.repair import display_size
        document = pdfium.PdfDocument.new()
        for width, height, rotation in ((595, 842, 0), (842, 1191, 90), (842, 1191, 270), (595, 842, 0)):
            page = document.new_page(width, height)
            page.set_rotation(rotation)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'boxes.pdf'
            document.save(path)
            document.close()
            sizes = display_size(path, [1, 2, 3, 4])
        self.assertEqual(sizes, {1: (595, 842), 2: (1191, 842), 3: (1191, 842), 4: (595, 842)})
        report = Report()
        # The other half of a spread drawn off the page: cut at the box, a rule wholly outside dropped.
        half = Page(4, 595, 842, [Word('支出済額', 40, 100, 80, 110)],
                    [Rule(-300, 120, 500, 120), Rule(-200, 50, -200, 800), Rule(300, 50, 300, 800)])
        clip_to_page(half, report, *sizes[4])
        self.assertEqual(half.rules, [Rule(0, 120, 500, 120), Rule(300, 50, 300, 800)])
        self.assertEqual(report.off_page_rules, 1)
        # A word running past the edge of an unturned page does not turn the box.
        upright = Page(1, 595, 842, [Word('備考', 585, 100, 600, 110)], [Rule(10, 650, 580, 650), Rule(300, 50, 300, 800)])
        clip_to_page(upright, report, *sizes[1])
        self.assertEqual(upright.rules, [Rule(10, 650, 580, 650), Rule(300, 50, 300, 800)])
        # A turned page whose words all lie on the left keeps its rules on the right.
        turned = Page(2, 842, 1191, [Word('議会費', 40, 100, 70, 110)], [Rule(1150, 50, 1150, 800)])
        clip_to_page(turned, report, *sizes[2])
        self.assertEqual(turned.rules, [Rule(1150, 50, 1150, 800)])

    def test_a_page_cut_from_a_spread_by_its_cropbox_keeps_only_its_half(self):
        import tempfile
        from pathlib import Path
        import pypdfium2 as pdfium
        document = pdfium.PdfDocument.new()
        for bottom, top in ((0, 595.5), (595.5, 1191)):  # one A3 spread turned 90°, cut in two by CropBox
            page = document.new_page(842, 1191)
            page.set_rotation(90)
            page.set_cropbox(0, bottom, 842, top)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'spread.pdf'
            document.save(path)
            document.close()
            spread = lambda number: Page(number, 842, 1191, [Word('議会費', 60, 300, 90, 309), Word('支出済額', 700, 100, 740, 109)],
                                         [Rule(50, 120, 1100, 120)])
            pages = [spread(1), spread(2)]
            crop_to_box(path, pages, Report())
        self.assertEqual([[w.text for w in p.words] for p in pages], [['議会費'], ['支出済額']])
        self.assertEqual(pages[1].rules, [Rule(595.5, 120, 1100, 120)])

    def test_an_amount_on_the_name_line_below_the_code_belongs_to_that_item(self):
        band = Band(30, 98, 54, ('科目', '目'), [213.4, 551.4], 101, 551.4)
        group = Group([band], '科目', True)
        moku = Item(group, 54, [[glyph('1', 51, 221, 4)], [glyph('議会費', 51, 232)]], '1', '議会費', 51, level=0)
        amount_band = Band(98, 151, 54, ('予算現額', '当初予算額'), [213.4, 551.4], 101, 551.4)
        found = owner([glyph('82,694,000', 112, 232, 37)], amount_band, [group], {id(group): [moku]})
        self.assertIs(found, moku)

    def test_the_title_amount_keeps_zero_unseparated_and_signed_amounts(self):
        from ingestion.generic.tree import title_amount
        line = lambda *texts: [glyph(t, 20 + 40 * i, 10) for i, t in enumerate(texts)]
        read = lambda *texts: (lambda kind, run: (kind, ''.join(g.text for g in run)))(*title_amount(line(*texts)))
        self.assertEqual(read('第1款', '総務費', '（決算額', '0', '円）'), ('決算額', '0'))
        self.assertEqual(read('第1款', '総務費', '（決算額', '999', '円）'), ('決算額', '999'))
        self.assertEqual(read('第1款', '総務費', '（決算額', '△', '1,000', '円）'), ('決算額', '△1,000'))
        self.assertEqual(read('第2款', '総務費（決算額4,764,369,474円）'), ('決算額', '4,764,369,474'))
        self.assertEqual(title_amount(line('第1款', '総務費')), (None, []))
        self.assertEqual(read('第1款総務費（決算額1,000O0円）'), ('決算額', ''))  # broken after a valid start: unreadable
        self.assertEqual(read('第1款', '総務費', '（決算額', '-1,000', '円）'), ('決算額', '-1,000'))
        self.assertEqual(read('第1款', '総務費', '（決算額', '－1,000', '円）'), ('決算額', '-1,000'))  # NFKC: the same minus

    def test_a_kan_title_becomes_the_kan_node_with_its_amount(self):
        from ingestion.generic.tree import build
        rules = [Rule(x, 50, x, 200) for x in (10, 30, 100, 160)] + [Rule(10, y, 160, y) for y in (50, 70, 110, 200)]
        title = [Word('第1款', 10, 30, 30, 39), Word('総務費', 32, 30, 59, 39), Word('（決算額', 61, 30, 97, 39),
                 Word('0', 99, 30, 103, 39), Word('円）', 105, 30, 123, 39)]
        body = [Word('項', 15, 55, 24, 64), Word('目', 50, 55, 59, 64), Word('支出済額', 110, 55, 146, 64),
                Word('1', 12, 80, 16, 89), Word('総務管理費', 18, 80, 28, 89), Word('1', 32, 80, 36, 89), Word('一般管理費', 38, 80, 83, 89),
                Word('0', 150, 80, 154, 89), Word('1,000', 130, 120, 155, 129)]
        built = build(logical_pages([Page(1, 300, 300, title + body, rules)]))
        kan = [n for n in built.nodes if n['level_header'] == '款']
        self.assertEqual([(n['code_text'], n['name_text'], n['depth']) for n in kan], [('1', '総務費', 1)])
        self.assertIn(('決算額', '0'), [(a['header_path'], a['amount_text']) for a in built.amounts if a['node_key'] == kan[0]['node_key']])
        unreadable = build(logical_pages([Page(1, 300, 300, title[:3] + [Word('1,0', 99, 30, 110, 39), Word('O0円）', 111, 30, 135, 39)] + body, rules)]))
        self.assertIn('unreadable amount', [u['kind'] for u in unreadable.unowned])

    def test_a_parenthesised_transfer_remark_does_not_make_its_item_a_note(self):
        from ingestion.generic.tree import PAREN_TAIL, TRANSFER
        self.assertIsNone(TRANSFER.search(PAREN_TAIL.sub('', '需用費（同事業、委託料へ流用△1,815,000）')))
        self.assertIsNotNone(TRANSFER.search(PAREN_TAIL.sub('', '○同目・旅費から同目・災害補償費へ流用')))

    def test_the_separator_after_a_number_is_not_part_of_the_name(self):
        self.assertEqual(_split_code('1.議会費'), ('1', '議会費'))
        self.assertEqual(_split_code('01.01.01から流用'), ('01', '.01.01から流用'))  # a dotted code stays as printed

    def test_a_summary_reprinting_the_detail_kan_counts_once_and_nothing_else_is_merged(self):
        from ingestion.generic.units import general_total

        def built(rows, total_text, total_unit='円'):
            nodes = [{'node_key': f'k{i}', 'parent_node_key': None, 'axis_header': '科目', 'code_text': code, 'name_text': name}
                     for i, (code, name, _, _) in enumerate(rows)]
            amounts = [{'node_key': f'k{i}', 'header_path': '支出済額', 'amount_text': text, 'unit_text': unit}
                       for i, (_, _, text, unit) in enumerate(rows)]
            total = [{'kind': 'total amount', 'header': '支出済額', 'text': total_text, 'label': '歳出合計', 'unit': total_unit}]
            return Built(nodes, amounts, [], total)

        summary = [('1', '議会費', '139,266,890', '円'), ('2', '総務費', '1,954,817,466', '円')]
        reprinted = built(summary + summary, '2,094,084,356')
        self.assertTrue(check_units(reprinted, 'settlement')['sum_matches'])
        self.assertEqual(general_total(reprinted.nodes, reprinted.amounts, 'settlement'), 2094084356)
        # The same numbers in another unit are not the same 款: the yen sum no longer matches.
        other_unit = built(summary + [(c, n, t, '千円') for c, n, t, _ in summary], '2,094,084,356')
        self.assertTrue(check_units(other_unit, 'settlement')['stopped'])
        # A detail that does not list the same 款 is no reprint: everything counts and the check stops.
        partial = built(summary + summary[:1], '2,094,084,356')
        self.assertTrue(check_units(partial, 'settlement')['stopped'])
        # A 款 of 0 that only the summary prints does not break the reprint.
        zero = built(summary + [('3', '災害復旧費', '0', '円')] + summary, '2,094,084,356')
        self.assertTrue(check_units(zero, 'settlement')['sum_matches'])
        # One 款 printing the phase twice: agreeing printings count once, disagreeing ones stop the build.
        def two(second_header, second_text):
            nodes = [{'node_key': 'k', 'parent_node_key': None, 'axis_header': '科目', 'code_text': '1', 'name_text': '議会費'}]
            amounts = [{'node_key': 'k', 'header_path': '支出済額', 'amount_text': '100', 'unit_text': '円'},
                       {'node_key': 'k', 'header_path': second_header, 'amount_text': second_text, 'unit_text': '円'}]
            return Built(nodes, amounts, [], [{'kind': 'total amount', 'header': '支出済額', 'text': '100', 'label': '歳出合計', 'unit': '円'}])
        agree, disagree = check_units(two('決算額', '100'), 'settlement'), check_units(two('決算額', '200'), 'settlement')
        self.assertTrue(agree['sum_matches'] and not agree['stopped'])
        self.assertTrue(disagree['stopped'])
        self.assertEqual(disagree['conflicts'][0]['printed'], [(100, '円'), (200, '円')])
        self.assertIsNone(general_total(two('決算額', '200').nodes, two('決算額', '200').amounts, 'settlement'))
        # 款 with neither number nor name are never merged.
        unnamed = built([(None, None, '139,266,890', '円')] * 2, '139,266,890')
        self.assertEqual(check_units(unnamed, 'settlement')['kan_sum'], 2 * 139266890)

    def test_an_amount_on_the_line_below_its_item_belongs_to_it_only_within_its_cell(self):
        band = Band(40, 125, 50, ('科目', '目'), [213.4, 551.4], 101, 551.4)
        group = Group([band], '科目', True)
        moku = Item(group, 50, [[glyph('1.', 72, 230, 6), glyph('議会費', 80, 230)]], '1', '議会費', 72, level=0)
        amount_band = Band(125, 186, 50, ('予算現額', '当初予算額'), [213.4, 551.4], 101, 551.4)
        found = owner([glyph('142,678,000', 130, 242, 44)], amount_band, [group], {id(group): [moku]})
        self.assertIs(found, moku)
        # A rule at y=120 between the name (106–115) and the amount (122–131): another cell, unowned.
        ruled = Band(125, 186, 50, ('予算現額', '当初予算額'), [100, 120, 200], 90, 300)
        named = Item(group, 50, [[glyph('1', 72, 106, 6), glyph('議会費', 80, 106)]], '1', '議会費', 72, level=0)
        self.assertIsNone(owner([glyph('1,000', 130, 122, 25)], ruled, [group], {id(group): [named]}))

    def test_numbers_align_by_start_or_by_end_with_a_digit_more_or_less(self):
        one, ten = glyph('1報酬', 795, 0, 22.5), glyph('10需用費', 790.3, 0, 31.5)  # right-aligned 1 and 10
        self.assertTrue(same_position(number_span(ten), number_span(one), ten))
        business, item = glyph('0106200広域', 782, 0, 54), glyph('01消耗品費', 801, 0, 45)  # ends meet by chance
        self.assertFalse(same_position(number_span(item), number_span(business), item))
        self.assertEqual(number_span(glyph('13使用料', 791, 0, 40)), (791, 800.0, 2))  # digits' own width, not the word's average


class SpotTest(unittest.TestCase):
    """The spot check must fail on an amount from another row or column, a wrong parent and a partial number."""

    WORDS = [('1', 10, 100, 14, 109), ('総務費', 16, 100, 43, 109), ('9,000,000', 120, 100, 160, 109),
             ('1', 20, 120, 24, 129), ('総務管理費', 26, 120, 71, 129), ('8,000,000', 120, 120, 160, 129),
             ('1', 30, 140, 34, 149), ('一般管理費', 36, 140, 81, 149), ('10,000', 120, 140, 150, 149), ('12,000', 170, 140, 200, 149),
             ('11,000', 220, 140, 250, 149),
             ('2', 30, 160, 34, 169), ('企画総務費', 36, 160, 81, 169), ('100,000', 115, 160, 150, 169), ('120,000', 165, 160, 200, 169),
             ('99,000', 220, 160, 250, 169),
             ('2', 20, 180, 24, 189), ('企画費', 26, 180, 53, 189), ('1,000,000', 110, 180, 150, 189),
             ('1', 30, 200, 34, 209), ('企画調整費', 36, 200, 81, 209), ('110,000', 115, 200, 150, 209), ('130,000', 165, 200, 200, 209),
             ('5,000明許', 210, 200, 250, 209)]
    STAGES = {('approved', 1): 150, ('adjusted', 1): 200, ('executed', 1): 250}

    def check(self, code, name, kou, amounts, places):
        from ingestion.generic.spot import rows, verify
        kan = {'key': 'kan', 'code': '1', 'name': '総務費'}
        kous = [{'key': 'kou1', 'code': '1', 'name': '総務管理費'}, {'key': 'kou2', 'code': '2', 'name': '企画費'}]
        box = {w[0]: [5, w[1], w[2], w[3], w[4]] for w in self.WORDS}
        moku = {'key': 'm', 'code': code, 'name': name, 'page': 5, 'amounts': dict(zip(('approved', 'adjusted', 'executed'), amounts)),
                'positions': dict(zip(('approved', 'adjusted', 'executed'), (box[p] for p in places)))}
        return verify(moku, kan, kous[kou], {5: rows(self.WORDS, 5)}, {'款': [kan], '項': kous}, self.STAGES)

    def test_a_correct_moku_passes(self):
        self.assertEqual(self.check('1', '一般管理費', 0, (10000, 12000, 11000), ('10,000', '12,000', '11,000')), [])
        self.assertEqual(self.check('1', '企画調整費', 1, (110000, 130000, 5000), ('110,000', '130,000', '5,000明許')), [])

    def test_the_three_amounts_of_the_next_moku_fail(self):
        result = self.check('1', '一般管理費', 0, (100000, 120000, 99000), ('100,000', '120,000', '99,000'))
        self.assertEqual(result, ['番号と名前が行に無い'])

    def test_an_amount_of_another_stage_on_the_same_row_fails(self):
        result = self.check('1', '一般管理費', 0, (10000, 12000, 10000), ('10,000', '12,000', '10,000'))
        self.assertEqual(result, ['金額の列が違う'])

    def test_a_number_running_into_the_next_column_is_placed_by_its_start(self):
        from ingestion.generic.spot import _in_column
        stages = {('approved', 1): 150, ('adjusted', 1): 200, ('executed', 1): 250}
        self.assertTrue(_in_column(('5,000明許', 210, 258), 'executed', 1, stages))   # its right edge hides behind 明許
        self.assertFalse(_in_column(('5,000明許', 160, 208), 'executed', 1, stages))  # starts in the 予算現額 column

    def test_a_wrong_parent_fails(self):
        self.assertEqual(self.check('1', '一般管理費', 1, (10000, 12000, 11000), ('10,000', '12,000', '11,000')), ['親が違う（項）'])

    def test_a_number_inside_a_longer_number_does_not_match(self):
        result = self.check('1', '企画調整費', 1, (10000, 130000, 5000), ('110,000', '130,000', '5,000明許'))
        self.assertEqual(result, ['金額がその位置に無い'])


class RowsTest(unittest.TestCase):
    """Two builds compare row by row: a value, a parent, a printed place or a count each shows."""

    def table(self, value='100', parent='p1', page=1, box=(100, 20, 130, 30), copies=1):
        nodes = [{'node_key': 'p1', 'parent_node_key': None, 'axis_header': '科目', 'code_text': '1', 'name_text': '総務費',
                  'level_header': '款', 'depth': 1, 'physical_page': 1, 'x0': 10, 'y0': 20, 'x1': 40, 'y1': 30},
                 {'node_key': 'p2', 'parent_node_key': None, 'axis_header': '科目', 'code_text': '2', 'name_text': '民生費',
                  'level_header': '款', 'depth': 1, 'physical_page': 1, 'x0': 10, 'y0': 40, 'x1': 40, 'y1': 50},
                 {'node_key': 'c', 'parent_node_key': parent, 'axis_header': '科目', 'code_text': '1', 'name_text': '一般管理費',
                  'level_header': '項', 'depth': 2, 'physical_page': 1, 'x0': 20, 'y0': 60, 'x1': 60, 'y1': 70}]
        amounts = [{'node_key': 'c', 'header_path': '支出済額', 'amount_text': value, 'unit_text': '円', 'physical_page': page,
                    'x0': box[0], 'y0': box[1], 'x1': box[2], 'y1': box[3]}] * copies
        return identities(nodes, amounts)

    def test_each_kind_of_change_shows(self):
        from ingestion.generic.rows import changes
        base = self.table()
        self.assertEqual(changes(base, self.table())['gone'], 0)
        for changed in (self.table(value='200'), self.table(parent='p2'), self.table(page=2, box=(200, 80, 230, 90)),
                        self.table(box=(100, 21, 130, 31)), self.table(copies=2)):
            diff = changes(base, changed)
            self.assertTrue(diff['gone'] or diff['added'])


class SubjectTest(unittest.TestCase):
    def bands(self):
        return [Band(19.8, 28.8, 1, ('款',), [160.7, 187.5], 160.7, 776.8),
                Band(28.8, 37.7, 1, ('項',), [160.7, 187.5], 160.7, 776.8),
                Band(37.7, 95.8, 1, ('目',), [160.7, 187.5], 160.7, 776.8)]

    def test_codes_in_each_level_band_split_and_the_wrapped_name_joins_the_deepest(self):
        bands = self.bands()
        bands[0].words = [glyph('3', 22.1, 166, 4.5)]
        bands[1].words = [glyph('2', 31.0, 166, 4.5)]
        bands[2].words = [glyph('1', 39.9, 166, 4.5), glyph('児童福祉', 46.6, 159), glyph('総務費', 46.6, 172)]
        found = subject_items(Group(bands, '科目', True))
        self.assertEqual([(i.level, i.code, i.name) for i in found],
                         [(0, '3', ''), (1, '2', ''), (2, '1', '児童福祉総務費')])

    def test_a_name_that_runs_across_bands_stays_one_item(self):
        bands = self.bands()
        bands[0].words = [glyph('1議', 22.1, 166, 15.7)]
        bands[2].words = [glyph('会', 57.0, 166), glyph('費', 85.3, 166)]
        found = subject_items(Group(bands, '科目', True))
        self.assertEqual([(i.level, i.code, i.name) for i in found], [(0, '1', '議会費')])

    def test_two_digit_code_split_by_poppler_stays_one_code(self):
        bands = self.bands()
        bands[0].words = [glyph('1', 19.8, 166, 4.5), glyph('0', 24.3, 166, 4.5)]
        bands[1].words = [glyph('2', 31.0, 166, 4.5)]
        bands[2].words = [glyph('2', 39.9, 166, 4.5)]
        found = subject_items(Group(bands, '科目', True))
        self.assertEqual([(i.level, i.code) for i in found], [(0, '10'), (1, '2'), (2, '2')])


class SumTest(unittest.TestCase):
    def test_sums_decide_the_bracketing(self):
        # 総務費 5,000 = 総務管理費 3,000 (= 一般管理費 2,000 + 文書費 1,000) + 徴税費 2,000 (= 税務総務費 2,000)
        values = [3000, 2000, 1000, 2000, 2000]
        parents, count = bracket(values, [None] * 5, 5000, 'sum')
        self.assertEqual(parents, [-1, 0, 0, -1, 3])
        self.assertEqual(count, 1)

    def test_equal_amounts_are_ambiguous_until_numbering_narrows_them(self):
        # 1,000 / 1,000 / 1,000 summing to 2,000: either the first or the second holds the third.
        self.assertEqual(bracket([1000, 1000, 1000], [None] * 3, 2000, 'sum')[1], 2)
        parents, count = bracket([1000, 1000, 1000], [1, None, 2], 2000, 'code+sum')
        self.assertEqual((parents, count), ([-1, 0, -1], 1))

    def test_unclosed_sequence_reports_no_bracketing(self):
        self.assertEqual(bracket([1000, 500], [None, None], 2000, 'sum'), (None, 0))


if __name__ == '__main__':
    unittest.main()


class RepairTest(unittest.TestCase):
    def page(self, words):
        from ingestion.generic.observe import Page, Word
        return Page(1, 600, 800, [Word(*w) for w in words], [])

    def test_touching_digits_join_but_never_backwards(self):
        from ingestion.generic.repair import Report, repair_positions
        page = self.page([('1', 10, 100, 14.4, 109), ('3', 14.4, 100, 18.8, 109), (',', 18.8, 100, 21, 109),
                          ('0', 200, 100, 204, 109), ('272', 100, 100.4, 113, 109.4)])
        report = Report()
        repair_positions(page, report)
        self.assertEqual(sorted(w.text for w in page.words), ['0', '13,', '272'])

    def test_a_character_drawn_as_two_overlapping_glyphs_becomes_one_word(self):
        from ingestion.generic.repair import Report, repair_positions
        page = self.page([('八', 676.6, 130.5, 685.9, 139.2), ('刀', 676.6, 130.5, 684.4, 139.2)])
        repair_positions(page, Report())
        self.assertEqual([w.text for w in page.words], ['八刀'])

    def test_dictionary_respects_context(self):
        from ingestion.generic.repair import Report, apply_dictionary
        page = self.page([('誰でも使える', 0, 0, 50, 9), ('介誰保険', 0, 20, 40, 29), ('１゜0', 0, 40, 20, 49), ('゜', 0, 60, 5, 69)])
        report = Report()
        apply_dictionary(page, report)
        self.assertEqual([w.text for w in page.words], ['誰でも使える', '介護保険', '１00', '0'])
        self.assertEqual(report.hits['誰→護'], 1)

    def test_health_needs_misreadings_not_missing_headings(self):
        from ingestion.generic.repair import health, is_broken
        narrative = self.page([('動物の適正な捕獲を行った', 0, 0, 100, 9)])
        self.assertFalse(is_broken(health([narrative])))
        misread = self.page([('需用晋 旅晋 連営 施設幣備 健巌 派憤', 0, 0, 200, 9)])
        self.assertTrue(is_broken(health([misread])))

    def test_glyphs_never_join_across_a_vertical_rule(self):
        from ingestion.generic.observe import Rule
        from ingestion.generic.repair import Report, words_from_glyphs
        glyphs = [((10, 100, 14, 106), '1'), ((14.5, 100, 18.5, 106), '0'), ((19.5, 100, 23.5, 106), '5')]
        self.assertEqual([w.text for w in words_from_glyphs(glyphs, Report())], ['105'])
        split = words_from_glyphs(glyphs, Report(), [Rule(19, 90, 19, 120)])
        self.assertEqual(sorted(w.text for w in split), ['10', '5'])


class PatternTest(unittest.TestCase):
    def test_vertical_characters_in_one_column_read_as_one_word(self):
        from ingestion.generic.observe import Page, Rule, Word
        from ingestion.generic.repair import Report, join_vertical
        page = Page(1, 600, 800, [Word('保', 68, 174.6, 77, 183.6), Word('健', 68, 183.6, 77, 192.6),
                                  Word('費', 68, 192.6, 77, 201.6), Word('1', 82.6, 186.8, 87.1, 195.8)],
                    [Rule(80, 150, 80, 300)])
        join_vertical(page, Report())
        self.assertIn('保健費', [w.text for w in page.words])

    def test_numbering_shapes(self):
        from ingestion.generic.tree import Item, shape_of
        band = Band(0, 100, 1, ('備考',), [], 0, 100)
        shape = lambda value: shape_of(Item(Group([band], '備考', False), 1, [[glyph(value, 0, 0)]], None, value, 0))
        self.assertEqual([shape('○事業'), shape('(1)運営'), shape('①旅費'), shape('ア 郵便料'), shape('12委託料'), shape('アシスタント')],
                         ['bullet', 'paren', 'circled', 'kana', 'number', None])


class UnitTest(unittest.TestCase):
    def test_default_by_document_kind_when_nothing_is_printed(self):
        from ingestion.generic.layout import Logical
        from ingestion.generic.units import resolve
        pages = [Logical([1], [], None, []), Logical([2], [], None, [])]
        self.assertEqual(resolve(pages, 'initial')['default'], 1)
        self.assertEqual([p.unit for p in pages], ['千円', '千円'])

    def test_kan_sum_must_equal_the_printed_total(self):
        from ingestion.generic.tree import Built
        from ingestion.generic.units import check
        nodes = [{'node_key': 'k', 'axis_header': '科目', 'parent_node_key': None}]
        amounts = [{'node_key': 'k', 'header_path': '本年度予算額', 'amount_text': '281,800,047', 'unit_text': '千円'}]
        total = [{'kind': 'total amount', 'header': '本年度予算額', 'text': '56,360,000', 'label': '歳出合計'}]
        result = check(Built(nodes, amounts, [], total), 'initial')
        self.assertTrue(result['stopped'])
        self.assertFalse(result['sum_matches'])


class SpreadAndOwnerTest(unittest.TestCase):
    def test_a_subject_row_ignores_the_other_half_still_in_its_header(self):
        from ingestion.generic.layout import Logical
        from ingestion.generic.tree import subject_row
        left = Band(99, 169, 248, ('予算現額', '当初予算額'), [148.0, 171.5, 195.0], 148.0, 800)
        right = Band(600, 670, 249, ('支出済額',), [171.5, 195.0], 171.5, 800)  # a taller header on the right page
        left.kind = right.kind = 'amount'
        group = Group([Band(5, 20, 248, ('科目', '款'), [148.0, 171.5], 148.0, 800)], '科目', True)
        repeat = Item(group, 248, [[glyph('4', 13, 155)]], '4', '', 13, level=0)  # `4 2 3 し尿処理費` above `5 労働費`
        self.assertEqual(subject_row(repeat, Logical([248, 249], [left, right], '円', [])), (148.0, 171.5))

    def test_spread_halves_match_rows_under_one_shift(self):
        from ingestion.generic.layout import same_rows
        from ingestion.generic.observe import Page, Rule
        rows = lambda ys: [Rule(10, y, 500, y) for y in ys]
        left = Page(1, 600, 800, [], rows([140.8, 160.9, 181.1, 201.3, 221.4]))
        right = Page(2, 600, 800, [], rows([139.0, 159.2, 179.3, 199.5, 219.6]))
        other = Page(3, 600, 800, [], rows([300, 420, 600]))
        self.assertTrue(same_rows(left, right))
        self.assertFalse(same_rows(left, other))

    def test_leading_zero_is_a_bullet_and_marks_leave_the_name(self):
        from ingestion.generic.tree import _split_code
        self.assertEqual(_split_code('0ごみ・資源の排出'), (None, 'ごみ・資源の排出'))
        self.assertEqual(_split_code('〇区議会の運営'), (None, '区議会の運営'))
        self.assertEqual(_split_code('12委託料'), ('12', '委託料'))

    def test_a_word_starting_with_a_comma_continues_the_number(self):
        from ingestion.generic.observe import Page, Word
        from ingestion.generic.repair import Report, repair_positions
        page = Page(1, 600, 800, [Word('2', 100, 100, 104, 109), Word(',181', 108, 100, 122, 109),
                                  Word(',817', 126, 100, 140, 109)], [])
        repair_positions(page, Report())
        self.assertEqual([w.text for w in page.words], ['2,181,817'])

    def test_a_number_ending_with_a_comma_continues_on_its_right(self):
        from ingestion.generic.observe import Page, Word
        from ingestion.generic.repair import Report, repair_positions
        page = Page(1, 600, 800, [Word('5,', 1119.0, 345.2, 1124.7, 354), Word('184,344', 1128.4, 345.2, 1158.3, 354)], [])
        repair_positions(page, Report())
        self.assertEqual([w.text for w in page.words], ['5,184,344'])

    def test_amount_goes_to_the_item_on_its_line_before_its_cell(self):
        from ingestion.generic.tree import Group, Item, owner
        label = Band(0, 100, 1, ('目',), [100, 200], 90, 300)
        money = Band(100, 200, 1, ('支出済額',), [100, 200], 90, 300)
        subject = Group([label], '科目', True)
        setsu_band = Band(50, 100, 1, ('節',), [100, 200], 90, 300)
        setsu = Group([setsu_band], '節', False)
        moku = Item(subject, 1, [[glyph('3趣旨普及費', 5, 108)]], '3', '趣旨普及費', 5, level=0)
        sub = Item(setsu, 1, [[glyph('7報償費', 55, 150)]], '7', '報償費', 55)
        found = {id(subject): [moku], id(setsu): [sub]}
        self.assertIs(owner([glyph('2,260,000', 120, 108, 40)], money, [subject, setsu], found), moku)
        self.assertIs(owner([glyph('1,000', 120, 150, 30)], money, [subject, setsu], found), sub)
