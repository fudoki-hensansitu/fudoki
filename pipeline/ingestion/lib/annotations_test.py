"""Monetary remarks keep print and ownership without becoming expenditures."""
import unittest

from ingestion.lib.annotations import add_annotations
from ingestion.lib.node_tables import NodeTables, amount_phase, check_tree, check_digit_coverage


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


if __name__ == '__main__':
    unittest.main()
