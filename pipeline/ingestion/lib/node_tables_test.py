"""Printed identity, independent axes, amount headers and pre-save validation."""
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from ingestion.lib.node_tables import migrate_rows, check_tree, write_tables, NodeTables, read_rows


def context(prefix, header, grain=None):
    return {'columns': [prefix+'_番号', prefix+'_名称', prefix+'_金額', prefix+'_物理頁', prefix+'_上端'],
            'header_path': header, 'grain_columns': grain or [prefix+'_物理頁', prefix+'_上端']}


def node(key, parent=None, axis='科目'):
    return {'node_key': key, 'parent_node_key': parent, 'axis_header': axis, 'depth': 1,
            'level_header': None, 'code_text': None, 'name_text': key,
            'physical_page': 1, 'x0': None, 'y0': 1., 'x1': None, 'y1': None}


def amount(key, text, header='支出済額', unit='円'):
    return {'node_key': key, 'header_path': header, 'amount_text': text, 'unit_text': unit,
            'physical_page': 1, 'x0': None, 'y0': 1., 'x1': None, 'y1': None}


class NodeTablesTests(unittest.TestCase):
    def test_repeated_ancestor_and_same_name_siblings_use_printed_grain(self):
        contexts=[context('款',['科目','款']),context('事業',['備考'])]
        metadata={'column_contexts':contexts,'units':[{'text':'円','scope':{'kind':'columns','columns':['款_金額','事業_金額']}}]}
        rows=[{'款_番号':'1','款_名称':'親','款_金額':'10','款_物理頁':1,'款_上端':1.,
               '事業_番号':None,'事業_名称':'同名','事業_金額':v,'事業_物理頁':1,'事業_上端':y}
              for v,y in [('3',2.),('7',3.)]]
        result=migrate_rows(rows,metadata)
        self.assertEqual(len(result.nodes),3)
        self.assertEqual(len(result.amounts),3)
        self.assertNotEqual(result.nodes[1]['node_key'],result.nodes[2]['node_key'])
        self.assertEqual(result.nodes[1]['parent_node_key'],result.nodes[0]['node_key'])
        self.assertIsNone(result.nodes[1]['x0'])
        self.assertEqual(result.nodes[1]['depth'],1)

    def test_axes_are_checked_independently_and_all_depths_are_checked(self):
        nodes=[node('p'),node('a','p','備考'),node('b','p','備考'),node('s','p','節'),node('aa','a','備考')]
        amounts=[amount('p','10'),amount('a','3','備考'),amount('b','7','備考'),
                 amount('s','10'),amount('aa','2','備考')]
        result=check_tree(nodes,amounts)
        self.assertFalse(result['passed'])
        self.assertEqual(result['counts'],{'一致':2,'不一致':1})
        mismatch=next(r for r in result['results'] if r['status']=='不一致')
        self.assertEqual(mismatch['parent_node_key'],'a')
        self.assertEqual(mismatch['difference'],-1)

    def test_missing_print_is_not_zero_and_units_are_not_converted(self):
        nodes=[node('p'),node('a','p'),node('b','p')]
        amounts=[amount('p','10'),amount('a','10')]
        self.assertEqual(check_tree(nodes,amounts)['counts'],{})
        amounts+=[amount('b','0',unit='千円')]
        self.assertEqual(check_tree(nodes,amounts)['counts'],{})
        amounts[-1]=amount('b','－')
        self.assertEqual(check_tree(nodes,amounts)['counts'],{'一致':1})

    def test_blank_annotations_need_no_header_and_printed_annotations_are_not_execution(self):
        metadata={'column_contexts':[
            {'columns':['款_番号','款_名称','款_支出済額','款_備考_注記金額','款_物理頁','款_上端'],
             'header_path':['科目','款'],'grain_columns':['款_番号']},
            context('事業',['備考'])],
            'units':[{'text':'円','scope':{'kind':'columns',
                       'columns':['款_支出済額','款_備考_注記金額','事業_金額']}}]}
        base={'款_番号':'1','款_名称':'款','款_支出済額':'10','款_備考_注記金額':None,
              '款_物理頁':1,'款_上端':1.,'事業_番号':None,'事業_名称':'事業',
              '事業_金額':'10','事業_物理頁':1,'事業_上端':2.}
        for value in (None,'999'):
            migrated=migrate_rows([{**base,'款_備考_注記金額':value}],metadata)
            self.assertFalse(migrated.issues)
            check=check_tree(migrated.nodes,migrated.amounts)
            self.assertTrue(check['passed'])
            self.assertEqual(check['results'][0]['parent_amount'],10)
            if value is not None:
                annotation=next(a for a in migrated.amounts if a['amount_text']=='999')
                self.assertEqual(annotation['header_path'],'科目／款／備考／注記金額')

    def test_cycles_orphans_duplicate_keys_and_invalid_amount_links_fail(self):
        for nodes, amounts in [([node('a','missing')],[]),([node('a','b'),node('b','a')],[]),
                               ([node('a'),node('a')],[]),([node('a')],[amount('missing','1')])]:
            with self.subTest(nodes=nodes):
                self.assertFalse(check_tree(nodes,amounts)['passed'])

    def test_unread_amounts_do_not_create_amount_rows_and_cannot_be_written(self):
        metadata={'column_contexts':[context('款',['科目','款'])],
                  'units':[{'text':'円','scope':{'kind':'columns','columns':['款_金額']}}]}
        rows=[{'款_番号':'1','款_名称':'款','款_金額':'??','款_物理頁':1,'款_上端':1.}]
        result=migrate_rows(rows,metadata)
        self.assertEqual(result.unread_amount_count,1)
        self.assertFalse(result.amounts)
        with TemporaryDirectory() as tmp:
            with self.assertRaises(ValueError):write_tables(Path(tmp),'bad',result)
            self.assertFalse(list(Path(tmp).iterdir()))

    def test_amount_breakdown_headers_attach_to_the_finer_item_and_keep_text(self):
        contexts=[context('款',['科目','款']),context('説明3',['備考','事業説明','3']),
                  context('説明4',['備考','事業説明','4'])]
        metadata={'column_contexts':contexts,'units':[{'text':'円','scope':{'kind':'columns','columns':['款_金額','説明3_金額','説明4_金額']}}]}
        row={}
        for prefix,name,value,y in [('款','親','10',1.),('説明3','細目',None,2.),('説明4','本年度支出額','10',3.)]:
            row.update({prefix+'_番号':None,prefix+'_名称':name,prefix+'_金額':value,prefix+'_物理頁':1,prefix+'_上端':y})
        result=migrate_rows([row],metadata)
        self.assertEqual(len(result.nodes),2)
        self.assertEqual(result.amounts[-1]['header_path'],'備考／事業説明／本年度支出額')
        self.assertEqual(result.amounts[-1]['node_key'],result.nodes[-1]['node_key'])
        self.assertEqual(result.amounts[-1]['y0'],3.)

    def test_current_year_and_carryover_execution_add_without_overwriting_raw_headers(self):
        nodes=[node('p'),node('a','p','備考')]
        amounts=[amount('p','10'),amount('a','3','備考／支出済額'),
                 amount('a','7','備考／本年度支出額'),amount('a','99','備考／繰越明許費')]
        result=check_tree(nodes,amounts)
        self.assertTrue(result['passed'])
        self.assertEqual(result['counts'],{'一致':1})
        self.assertEqual(amounts[1]['amount_text'],'3')

    def test_failing_tree_never_creates_candidate_and_verified_pair_has_exact_columns(self):
        nodes=[node('p'),node('a','p')]
        with TemporaryDirectory() as tmp:
            path=Path(tmp)
            with self.assertRaises(ValueError):write_tables(path,'bad',NodeTables(nodes,[amount('p','2'),amount('a','1')]))
            self.assertFalse(list(path.iterdir()))
            pair=write_tables(path,'ok',NodeTables(nodes,[amount('p','1'),amount('a','1')]))
            self.assertEqual(len(read_rows(pair['nodes'])),2)
            self.assertEqual(set(read_rows(pair['amounts'])[0]),set(amount('a','1')))


if __name__=='__main__':unittest.main()
