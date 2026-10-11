"""Printed identity, independent axes, amount headers and pre-save validation."""
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from ingestion.lib.node_tables import migrate_rows, check_tree, write_tables, NodeTables, read_rows, amount_phase


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

    def test_grouped_levels_without_positions_keep_contiguous_runs_and_same_name_siblings(self):
        metadata = {'column_contexts': [
            {'columns':['款_番号','款_名称'], 'header_path':['科目','款'], 'grain_columns':['款_番号']},
            {'columns':['事業_名称','事業_金額','細目_名称','細目_金額'],
             'header_path':['備考','説明'], 'grain_columns':['物理頁','上端']}],
            'units':[{'text':'円','scope':{'kind':'columns','columns':['事業_金額','細目_金額']}}]}
        rows = [{'款_番号':'1','款_名称':'款','事業_名称':name,'事業_金額':total,
                 '細目_名称':'同名','細目_金額':value,'物理頁':1,'上端':i}
                for i,(name,total,value) in enumerate([('同名','10','3'),('同名','10','7'),
                                                       ('別名','2','2'),('同名','10','10')])]
        migrated = migrate_rows(rows,metadata)
        parents = [n for n in migrated.nodes if n['level_header']=='事業']
        self.assertEqual(len(parents),3)
        self.assertEqual(migrated.amounts[0]['header_path'],'備考／説明／事業')
        self.assertNotEqual(parents[0]['node_key'],parents[2]['node_key'])
        children = [n for n in migrated.nodes if n['parent_node_key']==parents[0]['node_key']]
        self.assertEqual(len(children),2)
        self.assertTrue(check_tree(migrated.nodes,migrated.amounts)['passed'])

    def test_successive_explanation_axes_continue_the_branch_after_independent_setsu(self):
        contexts = [context('款',['科目','款']), context('節',['節']),
                    context('事業',['事業','事業']), context('内訳',['内訳','内訳'])]
        metadata = {'column_contexts':contexts, 'units':[]}
        row = {}
        for i,prefix in enumerate(['款','節','事業','内訳']):
            row.update({prefix+'_名称':prefix,prefix+'_物理頁':1,prefix+'_上端':float(i)})
        migrated = migrate_rows([row],metadata)
        root, setsu, project, detail = migrated.nodes
        self.assertEqual(setsu['parent_node_key'],root['node_key'])
        self.assertEqual(project['parent_node_key'],root['node_key'])
        self.assertEqual(detail['parent_node_key'],project['node_key'])

    def test_non_subject_root_and_absent_upper_levels_use_first_populated_axis(self):
        for include_upper in (True,False):
            metadata = {'column_contexts':[context('款',['款項','款']),context('区分',['節'])],
                        'units':[{'text':'円','scope':{'kind':'columns','columns':['款_金額','区分_金額']}}]}
            row = {'款_名称':'親' if include_upper else None,'款_金額':'10' if include_upper else None,
                   '款_物理頁':1 if include_upper else None,'款_上端':1. if include_upper else None,
                   '区分_名称':'子','区分_金額':'10','区分_物理頁':1,'区分_上端':2.}
            migrated = migrate_rows([row],metadata)
            self.assertEqual(migrated.unresolved_parent_count,0)
            self.assertFalse(migrated.issues)
            self.assertIsNone(migrated.nodes[0]['parent_node_key'])
            if include_upper:self.assertEqual(migrated.nodes[1]['parent_node_key'],migrated.nodes[0]['node_key'])

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

    def test_missing_leaf_print_is_zero_and_units_are_not_converted(self):
        nodes=[node('p'),node('a','p'),node('b','p')]
        amounts=[amount('p','15'),amount('a','10')]
        self.assertEqual(check_tree(nodes,amounts)['counts'],{'不一致':1})
        amounts+=[amount('b','5',unit='千円')]
        self.assertEqual(check_tree(nodes,amounts)['counts'],{'不一致':1})
        amounts[0]=amount('p','10')
        amounts[-1]=amount('b','－')
        self.assertEqual(check_tree(nodes,amounts)['counts'],{'一致':1})

    def test_unprinted_heading_uses_child_sum_with_header_reading(self):
        nodes=[node('p'),node('heading','p','備考'),node('a','heading','備考'),node('b','heading','備考')]
        amounts=[amount('p','10'),amount('a','3','備考'),amount('b','7','備考')]
        checked=check_tree(nodes,amounts)
        self.assertTrue(checked['passed'])
        self.assertEqual(checked['counts'],{'一致':1})
        self.assertEqual(checked['results'][0]['child_sum'],10)

    def test_unprinted_intermediate_level_is_checked_by_printed_ancestor(self):
        nodes=[node('p'),node('middle','p'),node('leaf','middle')]
        amounts=[amount('p','10'),amount('leaf','9')]
        checked=check_tree(nodes,amounts)
        self.assertEqual(checked['counts'],{'不一致':1})
        self.assertEqual(checked['results'][0]['difference'],-1)
        amounts[-1]=amount('leaf','10')
        self.assertTrue(check_tree(nodes,amounts)['passed'])

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

    def test_phase_lookup_document_and_path_precedence(self):
        self.assertEqual(amount_phase('節／金額','settlement','節',None),'adjusted')
        self.assertEqual(amount_phase('節／金額','initial','節',None),'approved')
        self.assertEqual(amount_phase('支出済額','initial','科目','目'),'executed')
        self.assertIsNone(amount_phase('前年度予算額','initial','科目','目'))

    def test_independent_breakdown_unit_mismatch_is_not_skipped(self):
        checked=check_tree([node('p'),node('a','p','備考')],
                           [amount('p','10'),amount('a','10','備考',unit='千円')])
        self.assertFalse(checked['passed'])

    def test_same_axis_normalizes_phase_and_keeps_every_printed_phase(self):
        nodes=[node('p'),node('a','p')]
        amounts=[amount('p','10','決算額'), amount('a','10','当年度決算額'),
                 amount('p','20','予算現額'), amount('a','19','予算現額／計')]
        checked=check_tree(nodes,amounts)
        self.assertEqual(checked['counts'], {'不一致':1, '一致':1})
        mismatch=next(r for r in checked['results'] if r['status']=='不一致')
        self.assertEqual(mismatch['header_path'],'adjusted')

    def test_initial_breakdowns_compare_approved_not_previous_year_or_funding(self):
        nodes=[node('p'),node('a','p','説明'),node('s','p','節')]
        amounts=[amount('p','10','本年度予算額'), amount('p','99','前年度予算額'),
                 amount('a','10','説明'), amount('s','10','節／金額')]
        self.assertTrue(check_tree(nodes,amounts,'initial')['passed'])
        amounts[1]=amount('p','99','予算現額')
        self.assertEqual(check_tree(nodes,amounts,'initial')['counts'],{'一致':2})
        amounts[2]=amount('a','9','説明')
        self.assertFalse(check_tree(nodes,amounts,'initial')['passed'])

    def test_independent_breakdown_requires_only_phases_resolved_in_children(self):
        nodes=[node('p'),node('a','p','備考')]
        amounts=[amount('p','10'),amount('p','99','当初予算額'),amount('p','7','不用額'),
                 amount('a','10','備考')]
        self.assertEqual(check_tree(nodes,amounts)['counts'],{'一致':1})
        amounts.append(amount('a','99','備考／予算額'))
        self.assertEqual(check_tree(nodes,amounts)['counts'],{'一致':2})

    def test_exact_financial_paths_compare_only_shared_columns(self):
        nodes=[node('p'),node('a','p','財源内訳'),node('b','p','財源内訳')]
        header='財源内訳／特定財源／国都支出金'
        amounts=[amount('p','100','本年度予算額'),amount('p','10',header),
                 amount('a','3',header),amount('b','7',header)]
        checked=check_tree(nodes,amounts,'initial')
        self.assertEqual(checked['counts'],{'一致':1})
        self.assertEqual(checked['results'][0]['header_path'],header)
        amounts[-1]=amount('b','6',header)
        self.assertFalse(check_tree(nodes,amounts,'initial')['passed'])

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
        contexts[-1]['amount_breakdown'] = {'parent_prefix':'説明3_', 'headers':['本年度支出額']}
        row={}
        for prefix,name,value,y in [('款','親','10',1.),('説明3','細目',None,2.),('説明4','本年度支出額','10',3.)]:
            row.update({prefix+'_番号':None,prefix+'_名称':name,prefix+'_金額':value,prefix+'_物理頁':1,prefix+'_上端':y})
        result=migrate_rows([row],metadata)
        self.assertEqual(len(result.nodes),2)
        self.assertEqual(result.amounts[-1]['header_path'],'備考／事業説明／本年度支出額')
        self.assertEqual(result.amounts[-1]['node_key'],result.nodes[-1]['node_key'])
        self.assertEqual(result.amounts[-1]['y0'],3.)
        # The same printed name is a node unless the converter declares otherwise.
        del contexts[-1]['amount_breakdown']
        self.assertEqual(len(migrate_rows([row],metadata).nodes),3)

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
