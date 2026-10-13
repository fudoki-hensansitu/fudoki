"""Legal-form statement pieces that do not need a PDF: amounts, headers, 備考 levels, rules."""
import unittest

import numpy as np

from ingestion.fiscal.layouts.settlement_statement import statement as st
from ingestion.lib import pdf_rules
from shared.amount import number


def box(text, x0, y0, x1, y1, ident='b', page=1, parts=()):
    return st.Box(ident, page, text, x0, y0, x1, y1, parts)


class AmountTextTest(unittest.TestCase):
    def test_ocr_spacing_rule_marks_and_half_brackets_are_layout(self):
        self.assertEqual(st.amount_text([box('53, 155,000', 0, 0, 1, 1)]), '53,155,000')
        self.assertEqual(st.amount_text([box('396,017,000/', 0, 0, 1, 1)]), '396,017,000')
        self.assertEqual(st.amount_text([box('38,881,500）', 0, 0, 1, 1)]), '38,881,500')
        self.assertEqual(st.amount_text([box('（38,881,500）', 0, 0, 1, 1)]), '（38,881,500）')

    def test_periods_grouping_thousands_are_commas_but_other_text_stays(self):
        self.assertEqual(st.amount_text([box('528.435', 0, 0, 1, 1)]), '528,435')
        self.assertEqual(st.amount_text([box('6.71', 0, 0, 1, 1)]), '6.71')

    def test_a_leading_a_is_a_misread_triangle(self):
        self.assertEqual(st.amount_text([box('A8,517,000', 0, 0, 1, 1)]), '△8,517,000')
        self.assertEqual(number(st.amount_text([box('A8,517,000', 0, 0, 1, 1)])), -8517000)

    def test_ideographic_commas_and_mixed_periods_group_thousands(self):
        self.assertEqual(st.amount_text([box('32、433.989', 0, 0, 1, 1)]), '32,433,989')
        self.assertEqual(st.amount_text([box('899、636,000', 0, 0, 1, 1)]), '899,636,000')

    def test_a_closing_bracket_before_the_digits_is_a_rule_stroke(self):
        self.assertEqual(st.amount_text([box('） 9,875,790', 0, 0, 1, 1)]), '9,875,790')

    def test_pieces_of_one_cell_join_again_when_a_line_crosses_a_column_rule(self):
        parts = (box('0', 50, 0, 55, 8), box('1', 70, 0, 74, 8), box('649', 78, 0, 90, 8), box('402,000', 94, 0, 120, 8))
        found = st.split([box('0 1, 649, 402,000', 50, 0, 120, 8, parts=parts)], [60])
        self.assertEqual([b.text for b in found], ['0', '1,649,402,000'])
        self.assertEqual(st.amount_text([found[1]]), '1,649,402,000')

    def test_digit_like_tells_a_misread_amount_from_a_name_with_a_count(self):
        self.assertTrue(st.digit_like('861,90g)'))
        self.assertFalse(st.digit_like('一般職給11人'))


class HeaderTest(unittest.TestCase):
    def test_spanning_parent_and_leaf_resolve_to_the_form_header(self):
        column = st.classify(0, 10, '当初予算額', ['予算現額'], 1)
        self.assertEqual((column.kind, column.header), ('amount', '予算現額／当初予算額'))
        column = st.classify(0, 10, '金額', ['予算現額', '節'], 1)
        self.assertEqual(column.header, '節／金額')

    def test_unknown_text_stops(self):
        with self.assertRaisesRegex(ValueError, 'Unknown legal-form column'):
            st.classify(0, 10, '摘要', [], 1)

    def test_unread_leaves_take_the_only_columns_the_form_order_leaves(self):
        columns = [st.Column(0, 1, 'amount', '予算現額／予備費支出及び流用増減'),
                   st.Column(1, 2, 'unread', '予算現額'),
                   st.Column(2, 3, 'unread', '予算現額／節'), st.Column(3, 4, 'unread', '予算現額／節')]
        st.resolve_unread(columns, 1)  # exactly 計・区分・金額 follow under 予算現額 and 節
        self.assertEqual([c.header for c in columns[1:]], ['予算現額／計', '節／区分', '節／金額'])
        columns = [st.Column(0, 1, 'amount', '支出済額'),
                   st.Column(1, 2, 'unread', '翌年度繰越額'), st.Column(2, 3, 'amount', '不用額')]
        with self.assertRaisesRegex(ValueError, 'Unknown'):
            st.resolve_unread(columns, 1)  # three carry-over columns are possible for one cell


class RemarkLevelTest(unittest.TestCase):
    def test_hanging_indent_of_a_wrapped_name_is_not_a_level(self):
        column = st.Column(100, 200, 'remarks', '備考')
        rows = [('1 事業', 101, '1,000'), ('2 給料', 120, '600'), ('職員', 130, '600'),
                ('5 長い名前の事', 101, None), ('業', 110, '400'), ('11 役務費', 120, '400'), ('電話料', 130, '400')]
        lines = []
        for y, (text, x, amount) in enumerate(rows):
            boxes = [box(text, x, y * 10, x + 40, y * 10 + 8)]
            if amount:
                boxes.append(box(amount, 180, y * 10, 199, y * 10 + 8))
            lines.append((column, st.Line(boxes)))
        levels, hanging = st.remark_levels(lines)
        self.assertEqual([round(x) for x in levels], [1, 20, 30])
        self.assertEqual([round(x) for x in hanging], [10])


    def test_levels_are_modes_not_chains_of_nearby_offsets(self):
        # Offsets 8 and 16 bridged by a line at 12: chaining within 4.5pt would make one level.
        column = st.Column(100, 200, 'remarks', '備考')
        rows = [(f'{i} 事業', 108, '1') for i in range(1, 11)] + [('1 注', 112, '1')] + [('給料', 116, '1')] * 10
        lines = [(column, st.Line([box(t, x, y * 10, x + 40, y * 10 + 8), box(a, 180, y * 10, 199, y * 10 + 8)]))
                 for y, (t, x, a) in enumerate(rows)]
        levels, _ = st.remark_levels(lines)
        self.assertIn(8, [round(x) for x in levels])
        self.assertIn(16, [round(x) for x in levels])


def remarks(rows, levels, hanging=()):
    """Run 備考 lines (text, x, amount) through one 目; the name area is wide enough for every name."""
    column = st.Column(100, 200, 'remarks', '備考')
    builder = st.Builder('t')
    builder.name_limit = 1000
    target = builder.node(None, '科目', 3, '目', '1', '目', st.Line([box('1 目', 0, 0, 10, 8)]), 1, reuse=True)
    builder.context[2] = target
    for y, (text, x, amount) in enumerate(rows):
        boxes = [box(text, x, y * 10, x + 40, y * 10 + 8)]
        if amount:
            boxes.append(box(amount, 180, y * 10, 199, y * 10 + 8))
        st.remark_line(builder, column, st.Line(boxes), list(levels), list(hanging), 1)
    return builder, target


def tree(builder):
    by = {n.key: n for n in builder.nodes}
    return [(n.axis, n.depth, n.name, by[n.parent].name if n.parent else None, dict((h, t) for h, (t, _) in n.amounts.items()))
            for n in builder.nodes[1:]]


class RemarkTreeTest(unittest.TestCase):
    def test_a_name_with_an_open_bracket_continues_at_the_child_indent(self):
        builder, _ = remarks([('8 地域支援経費（商工', 101, None), ('課）', 110, '1,000'), ('委託料', 110, '1,000')], [1, 10])
        self.assertEqual(tree(builder), [('備考', 1, '地域支援経費(商工課)', '目', {'備考': '1,000'}),
                                         ('備考', 2, '委託料', '地域支援経費(商工課)', {'備考': '1,000'})])

    def test_an_unnumbered_line_completing_an_item_without_amount_is_its_wrap(self):
        builder, _ = remarks([('2 土木一般管理に要する', 101, None), ('経費', 110, '78,615,655')], [1, 10, 25])
        self.assertEqual(tree(builder), [('備考', 1, '土木一般管理に要する経費', '目', {'備考': '78,615,655'})])

    def test_an_amount_read_into_the_name_closes_the_item(self):
        builder, _ = remarks([('3 職員手当等50,917,080）', 110, None), ('議員期末手当', 120, '50,917,080')], [1, 10, 20])
        self.assertEqual([(d, n, p) for _, d, n, p, _ in tree(builder)],
                         [(2, '職員手当等50,917,080)', '目'), (3, '議員期末手当', '職員手当等50,917,080)')])

    def test_a_name_cut_after_a_separator_goes_on_even_from_a_digit(self):
        builder, _ = remarks([('1 都市計画道路3・4・', 101, None), ('8号線整備経費', 110, '55,650,940')], [1, 10])
        self.assertEqual(tree(builder), [('備考', 1, '都市計画道路3・4・8号線整備経費', '目', {'備考': '55,650,940'})])

    def test_a_carry_over_heading_is_a_section_beside_the_items(self):
        builder, _ = remarks([('2 幹線道路改修経費', 101, '100'), ('工事費', 110, '100'),
                              ('（前年度繰越明許費）', 108, '50'), ('委託料', 110, '50')], [1, 10])
        self.assertEqual([(d, n, p) for _, d, n, p, _ in tree(builder)],
                         [(1, '幹線道路改修経費', '目'), (2, '工事費', '幹線道路改修経費'),
                          (1, '(前年度繰越明許費)', '目'), (2, '委託料', '(前年度繰越明許費)')])

    def test_transfer_and_unused_notes_become_annotation_nodes(self):
        builder, _ = remarks([('7.1.3.18へ流用', 101, '△676,000'), ('予備費から充当', 101, '15,948,000'),
                              ('1 事業', 101, '100'), ('○不用額', 101, '3,000')], [1, 10])
        self.assertEqual(tree(builder), [('注記', 1, '7.1.3.18へ流用', '目', {'注記金額': '△676,000'}),
                                         ('注記', 1, '予備費から充当', '目', {'注記金額': '15,948,000'}),
                                         ('備考', 1, '事業', '目', {'備考': '100'}),
                                         ('注記', 1, '○不用額', '目', {'注記金額': '3,000'})])
        self.assertEqual([n.level for n in builder.nodes if n.axis == '注記'], ['流用', '充用', '不用額'])

    def test_a_destination_reference_is_a_transfer_note_not_a_numbered_item(self):
        builder, _ = remarks([('2款1項9目3節へ', 101, '△71,317,130')], [1, 10])
        self.assertEqual([(a, n, am) for a, _, n, _, am in tree(builder)],
                         [('注記', '2款1項9目3節へ', {'注記金額': '△71,317,130'})])

    def test_a_transfer_block_holds_notes_until_the_next_item(self):
        builder, _ = remarks([('1 事業', 101, '100'), ('［流用］', 120, None), ('24 積立金', 101, None),
                              ('1項6目24節から', 110, '22,960')], [1, 10])
        self.assertEqual([(a, n, am) for a, _, n, _, am in tree(builder)],
                         [('備考', '事業', {'備考': '100'}), ('注記', '1項6目24節から', {'注記金額': '22,960'})])


class SubjectTest(unittest.TestCase):
    def test_a_number_spanning_a_step_rule_holds_two_codes(self):
        parts = (box('12', 28, 0, 50, 10), box('運営', 52, 0, 70, 10), box('協議会費', 70, 0, 105, 10))
        line = st.Line([box('12運営協議会費', 28, 0, 105, 10, parts=parts)])
        steps = [st.Rule(28, 0, 100), st.Rule(42, 0, 100)]
        self.assertEqual(st.subject_code(line, steps), ('2', '運営協議会費'))
        self.assertEqual(st.code_start(line, steps), 42)
        self.assertEqual(st.subject_code(line), ('12', '運営協議会費'))

    def test_a_row_rule_stops_a_subject_name_from_wrapping(self):
        lines = [st.Line([box('3国民健康保険事業', 19, 0, 100, 10)]), st.Line([box('費納付金', 27, 14, 66, 24)]),
                 st.Line([box('医療給付費分', 40, 28, 97, 38)])]
        self.assertEqual(len(st.subject_blocks([st.Line(list(l.boxes)) for l in lines])), 1)
        rows = [st.Rule(26, 25, 100)]
        blocks = st.subject_blocks([st.Line(list(l.boxes)) for l in lines], rows)
        self.assertEqual([b.text for b in blocks], ['3国民健康保険事業費納付金', '医療給付費分'])

    def test_a_setsu_number_read_as_a_letter_starts_its_own_setsu(self):
        lines = [st.Line([box('10需用費', 0, 0, 40, 10)]), st.Line([box('I1役務費', 0, 30, 40, 40)])]
        blocks = st.setsu_blocks(lines)
        self.assertEqual(len(blocks), 2)
        self.assertEqual(st.parse_code(st.setsu_text(blocks[1].text)), ('11', '役務費'))


class FrameTest(unittest.TestCase):
    def test_a_first_amount_touching_the_header_rule_still_closes_the_header(self):
        rules = pdf_rules.PageRules(1, 600, 800, (), (st.Rule(100, 0, 500), st.Rule(154, 0, 500), st.Rule(300, 0, 500)))
        frame, = st.frames(rules, [box('46,578,312', 400, 153.9, 450, 166)])
        self.assertEqual(frame.header_bottom, 154)


class SpreadTest(unittest.TestCase):
    def test_a_remark_reaching_over_the_next_row_rule_stays_with_the_row_above(self):
        columns = [st.Column(0, 100, 'subject'), st.Column(100, 200, 'amount', '予算現額／計'),
                   st.Column(200, 400, 'remarks', '備考')]
        subjects = [('1 款', 2, 0), ('1 項', 22, 10), ('1 目A', 42, 20), ('2 目B', 42, 52)]
        data = {0: [box(t, x, y, x + 30, y + 8) for t, x, y in subjects],
                1: [box('100', 150, y, 199, y + 8) for _, _, y in subjects],
                2: [box('1 事業A', 210, 40, 260, 54), box('100', 350, 40, 399, 54)]}
        table = st.Table(1, 0, 0, 100, columns, [st.Rule(20, 0, 100), st.Rule(40, 0, 100)], data, '円',
                         [st.Rule(50, 0, 400)])
        builder = st.Builder('t')
        st.spread(builder, table, table, [10.0], [])
        by = {n.key: n for n in builder.nodes}
        remark, = [n for n in builder.nodes if n.axis == '備考']
        self.assertEqual(by[remark.parent].name, '目A')


class RuleTest(unittest.TestCase):
    def test_long_strokes_become_rules_and_side_by_side_tables_keep_their_own(self):
        dark = np.zeros((100, 200), bool)
        dark[10:90, 20] = dark[10:90, 21] = True  # one vertical stroke two pixels wide
        dark[50, 10:90] = dark[50, 110:190] = True  # two tables on one row
        dark[5:9, 150] = True  # a character stroke is too short
        vertical = pdf_rules._merge(pdf_rules._runs(dark, 20), 1.0)
        horizontal = pdf_rules._merge(pdf_rules._runs(dark.T, 20), 1.0)
        self.assertEqual([(r.position, r.start, r.end, r.thickness) for r in vertical], [(21.0, 10, 90, 2.0)])
        self.assertEqual([(r.start, r.end) for r in horizontal], [(10, 90), (110, 190)])


if __name__ == '__main__':
    unittest.main()


class InputsTest(unittest.TestCase):
    def test_two_ocr_inputs_on_one_page_stop_the_conversion(self):
        import gzip, json, tempfile
        from pathlib import Path
        from ingestion.fiscal.layouts.settlement_statement.convert import convert
        with tempfile.TemporaryDirectory() as tmp:
            paths = []
            for name in ('a', 'b'):
                path = Path(tmp) / f'{name}.json.gz'
                path.write_bytes(gzip.compress(json.dumps(
                    {'origin': {'sha256': 'x'}, 'pages': [{'page_number': 1, 'regions': []}]}).encode()))
                paths.append({'id': name, 'path': str(path)})
            item = {'sha256': 'x', 'pdf_type': 'scan', 'scope': [{'pages': [[1, 1]]}], 'ocr': paths}
            with self.assertRaisesRegex(ValueError, 'more than one OCR input'):
                convert([item], Path(tmp), {'table_id': 't'})

    def test_the_recheck_reads_a_conversion_with_one_ocr_input(self):
        from pathlib import Path
        from ingestion.fiscal.layouts.settlement_statement.recheck import recheck
        with self.assertRaisesRegex(ValueError, 'one OCR input'):
            recheck({}, {'ocr_inputs': [{'id': 'a'}, {'id': 'b'}]}, Path('x.pdf'))
