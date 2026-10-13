"""Monetary remarks keep print and ownership without becoming expenditures."""
import unittest

from ingestion.lib.annotations import add_annotations, remark_prose_lines
from ingestion.lib.node_tables import NodeTables, amount_phase
from ingestion.lib.tree_checks import check_tree
from ingestion.lib.coverage_checks import check_digit_coverage


def node(key, y=10., name='総務費', code='1'):
    return {'node_key':key, 'parent_node_key':None, 'axis_header':'科目', 'depth':1,
            'level_header':'目', 'code_text':code, 'name_text':name, 'physical_page':1,
            'x0':0., 'y0':y, 'x1':40., 'y1':y+9.}


def amount(key, y=10.):
    return {'node_key':key, 'header_path':'支出済額', 'amount_text':'100,000', 'unit_text':'円',
            'physical_page':1, 'x0':100., 'y0':y, 'x1':140., 'y1':y+9.}


def word(text, x, y, right):
    return {'page':1, 'bbox':[x,y,right,y+9.], 'text':text}


def remark(text):
    return {'目_番号':'1', '目_備考':text, '目_物理頁':1,
            '目_左端':0., '目_上端':10., '目_右端':40., '目_下端':19.}


class AnnotationTests(unittest.TestCase):
    def test_transfer_keeps_section_numbers_and_does_not_add_to_tree(self):
        table = NodeTables([node('p')], [amount('p')])
        label = '第10節へ同項同目第8節から流用'
        scope = {'words':[word(label,50.,30.,99.), word('12,846',105.,30.,140.)]}
        actual = add_annotations(table, scope, raw_rows=[remark(label+' 12,846')])
        self.assertEqual(len(actual.amounts),2)
        self.assertEqual(actual.nodes[-1]['parent_node_key'],'p')
        self.assertIn(label,actual.nodes[-1]['name_text'])
        self.assertEqual(actual.nodes[-1]['level_header'],'流用')
        self.assertIsNone(amount_phase(actual.amounts[-1]['header_path'], 'settlement', '注記', actual.nodes[-1]['level_header']))
        self.assertEqual(check_tree(actual.nodes,actual.amounts),check_tree(table.nodes,table.amounts))
        self.assertTrue(check_digit_coverage(scope['words'],actual)['passed'])

    def test_era_years_and_decision_numbers_never_become_annotation_amounts(self):
        table = NodeTables([node('p')],[amount('p')])
        pieces = [('繰越額',50.,69.),('令和',70.,79.),('7',80.,84.),('年',85.,89.),
                  ('第',90.,94.),('28',95.,103.),('号．第',104.,116.),
                  ('57',117.,125.),('号',126.,130.),('980',150.,170.)]
        words=[word(text,left,30.,right) for text,left,right in pieces]
        words += [word('不用額',50.,50.,95.),word('28',110.,50.,140.),
                  word('繰越額',50.,70.,95.),word('7',110.,70.,140.)]
        actual=add_annotations(table,{'words':words},raw_rows=[remark(
            '繰越額 令和7年第28号．第57号 980\n不用額28\n繰越額7')])
        self.assertEqual([a['amount_text'] for a in actual.amounts[1:]],['980','28','7'])
        self.assertEqual([a['y0'] for a in actual.amounts[1:]],[30.,50.,70.])
        self.assertTrue(check_digit_coverage(words,actual)['passed'])

    def test_equal_value_in_a_later_subject_is_not_an_inherited_remark(self):
        table = NodeTables([node('p'),node('q',50.,code='2')], [amount('p'),amount('q',50.)])
        scope = {'words':[word('500',110.,70.,140.)]}
        actual = add_annotations(table,scope,raw_rows=[remark('流用\n500')])
        self.assertEqual(actual.amounts,table.amounts)
        self.assertFalse(check_digit_coverage(scope['words'],actual)['passed'])

    def test_dotted_subject_code_and_generic_counter_are_not_money(self):
        table = NodeTables([node('p',name='予備費')], [amount('p')])
        scope = {'words':[word('1',110.,30.,115.),word('委員会1回',50.,50.,90.)]}
        actual = add_annotations(table,scope,raw_rows=[remark('01.01.01.01\n委員会1回')])
        self.assertEqual(actual.amounts,table.amounts)

    def test_reserve_subject_alone_does_not_classify_business_spending(self):
        table = NodeTables([node('p', name='予備費')], [amount('p')])
        label = '予備費からの事業費'
        scope = {'words':[word(label,50.,30.,99.),word('500',110.,30.,140.)]}
        actual = add_annotations(table,scope,raw_rows=[remark(label+' 500')])
        self.assertEqual(actual.amounts,table.amounts)
        self.assertFalse(check_digit_coverage(scope['words'],actual)['passed'])
        label = '予備費から充用'
        scope = {'words':[word(label,50.,30.,99.),word('500',110.,30.,140.)]}
        actual = add_annotations(table,scope,raw_rows=[remark(label+' 500')])
        self.assertEqual(actual.nodes[-1]['level_header'],'充用')
        self.assertEqual(actual.amounts[-1]['amount_text'],'500')
        self.assertTrue(check_digit_coverage(scope['words'],actual)['passed'])

    def test_reserve_destination_requires_existing_remark_and_exact_subject(self):
        label = '第2款第1項第1目第5節11の事業へ支出'
        scope = {'words':[word(label,50.,30.,99.),word('500',110.,30.,140.)]}
        for parent_name, rows, expected in [('予備費',[remark(label+' 500')],2),
                                           ('総務費',[remark(label+' 500')],1),
                                           ('予備費',[],1)]:
            table = NodeTables([node('p',name=parent_name)], [amount('p')])
            actual = add_annotations(table,scope,raw_rows=rows)
            self.assertEqual(len(actual.amounts),expected)
        table = NodeTables([node('p',name='予備費')],[amount('p')])
        no_destination = {'words':[word('事業費',50.,30.,99.),word('500',110.,30.,140.)]}
        self.assertEqual(add_annotations(table,no_destination,raw_rows=[remark('事業費 500')]).amounts,table.amounts)

    def test_abbreviated_reserve_destination_needs_explicit_counterpart(self):
        destination = '保険料還付金へ 2,208,000'
        table = NodeTables([node('p',name='保険料還付金'),node('q',50.,name='予備費',code='2')],
                           [amount('p'),amount('q',50.)])
        scope = {'words':[word('保険料還付金へ',50.,70.,99.),word('2,208,000',105.,70.,145.)]}
        reserve = {**remark(destination),'目_番号':'2','目_上端':50.}
        explicit = remark('予備費充用額 2,208,000')
        self.assertEqual(len(add_annotations(table,scope,raw_rows=[reserve,explicit]).amounts),3)
        for wrong in [remark('予備費充用額 2,207,000'),remark('事業費 2,208,000')]:
            self.assertEqual(add_annotations(table,scope,raw_rows=[reserve,wrong]).amounts,table.amounts)
        table.nodes[0]['name_text'] = 'その他の費用'
        self.assertEqual(add_annotations(table,scope,raw_rows=[reserve,explicit]).amounts,table.amounts)

    def test_signed_adopted_cell_with_a_raised_sign_is_not_a_new_remark(self):
        adopted = {**amount('p',20.),'header_path':'予備費支出及び流用増減',
                   'amount_text':'△500','y1':39.}
        table = NodeTables([node('p')],[adopted])
        scope = {'words':[word('500',110.,30.,140.),
                          word('流用',50.,50.,99.),word('500',110.,50.,140.)]}
        actual = add_annotations(table,scope,raw_rows=[remark('流用 500')])
        self.assertEqual(len(actual.amounts),2)
        self.assertEqual(actual.amounts[-1]['y0'],50.)

    def test_rate_requires_explicit_money_and_keeps_only_money_glyphs(self):
        table = NodeTables([node('p')], [amount('p')])
        table.nodes[0].update({'name_text':'見舞金（1回10,000円33人）','x0':50.,'y0':30.,'x1':145.,'y1':39.})
        scope = {'words':[word('（1回',50.,30.,70.),word('10,000',70.,30.,105.),
                          word('円33人）',105.,30.,145.),word('会議1回',50.,50.,90.)]}
        actual = add_annotations(table,scope)
        self.assertEqual(len(actual.amounts),2)
        self.assertEqual(actual.amounts[-1]['amount_text'],'10,000')
        self.assertEqual(actual.amounts[-1]['x0'],70.)
        self.assertEqual(actual.amounts[-1]['x1'],105.)
        self.assertEqual(actual.nodes[-1]['level_header'],'基準額')

    def test_monthly_rate_needs_its_own_measured_cell(self):
        table = NodeTables([node('p')], [amount('p')])
        row = {**remark(''), '内表_月額':'15,000','内表_月額_原典物理頁':1,'内表_月額_原典xMin':50.,
               '内表_月額_原典yMin':30.,'内表_月額_原典xMax':90.,'内表_月額_原典yMax':39.}
        table.nodes.append(node('q',20.,code='2'))
        table.amounts.append(amount('q',20.))
        actual = add_annotations(table,{'words':[word('15,000',50.,30.,90.)]},raw_rows=[row,row])
        self.assertEqual(len(actual.amounts),3)
        self.assertEqual(actual.nodes[-1]['parent_node_key'],'p')
        self.assertEqual(actual.amounts[-1]['unit_text'],'円')
        self.assertIsNone(amount_phase(actual.amounts[-1]['header_path'], 'settlement', '注記', actual.nodes[-1]['level_header']))
        row.pop('内表_月額_原典xMin')
        self.assertEqual(add_annotations(table,{'words':[]},raw_rows=[row]).amounts,table.amounts)



class RemarkAmountPlacementTests(unittest.TestCase):
    """Why an annotation amount printed in a remark was left unadopted."""

    def test_amount_with_a_glued_yen_is_a_cell(self):
        table = NodeTables([node('p')], [amount('p')])
        scope = {'words': [word('予備費充用額', 50., 30., 99.), word('5,073,000円', 105., 30., 150.)]}
        actual = add_annotations(table, scope, raw_rows=[remark('予備費充用額 5,073,000円')])
        self.assertEqual(actual.amounts[-1]['amount_text'], '5,073,000円')
        self.assertEqual(actual.nodes[-1]['level_header'], '充用')
        self.assertTrue(check_digit_coverage(scope['words'], actual)['passed'])
        self.assertEqual(check_tree(actual.nodes, actual.amounts), check_tree(table.nodes, table.amounts))

    def test_glued_yen_without_an_annotation_heading_stays_unadopted(self):
        table = NodeTables([node('p')], [amount('p')])
        scope = {'words': [word('事業費', 50., 30., 99.), word('5,073,000円', 105., 30., 150.)]}
        actual = add_annotations(table, scope, raw_rows=[remark('事業費 5,073,000円')])
        self.assertEqual(actual.amounts, table.amounts)

    def test_remark_in_the_plain_column_belongs_to_the_nearest_subject(self):
        table = NodeTables([node('p')], [amount('p')])
        scope = {'words': [word('予備費充用', 50., 10., 99.), word('△181,846,590円', 105., 10., 160.),
                           word('下記の通り充用した。', 50., 35., 120.),
                           word('第1款', 50., 60., 70.), word('議会費', 72., 60., 99.),
                           word('1,039,928円', 105., 60., 150.)]}
        row = {k: v for k, v in remark('').items() if not k.endswith('備考')}
        row['備考'] = '予備費充用 △181,846,590円\n下記の通り充用した。\n第1款 議会費 1,039,928円'
        actual = add_annotations(table, scope, raw_rows=[row])
        self.assertIn('1,039,928円', [a['amount_text'] for a in actual.amounts[1:]])
        self.assertEqual({n['parent_node_key'] for n in actual.nodes[1:]}, {'p'})
        # No subject on the row: nothing to own it.
        orphan = {k: v for k, v in row.items() if not k.startswith('目_')}
        self.assertNotIn('1,039,928円', [a['amount_text'] for a in add_annotations(table, scope, raw_rows=[orphan]).amounts])

    def test_reserve_remark_listing_charged_sections_is_a_destination(self):
        lines = '第2款 総務費 216,665,000円\n第3款 福祉費 10,839,000円'
        scope = {'words': [word('第2款', 50., 30., 70.), word('総務費', 72., 30., 99.),
                           word('216,665,000円', 105., 30., 150.),
                           word('第3款', 50., 50., 70.), word('福祉費', 72., 50., 99.),
                           word('10,839,000円', 105., 50., 150.)]}
        for name, expected in (('予備費', 3), ('総務費', 1)):
            table = NodeTables([node('p', name=name)], [amount('p')])
            actual = add_annotations(table, scope, raw_rows=[remark(lines)])
            self.assertEqual(len(actual.amounts), expected)
        self.assertEqual(actual.amounts, table.amounts)
        # A bare name and amount without 第N款 is not a destination.
        table = NodeTables([node('p', name='予備費')], [amount('p')])
        scope = {'words': [word('総務費', 72., 30., 99.), word('216,665,000円', 105., 30., 150.)]}
        self.assertEqual(add_annotations(table, scope, raw_rows=[remark('総務費 216,665,000円')]).amounts,
                         table.amounts)

    def test_first_remark_line_printed_above_the_subject_row_still_belongs_to_it(self):
        base = [node('p', 20., code='1'), node('q', 100., code='2', name='予備費')]
        tables = NodeTables(base, [amount('p', 20.), amount('q', 100.)])
        row = {**remark('第2款 総務費 500円'), '目_番号': '2', '目_上端': 100., '目_下端': 109.}

        def at(y):
            return {'words': [word('第2款', 50., y, 70.), word('総務費', 72., y, 99.), word('500円', 110., y, 140.)]}
        # q's remark is vertically centred: its first line sits above q's row.
        actual = add_annotations(tables, at(94.), raw_rows=[row])
        self.assertEqual(actual.nodes[-1]['parent_node_key'], 'q')
        self.assertEqual(actual.amounts[-1]['amount_text'], '500円')
        # Another subject starting in between takes it away.
        between = NodeTables([*base, node('r', 97., code='3')],
                             [amount('p', 20.), amount('q', 100.), amount('r', 97.)])
        self.assertEqual(add_annotations(between, at(94.), raw_rows=[row]).amounts, between.amounts)
        # Too far above the row (beyond two text heights): not q's remark.
        self.assertEqual(add_annotations(tables, at(60.), raw_rows=[row]).amounts, tables.amounts)

    def test_spread_remark_on_the_right_page_follows_its_printed_row(self):
        # Subject labels print on page 1, the row's amounts and remark on page 2.
        def right(key, y):
            return {**amount(key, y), 'physical_page': 2}

        def right_word(text, x, y, edge):
            return {'page': 2, 'bbox': [x, y, edge, y + 9.], 'text': text}
        tables = NodeTables([node('p', 10., code='1'), node('q', 50., code='2')],
                            [right('p', 10.), right('q', 50.)])
        scope = {'words': [right_word('流用', 150., 10., 199.), right_word('500', 210., 10., 240.)]}
        actual = add_annotations(tables, scope, raw_rows=[remark('流用 500')])
        self.assertEqual(len(actual.amounts), 3)
        self.assertEqual(actual.nodes[-1]['parent_node_key'], 'p')
        self.assertEqual(actual.amounts[-1]['physical_page'], 2)

    def test_label_line_above_a_bare_amount_owns_a_wrapped_amount(self):
        # The amount wraps onto the next line, which is already the next row.
        tables = NodeTables([node('p', 10.), node('q', 20., code='2')], [amount('p', 10.), amount('q', 20.)])
        scope = {'words': [word('保険医療費へ流用', 150., 10., 199.), word('△1,313,000', 210., 21., 260.)]}
        actual = add_annotations(tables, scope, raw_rows=[remark('保険医療費へ流用\n△1,313,000')])
        self.assertEqual(actual.amounts[-1]['amount_text'], '△1,313,000')
        self.assertEqual(actual.nodes[-1]['parent_node_key'], 'p')


class RemarkProseTests(unittest.TestCase):
    def lines(self, *texts):
        return [[(1, (0., 10. + 10 * i, 5., 19. + 10 * i), t)] for i, t in enumerate(texts)]

    def test_leading_lines_without_a_keyword_are_prose(self):
        lines = self.lines('□事業に要した経費', '○一般管理経費 11,715,154', '予備費充用 100,000', '人件費 5')
        self.assertEqual(len(remark_prose_lines(lines)), 2)

    def test_keyword_wrapped_over_two_lines_ends_the_prose(self):
        lines = self.lines('○人件費 3,000', '会計年度任用職員（一般）費・報酬へ流', '用50,000,000')
        self.assertEqual(len(remark_prose_lines(lines)), 1)

    def test_remark_with_a_keyword_first_has_no_prose(self):
        self.assertEqual(remark_prose_lines(self.lines('流用 500', '人件費 3,000')), [])


if __name__ == '__main__':
    unittest.main()
