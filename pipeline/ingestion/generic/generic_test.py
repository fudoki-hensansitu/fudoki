import unittest

from ingestion.generic.layout import Band, Glyph, is_amount, logical_pages, page_bands, split_digits_at_rules
from ingestion.generic.observe import Page, Rule, Word, merge_rules
from ingestion.generic.sums import bracket
from ingestion.generic.repair import Report, clip_to_page, crop_to_box
from ingestion.generic.rows import identities
from ingestion.generic.tree import (Built, Group, Item, _leading_amount, _split_code, _split_line, groups, number_span,
                                   owner, same_position, shape_depth, subject_header, subject_items)
from ingestion.generic.units import check as check_units


def glyph(text, x0, y0, width=None):
    width = width if width is not None else 9 * len(text)
    return Glyph(text, x0, y0, x0 + width, y0 + 9, 1, 0)


class RulesTest(unittest.TestCase):
    def test_only_a_declared_gutter_keeps_its_open_amount_column(self):
        horizontals = [Rule(10, y, 200, y) for y in (50, 70, 120, 200)]
        words = [Word('支出済額', 20, 55, 56, 64), Word('不用額', 110, 55, 137, 64),
                 Word('1,000', 40, 80, 70, 89), Word('2,000', 130, 80, 160, 89)]
        for missing, gutter in ((10, 5 / 210), (200, 205 / 210)):
            with self.subTest(missing=missing):
                verticals = [Rule(x, 50, x, 200) for x in (10, 100, 200) if x != missing]
                page = Page(1, 210, 300, words, verticals + horizontals)
                unchanged, _ = page_bands(page)
                self.assertEqual(len(unchanged), 1)
                bands, _ = page_bands(page, {'gutter': gutter})
                self.assertEqual([(b.header, [w.text for w in b.words]) for b in bands],
                                 [(('支出済額',), ['1,000']), (('不用額',), ['2,000'])])

    def test_a_short_horizontal_extension_does_not_create_an_extra_column(self):
        rules = [Rule(x, 50, x, 200) for x in (10, 100)] + [Rule(10, y, 100, y) for y in (50, 70, 200)]
        rules += [Rule(0, y, 100, y) for y in (55, 60)]
        bands, _ = page_bands(Page(1, 110, 300, [], rules), {'gutter': .5})
        self.assertEqual([(b.x0, b.x1) for b in bands], [(10, 100)])

    def test_a_declared_gutter_does_not_split_at_internal_row_endpoints(self):
        rules = [Rule(x, 50, x, 200) for x in (10, 100, 200, 300)]
        rules += [Rule(10, y, 300, y) for y in (50, 70, 120, 200)]
        rules += [Rule(140, y, 300, y) for y in (80, 180)]
        bands, _ = page_bands(Page(1, 400, 300, [], rules), {'gutter': .9})
        self.assertEqual([(b.x0, b.x1) for b in bands], [(10, 100), (100, 200), (200, 300)])

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

    def test_bracketed_amounts_of_a_declared_axis(self):
        read = lambda *words: (lambda label, money: (''.join(g.text for g in label), [''.join(g.text for g in run) for run in money]))(
            *_split_line([glyph(text, x, 100) for text, x in words], amount_brackets=True))
        # The 事業 total in square brackets over the 事務事業 in round ones.
        self.assertEqual(read(('議員人件費', 300), ('[187,037,067]', 500)), ('議員人件費', ['[187,037,067]']))
        # A whole line in brackets: the name and its amount, without the closing bracket.
        self.assertEqual(read(('（委員長', 300), ('780,000）', 500)), ('（委員長', ['780,000']))
        # The bracket flush against a long name inside one word (`…課）(1,04` `7,226)`), cut where it opens.
        self.assertEqual(read(('事務（公共施設マネジ', 300), ('メント課）(1,04', 390), ('7,226)', 507)),
                         ('事務（公共施設マネジメント課）', ['(1,047,226)']))
        # Without the setting, a bracket stays text.
        label, money = _split_line([glyph('議員人件費', 300, 100), glyph('[187,037,067]', 500, 100)])
        self.assertNotEqual([''.join(g.text for g in run) for run in money], ['[187,037,067]'])

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
        # More than one remark: an item with its own amount does not become a note (132209).
        self.assertIsNone(TRANSFER.search(PAREN_TAIL.sub(
            '', '委託料（同事業、備品購入費へ流用△280,000）（同事業、需用費から流用1,815,000）')))
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
    """The spot check must fail on an amount from another row or column, a wrong parent and a partial
    number. Columns come from the page's own header words, as the CLI computes them."""

    HEADER = [('当初予算額', 112, 60, 148, 69), ('計', 182, 60, 188, 69), ('支', 222, 60, 227, 69), ('出', 228, 60, 233, 69),
              ('済', 234, 60, 239, 69), ('額', 240, 60, 245, 69)]
    WORDS = [('1', 10, 100, 14, 109), ('総務費', 16, 100, 43, 109), ('9,000,000', 120, 100, 160, 109),
             ('1', 20, 120, 24, 129), ('総務管理費', 26, 120, 71, 129), ('8,000,000', 120, 120, 160, 129),
             ('1', 30, 140, 34, 149), ('一般管理費', 36, 140, 81, 149), ('10,000', 120, 140, 150, 149), ('12,000', 170, 140, 200, 149),
             ('11,000', 220, 140, 250, 149),
             ('2', 30, 160, 34, 169), ('企画総務費', 36, 160, 81, 169), ('100,000', 115, 160, 150, 169), ('120,000', 165, 160, 200, 169),
             ('99,000', 220, 160, 250, 169),
             ('2', 20, 180, 24, 189), ('企画費', 26, 180, 53, 189), ('1,000,000', 110, 180, 150, 189),
             ('1', 30, 200, 34, 209), ('企画調整費', 36, 200, 81, 209), ('110,000', 115, 200, 150, 209), ('130,000', 165, 200, 200, 209),
             ('5,000明許', 210, 200, 250, 209)]
    RULES = [(x, 50, x, 300) for x in (100, 160, 210, 260)]

    def page(self, words):
        return Page(5, 300, 400, [Word(*w) for w in self.HEADER + words], [Rule(*r) for r in self.RULES])

    def check(self, code, name, kou, amounts, places, words=None):
        from ingestion.generic.spot import rows, stage_columns, verify
        words = words or self.WORDS
        kan = {'key': 'kan', 'code': '1', 'name': '総務費'}
        kous = [{'key': 'kou1', 'code': '1', 'name': '総務管理費'}, {'key': 'kou2', 'code': '2', 'name': '企画費'}]
        box = {w[0]: [5, w[1], w[2], w[3], w[4]] for w in words}
        moku = {'key': 'm', 'code': code, 'name': name, 'page': 5, 'amounts': dict(zip(('approved', 'adjusted', 'executed'), amounts)),
                'positions': dict(zip(('approved', 'adjusted', 'executed'), (box[p] for p in places)))}
        page = self.page(words)
        stages = {5: stage_columns(page)}  # as the CLI does: from the source's header, never from the build
        return verify(moku, kan, kous[kou], {5: rows(self.HEADER + words, 5)}, {'款': [kan], '項': kous}, stages)

    def test_columns_come_from_the_header(self):
        from ingestion.generic.spot import stage_columns
        self.assertEqual(stage_columns(self.page(self.WORDS)), {'approved': (100, 160), 'adjusted': (160, 210), 'executed': (210, 260)})

    def test_a_correct_moku_passes(self):
        self.assertEqual(self.check('1', '一般管理費', 0, (10000, 12000, 11000), ('10,000', '12,000', '11,000')), [])
        self.assertEqual(self.check('1', '企画調整費', 1, (110000, 130000, 5000), ('110,000', '130,000', '5,000明許')), [])

    def test_the_three_amounts_of_the_next_moku_fail(self):
        result = self.check('1', '一般管理費', 0, (100000, 120000, 99000), ('100,000', '120,000', '99,000'))
        self.assertEqual(result, ['番号と名前が行に無い'])

    def test_an_amount_of_another_stage_on_the_same_row_fails(self):
        result = self.check('1', '一般管理費', 0, (10000, 12000, 10000), ('10,000', '12,000', '10,000'))
        self.assertEqual(result, ['金額の列が違う'])

    def test_a_single_moku_reading_its_spent_amount_from_the_initial_column_fails(self):
        # Codex: one 目 only, its 支出済額 read from the 当初予算額 box. Columns inferred from the
        # build would accept it; columns from the header do not.
        one = [w for w in self.WORDS if w[2] <= 149]
        result = self.check('1', '一般管理費', 0, (10000, 12000, 10000), ('10,000', '12,000', '10,000'), words=one)
        self.assertEqual(result, ['金額の列が違う'])

    def test_a_rule_ending_inside_the_header_leaves_the_stages_it_parts_unknown(self):
        # Codex: the rule x=210 between 予算現額 and 支出済額 ends at y=90, above the body. Both
        # headers fall in one body cell 160–260; a 支出済額 read from the 予算現額 box must not pass.
        from ingestion.generic.spot import rows, stage_columns, verify
        rules = [Rule(x, 50, x, 300) for x in (100, 160, 260)] + [Rule(210, 50, 210, 90)]
        one = [w for w in self.WORDS if w[2] <= 149]
        page = Page(5, 300, 400, [Word(*w) for w in self.HEADER + one], rules)
        stages = {5: stage_columns(page)}
        self.assertEqual(stages[5], {'approved': (100, 160)})
        kan = {'key': 'kan', 'code': '1', 'name': '総務費'}
        kou = {'key': 'kou1', 'code': '1', 'name': '総務管理費'}
        box = {w[0]: [5, w[1], w[2], w[3], w[4]] for w in one}
        moku = {'key': 'm', 'code': '1', 'name': '一般管理費', 'page': 5, 'amounts': {'approved': 10000, 'adjusted': 12000, 'executed': 12000},
                'positions': {'approved': box['10,000'], 'adjusted': box['12,000'], 'executed': box['12,000']}}
        self.assertEqual(verify(moku, kan, kou, {5: rows(self.HEADER + one, 5)}, {'款': [kan], '項': [kou]}, stages),
                         ['列を確かめられない'])

    def test_a_spent_amount_on_the_next_page_needs_a_spread(self):
        from ingestion.generic.spot import rows, verify
        kan = {'key': 'kan', 'code': '1', 'name': '総務費'}
        kou = {'key': 'kou1', 'code': '1', 'name': '総務管理費'}
        left = [w for w in self.WORDS if w[2] <= 149 and w[0] != '11,000']
        right = [('支出済額', 22, 60, 58, 69), ('11,000', 20, 140, 50, 149), ('2,000', 60, 140, 90, 149)]
        pages = {5: rows(self.HEADER + left, 5), 6: rows(right, 6)}
        stages = {5: {'approved': (100, 160), 'adjusted': (160, 210)}, 6: {'executed': (10, 60)}}
        box = {w[0]: [5, w[1], w[2], w[3], w[4]] for w in left}
        moku = {'key': 'm', 'code': '1', 'name': '一般管理費', 'page': 5, 'amounts': {'approved': 10000, 'adjusted': 12000, 'executed': 11000},
                'positions': {'approved': box['10,000'], 'adjusted': box['12,000'], 'executed': [6, 20, 140, 50, 149]}}
        others = {'款': [kan], '項': [kou]}
        self.assertEqual(verify(moku, kan, kou, pages, others, stages, spreads={(5, 6)}), [])
        self.assertEqual(verify(moku, kan, kou, pages, others, stages), ['支出済額が同じ行に無い'])  # not a spread

    def test_a_page_without_the_stage_header_cannot_pass(self):
        from ingestion.generic.spot import rows, verify
        kan = {'key': 'kan', 'code': '1', 'name': '総務費'}
        kou = {'key': 'kou1', 'code': '1', 'name': '総務管理費'}
        box = {w[0]: [5, w[1], w[2], w[3], w[4]] for w in self.WORDS}
        moku = {'key': 'm', 'code': '1', 'name': '一般管理費', 'page': 5, 'amounts': {'approved': 10000, 'adjusted': 12000, 'executed': 11000},
                'positions': {'approved': box['10,000'], 'adjusted': box['12,000'], 'executed': box['11,000']}}
        self.assertEqual(verify(moku, kan, kou, {5: rows(self.WORDS, 5)}, {'款': [kan], '項': [kou]}, {5: {}}), ['列を確かめられない'])

    def test_a_wrong_parent_fails(self):
        self.assertEqual(self.check('1', '一般管理費', 1, (10000, 12000, 11000), ('10,000', '12,000', '11,000')), ['親が違う（項）'])

    def test_a_number_inside_a_longer_number_does_not_match(self):
        result = self.check('1', '企画調整費', 1, (10000, 130000, 5000), ('110,000', '130,000', '5,000明許'))
        self.assertEqual(result, ['金額がその位置に無い'])

    def test_a_number_running_into_the_next_column_is_placed_by_its_start(self):
        from ingestion.generic.spot import _in_column
        self.assertTrue(_in_column(('5,000明許', 210, 258), (210, 260)))    # its right edge hides behind 明許
        self.assertFalse(_in_column(('5,000明許', 165, 208), (210, 260)))   # starts in the 予算現額 column


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

    def test_codes_of_the_ancestors_in_their_own_ruled_columns_are_dropped(self):
        from ingestion.generic.tree import strip_ancestor_codes
        bands = self.bands()  # 款・項・目 codes 1.8pt apart across the rules (`2` `1` `10` on a continued page)
        bands[0].words = [glyph('2', 20.0, 166, 9)]
        bands[1].words = [glyph('1', 30.8, 166, 9)]
        bands[2].words = [glyph('10', 41.6, 166, 9), glyph('協働推進費', 52.0, 166)]
        self.assertEqual([g.text for g in strip_ancestor_codes(Group(bands, '科目', True))], ['2', '1'])
        bands = self.bands()  # `61` run across the 款・項 rule, the 目 code joined to its name
        bands[0].words = [glyph('61', 20.0, 166, 19.8)]
        bands[2].words = [glyph('1商', 41.6, 166, 19.5), glyph('工', 66.0, 166), glyph('費', 80.0, 166)]
        self.assertEqual([g.text for g in strip_ancestor_codes(Group(bands, '科目', True))], ['61'])
        bands = self.bands()  # in one column, a code close to a name starting with a digit is no ancestor
        bands[2].words = [glyph('8', 39.9, 166, 4.5), glyph('2歳児健診', 45.4, 166)]
        self.assertEqual(strip_ancestor_codes(Group(bands, '科目', True)), [])

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


class SubjectHeaderTest(unittest.TestCase):
    def test_a_header_cell_that_only_contains_the_word_item_is_no_subject_column(self):
        # `予備費充当項目` (132047): the list of a reserve's uses, not the 款・項・目 column.
        self.assertFalse(subject_header(('予備費充当項目',)))
        self.assertFalse(subject_header(('金額',)))
        self.assertTrue(subject_header(('科目',)))
        self.assertTrue(subject_header(('予算科目',)))
        self.assertTrue(subject_header(('款',)) and subject_header(('項',)) and subject_header(('目',)))
        self.assertTrue(subject_header(('款　項　目',)))
        self.assertTrue(subject_header(('歳出', '(款)(項)(目)')))
        # Known gap: a cell that is only `項目` still reads as the 項・目 column (it was so before), so a list
        # whose heading is a bare `項目` would be read as a subject column too.
        self.assertTrue(subject_header(('項目',)))


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
        shape = lambda value, code=None: shape_of(Item(Group([band], '備考', False), 1, [[glyph(value, 0, 0)]], code, value, 0))
        self.assertEqual([shape('○事業'), shape('(1)運営'), shape('①旅費'), shape('ア 郵便料'), shape('12委託料', '12'),
                          shape('アシスタント')],
                         ['bullet', 'paren', 'circled', 'kana', 'number', None])
        # A name that begins with a digit but has no code is no number (`３階ホール吊り物設備`, 132276).
        self.assertIsNone(shape('３階ホール吊り物設備等保守管理委託料'))
        self.assertEqual(shape('㉓災害急患対応手当'), 'circled')


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

    def test_a_crop_mark_frame_left_of_the_right_page_does_not_stop_the_spread(self):
        rows = [50, 70, 100, 130, 160, 400]
        frame = lambda xs: [Rule(x, 50, x, 400) for x in xs] + [Rule(xs[0], y, xs[-1], y) for y in rows]
        header = lambda texts: [Word(t, x, 55, x + 9 * len(t), 64) for t, x in texts]
        left = Page(1, 300, 500, header([('款項目', 20), ('予算現額', 110)]) + [
            Word('1', 20, 110, 24.5, 119), Word('議会費', 30, 110, 57, 119), Word('1,000', 150, 110, 172.5, 119)],
            frame([10, 100, 200]))
        right = Page(2, 300, 500, header([('支出済額', 60)]) + [Word('9,000', 100, 110, 122.5, 119)],
                     frame([50, 150]) + frame([14, 28, 37]))  # the crop marks: a frame with no header and no words
        logical = logical_pages([left, right])
        self.assertEqual([l.pages for l in logical], [[1, 2]])

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

    def test_the_last_character_of_a_letter_spaced_line_keeps_the_width_of_one_character(self):
        from ingestion.generic.observe import Page, Word
        from ingestion.generic.repair import Report, repair_positions
        page = Page(1, 600, 800, [Word('増', 362.5, 128.5, 371.3, 137.3), Word('減', 397.8, 128.5, 433.1, 137.3)], [])
        report = Report()
        repair_positions(page, report)
        self.assertEqual([(w.text, round(w.x1 - w.x0, 1)) for w in page.words], [('増', 8.8), ('減', 8.8)])
        self.assertEqual(report.letterspaced_glyphs, 1)

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


class ConvertRulesTest(unittest.TestCase):
    """Rules found by connecting the builder to the ingestion entry on 11 jurisdictions (`convert/`)."""

    def page(self, words):
        return Page(1, 1200, 800, [Word(*w) for w in words], [])

    def band(self, words, x0=0, x1=600, header=('備考',)):
        band = Band(x0, x1, 1, header, [], 100, 700)
        band.words = words
        return band

    def test_a_smaller_digit_group_centred_off_the_line_still_joins_the_number_it_continues(self):
        from ingestion.generic.repair import Report, repair_positions
        # `11,148,` and `119` print on one line; the smaller group's centre rounds to the next line, and it
        # was read before the digits it continues (132209).
        page = self.page([('11,148,', 1101.4, 609.8, 1128.6, 617.7), ('119', 1132.3, 609.8, 1144.4, 616.5)])
        repair_positions(page, Report())
        self.assertEqual([w.text for w in page.words], ['11,148,119'])

    def test_a_minus_sign_starts_a_number_and_is_never_inside_one(self):
        from ingestion.generic.repair import Report, repair_positions
        page = self.page([('0△22,990,000', 304.0, 610.8, 358.0, 619.8)])
        repair_positions(page, Report())
        self.assertEqual([w.text for w in page.words], ['0', '△22,990,000'])
        # A sign printed as its own word still joins the number on its right, and a sign never joins backwards.
        page = self.page([('0', 304.0, 610.8, 308.5, 619.8), ('△22,990,000', 308.5, 610.8, 358.0, 619.8)])
        repair_positions(page, Report())
        self.assertEqual([w.text for w in page.words], ['0', '△22,990,000'])

    def test_a_number_takes_the_position_it_fits_best_and_a_start_weighs_more_than_an_end(self):
        from ingestion.generic.tree import nearest_position
        word = lambda text, x: Glyph(text, x, 0, x + 4.2 * len(text), 8.4, 1, 0)
        anchors = [('事業', (936.7, 940.8, 1)), ('節', (944.9, 949.1, 1))]
        # A right-aligned `26`: starts 3.8 from the 事業, ends 0.2 from the 節 (132209).
        self.assertEqual(nearest_position(number_span(word('26', 940.5)), anchors, word('26', 940.5)), '節')
        # A left-aligned `99` between a 事業's start and a 節's end is the 事業 (132217).
        anchors = [('事業', (788.4, 792.6, 1)), ('節', (796.8, 801.0, 1)), ('細節', (805.2, 813.6, 2))]
        self.assertEqual(nearest_position(number_span(word('99', 791.2)), anchors, word('99', 791.2)), '事業')
        self.assertEqual(nearest_position(number_span(word('1', 801.7)), anchors, word('1', 801.7)), '細節')
        self.assertIsNone(nearest_position(number_span(word('1', 700)), anchors, word('1', 700)))

    def test_a_bracket_before_a_number_is_not_part_of_where_the_number_starts(self):
        item, number = glyph('(1)学校行事', 938, 0, 36), glyph('3小学校', 943, 0, 27)
        self.assertAlmostEqual(number_span(item)[0], 942.5, places=1)
        self.assertEqual(number_span(item)[2], 1)
        self.assertTrue(same_position(number_span(item), number_span(number), item))

    def test_a_name_wrapped_in_the_kou_column_stays_with_it_through_the_rows_of_the_moku_column(self):
        bands = [Band(19.8, 28.8, 1, ('款',), [160.7, 187.5], 160.7, 776.8),
                 Band(28.8, 170, 1, ('項',), [160.7, 187.5], 160.7, 776.8),
                 Band(170, 260, 1, ('目',), [160.7, 187.5, 198.5, 250], 160.7, 776.8)]
        bands[1].words = [glyph('4', 116, 190, 4), glyph('その他公共', 123, 190, 40), glyph('、公用施設', 123, 199.4, 40),
                          glyph('災害復旧費', 123, 208.7, 40)]
        bands[2].words = [glyph('1', 172, 208.7, 4), glyph('その他公共', 180, 208.7, 40), glyph('施設、公用', 180, 218, 40)]
        found = subject_items(Group(bands, '科目', True))
        self.assertEqual([(i.level, i.code, i.name) for i in found],
                         [(1, '4', 'その他公共、公用施設災害復旧費'), (2, '1', 'その他公共施設、公用')])

    def test_the_unit_mark_after_an_amount_is_no_part_of_the_name_or_the_amount(self):
        label, money = _split_line([glyph('12,409,365', 1108, 100, 52), glyph('円', 1161, 100, 9)])
        self.assertEqual(label, [])
        self.assertEqual(''.join(g.text for run in money for g in run), '12,409,365')
        label, money = _split_line([glyph('前年度繰越事業費不用額', 900, 100, 99), glyph('393,230円', 1108, 100, 50)])
        self.assertEqual(''.join(g.text for g in label), '前年度繰越事業費不用額')
        self.assertEqual(''.join(g.text for run in money for g in run), '393,230')

    def test_a_total_row_ends_in_the_word_for_it(self):
        from ingestion.generic.tree import TOTAL
        self.assertIsNotNone(TOTAL.search('歳出合計'))
        self.assertIsNotNone(TOTAL.search('合計'))
        self.assertIsNone(TOTAL.search('0102410長期総合計画に要する経費(企画政策課)'))

    def test_an_item_whose_name_starts_with_a_count_has_no_number(self):
        from ingestion.generic.tree import COUNTED, YEAR_LED
        self.assertIsNotNone(COUNTED.match('110番非常通報装置保守点検委託'))
        self.assertIsNotNone(COUNTED.match('3歳児健康診査'))
        self.assertIsNone(COUNTED.match('06番号制度整備事業委託料'))  # 番号 is a name, not a count
        self.assertEqual(YEAR_LED.match('42025年農林業センサス費').group(1), '4')

    def test_a_name_that_wraps_runs_to_the_limit_and_a_short_line_before_an_indented_amount_is_two_items(self):
        from ingestion.generic.tree import items
        header = ('備考',)
        # `02 管理用備品` is short; `ICカードリーダーライター 5,280` is indented under it: two items.
        band = self.band([glyph('02管理用備品', 272.8, 100, 56), glyph('ICカードリーダーライター', 282.2, 112, 112),
                          glyph('5,280', 561.8, 112, 23)], 250, 590)
        found = items(Group([band], '備考', False), '備考', {273, 10282, 283}, None, 583.0)
        self.assertEqual([(i.code, i.name, [''.join(g.text for g in r) for _, r in i.amounts]) for i in found],
                         [('02', '管理用備品', []), (None, 'ICカードリーダーライター', ['5,280'])])
        # The same two lines when the first runs up to the limit are one wrapped name.
        band = self.band([glyph('公共施設等総合管理計画の推進に要する経費（公共施設マネジメント', 291.6, 100, 291.4),
                          glyph('課）', 291.6, 112, 18.8), glyph('35,029', 556.8, 112, 28.2)], 250, 590)
        found = items(Group([band], '備考', False), '備考', set(), None, 583.0)
        self.assertEqual([(i.name, [''.join(g.text for g in r) for _, r in i.amounts]) for i in found],
                         [('公共施設等総合管理計画の推進に要する経費(公共施設マネジメント課)', ['35,029'])])

    def test_a_department_in_brackets_with_its_own_amount_is_a_heading(self):
        from ingestion.generic.tree import department_heading
        item = Item(Group([self.band([])], '備考', False), 1, [[glyph('(財政課)', 956, 100, 36)]], None, '(財政課)', 956)
        item.amounts.append(('備考', [glyph('138,154,166', 1089, 100, 50)]))
        self.assertTrue(department_heading(item))
        item.amounts.clear()
        self.assertFalse(department_heading(item))

    def test_a_note_word_over_or_under_an_amount_belongs_to_the_amount_next_to_it(self):
        from ingestion.generic.tree import items
        # `12,409,365 円` / `流用`: the amount is printed above its word.
        band = self.band([glyph('02管理費', 900, 80, 40), glyph('1,000', 1100, 80, 25),
                          glyph('12,409,365', 1108, 100, 52), glyph('円', 1161, 100, 9), glyph('流用', 1134, 112, 18)], 880, 1170)
        found = items(Group([band], '備考', False), '備考', {900}, None)
        note = next(i for i in found if i.name == '流用')
        self.assertEqual([''.join(g.text for g in r) for _, r in note.amounts], ['12,409,365'])
        # `第３款総務費へ充用` / `△152,462,000` / `第７款…へ充用`: the amount is under its own name.
        band = self.band([glyph('第３款総務費へ充用', 440, 142, 81), glyph('△152,462,000', 507, 154, 59),
                          glyph('第７款健康福祉費へ充用', 440, 165, 99), glyph('△9,233,000', 516, 177, 50)], 430, 600)
        found = items(Group([band], '備考', False), '備考', set(), None)
        self.assertEqual([(i.name, [''.join(g.text for g in r) for _, r in i.amounts]) for i in found],
                         [('第3款総務費へ充用', ['△152,462,000']), ('第7款健康福祉費へ充用', ['△9,233,000'])])

    def test_a_line_with_an_amount_closing_the_numbered_items_under_it_is_the_name_of_the_item_above(self):
        from ingestion.generic.tree import items
        money = lambda text, y: glyph(text, 1100, y, 44)
        # `9 …運営` / `・補助事業費 38,343,659` / `18 負担金… 38,343,659` (132209): the bullet line is the item's own
        # amount line, since the numbered item under it adds up to it.
        band = self.band([glyph('9東大和市シルバー人材センター運営', 936, 100, 149), glyph('・補助事業費', 948, 115, 49),
                          money('38,343,659', 115), glyph('18負担金補助及び交付金', 941, 144, 100), money('38,343,659', 144),
                          glyph('10東大和市社会福祉協議会', 932, 173, 100)], 920, 1170)
        found = items(Group([band], '備考', False), '備考', {936, 10282, 941, 932}, None)
        self.assertEqual([(i.code, i.name, [''.join(g.text for g in r) for _, r in i.amounts]) for i in found[:2]],
                         [('9', '東大和市シルバー人材センター運営・補助事業費', ['38,343,659']),
                          ('18', '負担金補助及び交付金', ['38,343,659'])])
        # A sub-heading whose amount the numbered items under it do not add up to stays an item.
        band = self.band([glyph('9東大和市シルバー人材センター運営', 936, 100, 149), glyph('・補助事業費', 948, 115, 49),
                          money('40,000,000', 115), glyph('18負担金補助及び交付金', 941, 144, 100), money('38,343,659', 144)],
                         920, 1170)
        found = items(Group([band], '備考', False), '備考', {936, 10282, 941}, None)
        self.assertEqual([i.name for i in found], ['東大和市シルバー人材センター運営', '・補助事業費', '負担金補助及び交付金'])

    def test_a_number_that_is_a_word_of_its_own_before_a_name_that_starts_with_a_count_is_a_number(self):
        from ingestion.generic.tree import entries_of
        # `8` `2歳児歯科健診事業` (132225): the number is not `82`, and no number before it is needed to say so.
        band = self.band([glyph('8', 944.3, 350, 4.5), glyph('2歳児', 953.3, 350, 22.5), glyph('歯科健診事業(健康課)', 975.8, 350, 90)],
                         900, 1100)
        found = entries_of(Group([band], '備考', False), {944, 945, 10949})
        self.assertEqual([(code, name) for _, _, code, name in found], [('8', '2歳児歯科健診事業(健康課)')])

    def test_the_numbers_column_a_rule_splits_off_its_names_is_one_column(self):
        from ingestion.generic.layout import Logical
        number = Band(415.9, 422.6, 1, ('節', '区分'), [], 100, 700)
        name = Band(422.6, 482.9, 1, ('節', '区分'), [], 100, 700)
        amount = Band(482.9, 547.6, 1, ('節', '金額'), [], 100, 700)
        amount.kind = 'amount'
        for band in (number, name):
            band.kind = 'label'
        found = groups(Logical([1], [number, name, amount], None, []))
        self.assertEqual([[(b.x0, b.x1) for b in g.bands] for g in found if not g.subject],
                         [[(415.9, 422.6), (422.6, 482.9)]])

    def test_the_end_of_a_bracketed_amount_on_a_wrapped_line_is_not_an_item_number(self):
        from ingestion.generic.tree import entries_of
        # `(同事業、使用料及び賃借料へ流用△` / `66,000)` (132209): `66` is no item, `,000)` no name.
        band = self.band([glyph('13使用料及び賃借料', 941, 100, 80), glyph('66,000)', 941, 115, 30)], 900, 1100)
        found = entries_of(Group([band], '備考', False), {941, 10950})
        self.assertEqual([(code, name) for _, _, code, name in found], [('13', '使用料及び賃借料'), (None, '66,000)')])

    def test_a_bracketed_department_above_the_number_ends_the_name_of_the_item_before(self):
        from ingestion.generic.tree import items
        # `1 市民協働事業費` / `(市民生活課)` / `7 報償費` in one cell (132209): the department belongs to item 1.
        band = self.band([glyph('1市民協働事業費', 937, 100, 80), glyph('10,959,820', 1100, 100, 50),
                          glyph('(市民生活課)', 945, 115, 55), glyph('7報償費', 945, 130, 30), glyph('0', 1160, 130, 4)], 900, 1170)
        found = items(Group([band], '備考', False), '備考', {937, 945, 10941, 10949}, None)
        self.assertEqual([(i.code, i.name) for i in found], [('1', '市民協働事業費(市民生活課)'), ('7', '報償費')])

class ScanRulesTest(unittest.TestCase):
    """Rules found by running the builder on scanned statements (`ingestion/generic/scan.py`)."""

    def test_an_amount_between_the_two_lines_of_a_name_belongs_to_it_unless_a_rule_parts_them(self):
        label = Band(0, 100, 1, ('目',), [100, 250], 90, 300)  # one cell 150pt tall: too tall to count as ruled
        money = Band(100, 200, 1, ('当初予算額',), [100, 250], 90, 300)
        subject = Group([label], '科目', True)
        moku = Item(subject, 1, [[glyph('1衛生施設災', 5, 108)], [glyph('害復旧費', 12, 130)]], '1', '衛生施設災害復旧費', 5,
                    level=0)
        found = {id(subject): [moku]}
        self.assertIs(owner([glyph('1,000', 150, 119, 30)], money, [subject], found), moku)
        money.rows = [100, 120, 250]  # a rule between the name's first line and the amount
        self.assertIsNone(owner([glyph('1,000', 150, 122, 30)], money, [subject], found))
        money.rows = [20, 128, 250]  # a rule between the amount and the name's second line, the cell still tall
        self.assertIsNone(owner([glyph('1,000', 150, 115, 30)], money, [subject], found))

    def page(self, body):
        rules = [Rule(x, 100, x, 300) for x in (10, 50, 100)] + [Rule(10, y, 100, y) for y in (100, 120, 300)]
        words = [Word('目', 20, 105, 30, 115), Word('金額', 60, 105, 80, 115), Word('1', 20, 140, 25, 149)]
        return Page(1, 200, 400, words + [Word(text, 60, y, 95, y + 9) for text, y in body], rules)

    def kind(self, body):
        band = next(b for b in logical_pages([self.page(body)])[0].bands if b.header == ('金額',))
        return band.kind

    def test_a_unit_printed_alone_in_the_body_does_not_make_an_amount_column_a_label_column(self):
        self.assertEqual(self.kind([('円', 125), ('1,000', 140)]), 'amount')

    def test_a_name_column_stays_a_label_column_and_an_amount_with_its_unit_is_no_unit_mark(self):
        from ingestion.generic.layout import UNIT_CELL
        self.assertEqual(self.kind([('円', 125), ('需用費', 140), ('役務費', 155)]), 'label')
        self.assertIsNone(UNIT_CELL.match('1,000円'))


class LevelAndWrapRulesTest(unittest.TestCase):
    """Rules found while tracing why scanned statements put a breakdown on the wrong level (132055, 132101, 132039)."""

    def test_a_chain_of_starts_wider_than_a_step_is_cut_at_its_valley(self):
        from ingestion.generic.tree import split_wide
        # OCR spreads 補助金 (856) and its parts (866) and a few lines between them (861-863), 132055.
        starts = sorted([855.0] * 10 + [856.0] * 500 + [857.0] * 300 + [861.0] * 11 + [862.0] * 3 + [866.0] * 58)
        self.assertEqual([(min(c), max(c)) for c in split_wide(starts)], [(855.0, 857.0), (861.0, 866.0)])
        # Printed text gives a level one x: a narrow chain stays one level.
        self.assertEqual(len(split_wide([100.0, 100.0, 101.5, 102.9])), 1)

    def test_a_repeated_heading_is_the_same_subject_one_character_apart(self):
        from ingestion.generic.tree import same_heading
        self.assertTrue(same_heading('秘書広報費', '秘書広银費'))  # OCR misread of a continuation page, 132055
        self.assertFalse(same_heading('公債費', '元金'))
        self.assertFalse(same_heading('衛生費', '衛生総務費'))
        self.assertFalse(same_heading('予備', '予算'))  # names this short carry no evidence

    def test_a_line_led_by_a_mark_is_an_item_not_the_wrapped_name_of_the_heading_above(self):
        from ingestion.generic.tree import items
        # `あそべえ及び学童クラブの運営に要した経費` / `○あそべえ事業 222,656,920` (132039).
        band = Band(900, 1170, 1, ('備考',), [], 100, 700)
        band.words = [glyph('あそべえ及び学童クラブの運営に要した経費', 926, 100, 180),
                      glyph('○あそべえ事業', 935, 112, 60), glyph('222,656,920', 1100, 112, 50)]
        found = items(Group([band], '備考', False), '備考', None, None, 1110)
        self.assertEqual([i.name for i in found], ['あそべえ及び学童クラブの運営に要した経費', 'あそべえ事業'])

    def test_the_wrap_limit_ignores_a_lone_unit_and_a_few_misread_lines(self):
        from ingestion.generic.layout import Logical
        from ingestion.generic.tree import line_limits
        band = Band(660, 840, 1, ('備考',), [], 100, 700)
        band.kind = 'label'
        band.words = [glyph('円', 825, 100, 8)] + [glyph('障害者青年学級講師謝礼', 702, 110 + 12 * i, 78) for i in range(5)] \
            + [glyph('度任用職員報酬2人4,26L400', 701, 200, 129)]  # an amount OCR read into the label, 132101
        self.assertAlmostEqual(line_limits([Logical([1], [band], '円', [], ocr=True)])['備考'], 780, places=0)
        # Printed text keeps its longest line as the limit; only the lone unit is left out.
        self.assertAlmostEqual(line_limits([Logical([1], [band], '円', [])])['備考'], 830, places=0)


class BreakdownRulesTest(unittest.TestCase):
    """Account codes, carry-over labels, and annotation breakdown rules."""

    def band(self, words, x0=0, x1=600, header=('備考',)):
        band = Band(x0, x1, 1, header, [], 100, 700)
        band.words = words
        return band

    def found(self, words, x0=250, x1=590, margins=None, limit=None):
        from ingestion.generic.tree import items
        return items(Group([self.band(words, x0, x1)], '備考', False), '備考', margins, None, limit)

    def test_a_name_without_a_letter_is_an_account_code_and_its_transfer_words_below_are_one_note(self):
        from ingestion.generic.tree import is_account_code
        self.assertTrue(is_account_code('・020601【010261】'))
        self.assertFalse(is_account_code('役務費'))
        self.assertFalse(is_account_code('）'))  # the last character of a wrapped name, printed with its amount
        found = self.found([glyph('・020601【010261】', 300, 100, 100), glyph('△28,800', 520, 100, 40),
                            glyph('020000へ予算流用減', 300, 112, 100)])
        self.assertEqual([(i.name, [''.join(g.text for g in r) for _, r in i.amounts]) for i in found],
                         [('・020601【010261】020000へ予算流用減', ['△28,800'])])

    def test_amount_marks_do_not_make_an_account_code(self):
        from ingestion.generic.tree import is_account_code
        for value in ('△28,800', '12,846', '1,000', '▲１２８４６', '１２，８４６', '-12846', '－１２８４６'):
            with self.subTest(value=value):
                self.assertFalse(is_account_code(value))
        for value in ('020000', '02-01-02-15-11-01', '・020601【010261】'):
            with self.subTest(value=value):
                self.assertTrue(is_account_code(value))

    def test_a_carry_over_tag_printed_after_an_amount_leaves_the_amount_the_last_run_of_the_line(self):
        label, money = _split_line([glyph('通信運搬費', 300, 100, 45), glyph('597,301', 450, 100, 35),
                                    glyph('一部繰越明許', 500, 100, 60)])
        self.assertEqual(''.join(g.text for run in money for g in run), '597,301')
        self.assertEqual(''.join(g.text for g in label), '通信運搬費')

    def test_lines_that_add_up_to_a_note_are_its_parts_and_a_single_equal_line_is_not(self):
        from ingestion.generic.tree import note_breakdown
        group = Group([self.band([])], '備考', False)

        def item(name, value, role='node'):
            i = Item(group, 1, [[glyph(name, 300, 100, 60)]], None, name, 300, role=role)
            i.amounts.append(('備考', [glyph(value, 520, 100, 40)]))
            return i
        note = item('繰越事業費不用額', '308,157,706', 'annotation')
        parts = [item('役務費', '3,897,706'), item('負担金、補助及び交付金', '304,260,000')]
        note_breakdown([note, *parts])
        self.assertEqual([p.role for p in parts], ['annotation', 'annotation'])
        self.assertEqual({p.hint for p in parts}, {'不用額'})
        single = [item('繰越事業費不用額', '100', 'annotation'), item('委託料', '100')]
        note_breakdown(single)
        self.assertEqual(single[1].role, 'node')
        # A document that prints one part per note says so in its layout settings.
        note_breakdown(single, min_parts=1)
        self.assertEqual((single[1].role, single[1].hint), ('annotation', '不用額'))

    def test_item_numbers_are_the_numbers_alone_and_a_bracketed_code_is_no_amount(self):
        from ingestion.generic.convert import BRACKET_CODE, ITEM_NUMBER
        self.assertEqual([ITEM_NUMBER.sub(r'\1', s) for s in ('1.', '1.職員人件費', '（１）消耗品費', '2.5倍')],
                         ['1', '1職員人件費', '１消耗品費', '2.5倍'])
        self.assertTrue(BRACKET_CODE.fullmatch('【010111】'))
        self.assertIsNone(BRACKET_CODE.fullmatch('【人事課】'))

    def test_note_parts_cannot_cross_a_subject_boundary_or_a_gap(self):
        from ingestion.generic.tree import note_breakdown
        group = Group([self.band([])], '備考', False)
        def item(name, value, y, role='node'):
            i = Item(group, 1, [[glyph(name, 300, y, 60)]], None, name, 300, role=role)
            i.amounts.append(('備考', [glyph(value, 520, y, 40)]))
            return i
        for boundary, gap in ((110, 0), (200, 40)):
            note = item('繰越事業費不用額', '100', 100, 'annotation')
            parts = [item('役務費', '40', 112 + gap), item('負担金', '60', 124 + gap)]
            note_breakdown([note, *parts], (70, boundary))
            self.assertEqual([p.role for p in parts], ['node', 'node'])

    def test_note_breakdown_keeps_expenditure_under_the_next_subject(self):
        from ingestion.generic.layout import Logical
        from ingestion.generic.tree import build
        subject = Band(0, 200, 1, ('目',), [70, 115, 170], 70, 170)
        subject.kind = 'label'
        subject.words = [glyph('1第一費', 5, 80), glyph('2第二費', 5, 121)]
        remark = self.band([glyph('繰越事業費不用額', 300, 105, 100), glyph('100', 520, 105, 40),
                            glyph('役務費', 300, 117, 60), glyph('40', 520, 117, 40),
                            glyph('負担金', 300, 129, 60), glyph('60', 520, 129, 40)], 250, 590)
        remark.kind = 'label'
        built = build([Logical([1], [subject, remark], '円', [])])
        second = next(n for n in built.nodes if n['name_text'] == '第二費')
        self.assertEqual({n['name_text'] for n in built.nodes if n['parent_node_key'] == second['node_key']},
                         {'役務費', '負担金'})

class LayoutNoteSettingsTest(unittest.TestCase):
    """Settings that change whether a line is an item or a note change amounts: they stay inside the axis
    that declares them."""

    def items(self, lines):
        from ingestion.generic.tree import items
        words = [glyph(text, x, y, width) for text, x, y, width in lines]
        return items(Group([Band(0, 1200, 1, ('備考',), [], 100, 700, words)], '備考', False), '備考', None, None, None)

    def test_a_configured_note_kind_makes_the_line_a_note_and_guards_its_amount_band(self):
        from ingestion.generic.tree import apply_layout, note_prefixes
        settings = {'note_kinds': {'市民プール高圧開閉装置等修繕': '債務負担行為'}}
        found = self.items([('市民プール高圧開閉装置等修繕（債務負担行為分）', 300, 100, 200), ('1', 560, 100, 5)])
        result = apply_layout(found, settings, set())
        self.assertEqual([(i.role, i.hint) for i in result], [('annotation', '債務負担行為')])
        self.assertEqual(note_prefixes(settings), ('市民プール高圧開閉装置等修繕',))
        self.assertEqual(note_prefixes({'notes': ['○同目'], 'note_kinds': {'修繕': 'x'}}), ('○同目', '修繕'))

    def test_a_configured_note_kind_does_not_touch_other_lines(self):
        from ingestion.generic.tree import apply_layout
        found = self.items([('修繕料', 300, 100, 30), ('1,000', 560, 100, 40)])
        result = apply_layout(found, {'note_kinds': {'市民プール': '債務負担行為'}}, set())
        self.assertEqual([(i.role, i.hint) for i in result], [('node', None)])

    def test_a_plain_name_is_an_item_only_in_the_axis_that_declares_it(self):
        from ingestion.generic.tree import is_plain_name
        item = self.items([('補充用備品', 300, 100, 50), ('998,580', 560, 100, 40)])[0]
        self.assertTrue(is_plain_name({'備考': {'plain_names': ['補充用備品']}}, item))
        self.assertFalse(is_plain_name({'節': {'plain_names': ['補充用備品']}}, item))
        self.assertFalse(is_plain_name({'備考': {'plain_names': ['備品購入']}}, item))
        self.assertFalse(is_plain_name(None, item))

    def test_the_lines_that_start_at_the_second_name_column_are_siblings_of_the_line_that_opened_it(self):
        from ingestion.generic.tree import apply_layout
        lines = [('給', 300, 100, 9), ('料', 330, 100, 9), ('市長', 360, 100, 18), ('11,580,750', 560, 100, 50),
                 ('副市長', 360, 112, 27), ('9,377,714', 560, 112, 50)]
        found = self.items(lines)
        self.assertEqual(len(found), 2)
        result = apply_layout(found, {'name_columns': True}, set())
        self.assertEqual(result[0].indent, result[1].indent)
        unchanged = apply_layout(self.items(lines), {}, set())
        self.assertNotEqual(unchanged[0].indent, unchanged[1].indent)

class RepeatedParentRowTest(unittest.TestCase):
    """A row with no name that prints only the amounts of the account row above it, in the same columns."""

    def run_rows(self, row_texts):
        from ingestion.generic.tree import repeated_parent_rows
        nodes = [{'node_key': 'm', 'axis_header': '科目'}]
        amounts = [{'node_key': 'm', 'header_path': h, 'amount_text': t, 'physical_page': 1, 'y0': 100., 'y1': 109.}
                   for h, t in (('支出済額', '0'), ('翌年度繰越額', '0'), ('不用額', '30,000,000'))]
        unowned, runs = [], []
        for header, text_ in row_texts:
            record = {'kind': 'amount without row', 'page': 1, 'text': text_, 'header': header}
            unowned.append(record)
            runs.append((record, [glyph(text_, 300 if header == '不用額' else 100, 130, 40)]))
        return repeated_parent_rows(nodes, amounts, unowned, runs), unowned

    def test_a_row_that_repeats_every_amount_of_the_parent_is_recorded_and_no_longer_unowned(self):
        repeated, unowned = self.run_rows([('支出済額', '0'), ('翌年度繰越額', '0'), ('不用額', '30,000,000')])
        self.assertEqual(len(repeated), 3)
        self.assertEqual(unowned, [])

    def test_one_amount_that_differs_by_a_yen_keeps_the_whole_row_unowned(self):
        repeated, unowned = self.run_rows([('支出済額', '0'), ('翌年度繰越額', '0'), ('不用額', '30,000,001')])
        self.assertEqual(repeated, [])
        self.assertEqual(len(unowned), 3)

    def test_an_amount_in_a_column_the_parent_does_not_print_keeps_the_row_unowned(self):
        repeated, unowned = self.run_rows([('支出済額', '0'), ('予算現額／計', '30,000,000')])
        self.assertEqual(repeated, [])
        self.assertEqual(len(unowned), 2)

    def run_budget_row(self, value):
        from ingestion.generic.tree import repeated_parent_rows
        nodes = [{'node_key': 'm', 'axis_header': '科目'}]
        amounts = [{'node_key': 'm', 'header_path': '予算現額／計', 'amount_text': '10,495,000', 'physical_page': 1,
                    'y0': 100., 'y1': 109.}]
        record = {'kind': 'amount without row', 'page': 1, 'text': value, 'header': '予算現額／節／金額'}
        unowned = [record]
        return repeated_parent_rows(nodes, amounts, unowned, [(record, [glyph(value, 500, 130, 40)])]), unowned

    def test_a_nameless_setsu_amount_that_equals_the_parents_amount_of_the_same_phase_is_a_repeat(self):
        repeated, unowned = self.run_budget_row('10,495,000')
        self.assertEqual(len(repeated), 1)
        self.assertEqual(unowned, [])

    def test_a_nameless_setsu_amount_one_yen_off_the_parent_stays_unowned(self):
        repeated, unowned = self.run_budget_row('10,495,001')
        self.assertEqual(repeated, [])
        self.assertEqual(len(unowned), 1)


class PatternNamesTest(unittest.TestCase):
    def test_equal_subject_balances_prefer_complete_names_over_more_breakdown_comparisons(self):
        from ingestion.generic.build import closure
        def node(key, parent, axis, name):
            return {'node_key': key, 'parent_node_key': parent, 'axis_header': axis,
                    'level_header': None, 'name_text': name}
        def amount(key, value):
            return {'node_key': key, 'header_path': '支出済額', 'unit_text': '円', 'amount_text': str(value)}
        nodes = [node('parent', None, '科目', '総務費'), node('child', 'parent', '科目', '一般管理費')]
        amounts = [amount('parent', 100), amount('child', 100)]
        complete = Built(nodes, amounts, [], [])
        separated = Built(nodes + [node('code', None, '科目', None),
                                  node('setsu', 'child', '節', '委託料')],
                          amounts + [amount('setsu', 100)], [], [])
        a, b = closure(complete, 'settlement'), closure(separated, 'settlement')
        self.assertEqual(a['subject_agree'], b['subject_agree'])
        self.assertGreater(b['agree'], a['agree'])
        self.assertGreater(a['score'], b['score'])


class SubjectContinuationTest(unittest.TestCase):
    def build_indented_subjects(self, extra_x=65, extra_y=92, extra_amount=None):
        from ingestion.generic.layout import Logical
        from ingestion.generic.tree import build
        logicals = []
        for page in (1, 2):
            label = Band(0, 140, page, ('科目',), [70, 90, 100, 110, 124, 180], 70, 180, kind='label')
            value = Band(140, 220, page, ('支出済額',), [70, 100, 124, 180], 70, 180, kind='amount')
            make = lambda text, x, y, width: Glyph(text, x, y, x + width, y + 9, page, 0)
            label.words = [make(str(page), 5, 80, 5), make('分担金及び負', 65, 80, 60),
                           make('担金', extra_x, extra_y, 20),
                           make('1', 15, 104, 5), make('広域連合負担', 65, 104, 60),
                           make('金', 65, 116, 10),
                           make('1', 25, 128, 5), make('広域連合分賦金', 65, 128, 70)]
            value.words = [make('100', 160, y, 30) for y in (80, 104, 128)]
            if extra_amount:
                value.words.append(make(extra_amount, 160, extra_y, 30))
            logicals.append(Logical([page], [label, value], '円', []))
        return build(logicals, pattern='indent')

    def test_indented_names_join_before_learning_the_three_subject_levels(self):
        built = self.build_indented_subjects()
        self.assertEqual([(n['name_text'], n['depth']) for n in built.nodes],
                         [('分担金及び負担金', 1), ('広域連合負担金', 2), ('広域連合分賦金', 3)] * 2)
        self.assertEqual([a['amount_text'] for a in built.amounts], ['100'] * 6)
        self.assertEqual((built.nodes[0]['y0'], built.nodes[0]['y1']), (80, 101))
        self.assertEqual([n['parent_node_key'] for n in built.nodes[1:3]],
                         [built.nodes[0]['node_key'], built.nodes[1]['node_key']])
        self.assertEqual(built.unowned, [])

    def test_indented_codeless_lines_at_another_name_position_or_with_money_stay_separate(self):
        for options in ({'extra_x': 70}, {'extra_amount': '7'}):
            with self.subTest(options=options):
                built = self.build_indented_subjects(**options)
                self.assertEqual(sum(n['name_text'] == '担金' for n in built.nodes), 2)
                self.assertEqual(sum(n['name_text'] == '分担金及び負担金' for n in built.nodes), 0)

    def test_a_name_fragment_does_not_split_the_annotation_breakdown_of_its_subject(self):
        from ingestion.generic.layout import Logical
        from ingestion.generic.tree import build
        from ingestion.generic.convert import split_notes
        code = Band(0, 10, 1, ('科目', '目', '目'), [70, 100, 200], 70, 200, kind='label')
        name = Band(10, 120, 1, ('科目', '目'), [70, 100, 200], 70, 200, kind='label')
        value = Band(120, 200, 1, ('支出済額',), [70, 100, 200], 70, 200, kind='amount')
        remark = Band(200, 600, 1, ('備考',), [70, 200], 70, 200, kind='label')
        code.words = [glyph('8', 2, 94, 5)]
        name.words = [glyph('市立社会福祉', 12, 94, 90), glyph('センタ－費', 12, 106, 70)]
        value.words = [glyph('1,000', 140, 94, 50)]
        remark.words = [glyph('繰越事業費不用額', 250, 94, 100), glyph('100', 520, 94, 40),
                        glyph('役務費', 250, 106, 60), glyph('40', 520, 106, 40),
                        glyph('負担金', 250, 118, 60), glyph('60', 520, 118, 40)]
        built = build([Logical([1], [code, name, value, remark], '円', [])])
        self.assertEqual([n['name_text'] for n in built.nodes], ['市立社会福祉センタ-費'])
        kept, nodes, amounts, unresolved, _ = split_notes(built)
        self.assertEqual([a['amount_text'] for a in kept], ['1,000'])
        self.assertEqual(len(nodes), 3)
        self.assertEqual([a['amount_text'] for a in amounts], ['100', '40', '60'])
        self.assertEqual(unresolved, [])

    def build_crossing_rule(self, amount=None, gap=3):
        from ingestion.generic.layout import Logical
        from ingestion.generic.tree import build
        code = Band(0, 10, 1, ('科目', '目', '目'), [70, 100, 200], 70, 200, kind='label')
        name = Band(10, 120, 1, ('科目', '目'), [70, 100, 200], 70, 200, kind='label')
        value = Band(120, 200, 1, ('支出済額',), [70, 200], 70, 200, kind='amount')
        code.words = [glyph('8', 2, 94, 5)]
        name.words = [glyph('市立社会福祉', 12, 94, 90), glyph('センタ－費', 12, 103 + gap, 70)]
        value.words = [glyph('1,000', 140, 94, 50)]
        if amount:
            value.words.append(glyph(amount, 140, 103 + gap, 50))
        return build([Logical([1], [code, name, value], '円', [])])

    def test_name_crossing_its_column_rule_stays_with_the_number_and_keeps_both_lines_position(self):
        built = self.build_crossing_rule()
        self.assertEqual([(n['code_text'], n['name_text'], n['depth']) for n in built.nodes],
                         [('8', '市立社会福祉センタ-費', 1)])
        self.assertEqual((built.nodes[0]['y0'], built.nodes[0]['y1']), (94, 115))
        self.assertEqual([a['amount_text'] for a in built.amounts], ['1,000'])

    def test_an_amount_or_gap_after_a_column_rule_preserves_the_separate_item(self):
        for options in ({'amount': '2,000'}, {'gap': 30}):
            with self.subTest(options=options):
                self.assertEqual(len(self.build_crossing_rule(**options).nodes), 2)

    def build_pages(self, continuation='センター費', amount=None, page=2, header='目', following=None,
                    tail_row_end=200, head_row_start=70):
        from ingestion.generic.layout import Logical
        from ingestion.generic.tree import build

        def logical(number, name, y, money, heading):
            label = Band(0, 120, number, (heading,), [70, 200], 70, 200)
            value = Band(120, 200, number, ('支出済額',), [70, 200], 70, 200)
            label.kind, value.kind = 'label', 'amount'
            label.words = [Glyph(name, 5, y, 110, y + 9, number, 0)]
            value.words = [Glyph(money, 140, y, 190, y + 9, number, 0)] if money else []
            return Logical([number], [label, value], '円', [])

        next_page = logical(page, continuation, 80, amount, header)
        next_page.bands[0].rows = sorted({70, head_row_start, 200})
        if following:
            next_page.bands[0].rows = [70, 90, 200]
            next_page.bands[0].words.append(Glyph(following, 5, 92, 110, 101, page, 0))
        previous_page = logical(1, '8市立社会福祉', 180, '1,000', '目')
        previous_page.bands[0].rows = sorted({70, tail_row_end, 200})
        return build([previous_page, next_page])

    def test_names_in_rows_away_from_the_table_edges_are_not_joined(self):
        for options in ({'tail_row_end': 195}, {'head_row_start': 75}):
            with self.subTest(options=options):
                self.assertEqual(len(self.build_pages(**options).nodes), 2)

    def test_codeless_amountless_subject_name_at_next_page_start_completes_the_previous_name(self):
        built = self.build_pages()
        self.assertEqual([(n['code_text'], n['name_text'], n['physical_page']) for n in built.nodes],
                         [('8', '市立社会福祉センター費', 1)])
        self.assertEqual([(a['amount_text'], a['physical_page']) for a in built.amounts], [('1,000', 1)])
        self.assertEqual(built.unowned, [])

    def test_number_amount_other_column_or_distant_page_does_not_complete_the_name(self):
        for options in ({'continuation': '9センター費'}, {'amount': '1,000'},
                        {'header': '項'}, {'page': 4}, {'continuation': '歳出合計'}):
            with self.subTest(options=options):
                built = self.build_pages(**options)
                self.assertEqual(built.nodes[0]['name_text'], '市立社会福祉')

    def test_all_adjacent_codeless_lines_at_next_page_start_complete_the_name(self):
        built = self.build_pages(continuation='センター', following='費')
        self.assertEqual([n['name_text'] for n in built.nodes], ['市立社会福祉センター費'])


class HeaderCharactersTest(unittest.TestCase):
    def test_ambiguous_character_decomposition_keeps_the_printed_heading(self):
        from ingestion.generic.headers import by_characters, canonical
        known = {'前年度予算額', '決算額', '予算額', '前年度決算額'}
        path = '前／年／度／予／算／額／決／算／額'
        self.assertIsNone(by_characters(path, frozenset(known)))
        self.assertEqual(canonical(path, None, known), path)
        self.assertIsNone(by_characters('乙／甲', frozenset({'甲乙', '乙甲'})))

    def test_a_heading_printed_a_character_or_two_to_a_line_is_the_heading_its_characters_make(self):
        from ingestion.generic.headers import canonical
        known = {'不用額', '予算現額／補正予算額', '翌年度繰越額', '繰越明許費', '継続費逓次繰越', '節／金額'}
        self.assertEqual(canonical('不額／用', None, known), '不用額')
        self.assertEqual(canonical('予現額／算／補正予算額', None, known), '予算現額／補正予算額')
        self.assertEqual(canonical('翌年度越額／繰／越／繰明／許／費', None, known), '翌年度繰越額／繰越明許費')
        self.assertEqual(canonical('翌年度越額／繰／継逓／続／費／次越／繰', None, known), '翌年度繰越額／継続費逓次繰越')
        self.assertEqual(canonical('見知らぬ／見出し', None, known), '見知らぬ／見出し')


class OcrCodeWordTest(unittest.TestCase):
    def test_an_ocr_word_joining_the_code_and_the_name_starts_its_name_after_the_digits(self):
        from ingestion.generic.tree import Group, Item, _measure
        # `10需用費`: 2 half-width digits and 3 kanji over 35pt; a digit is half a kanji wide.
        glyph = Glyph('10需用費', 422.2, 0, 457.2, 9, 1, 0)
        shared = Group.__new__(Group)
        shared.subject = False
        item = Item(shared, 1, [[glyph]], '10', '需用費', 0)
        _measure(item, [glyph], '10', ocr=True)
        self.assertAlmostEqual(item.indent, 422.2 + 2 * 35 / 8, places=3)
        _measure(item, [glyph], '10')
        self.assertAlmostEqual(item.indent, 422.2 + 2 * 35 / 5, places=3)
