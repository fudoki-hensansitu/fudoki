"""Printed identity, independent axes, amount headers and pre-save validation."""
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from ingestion.lib.node_tables import migrate_rows, check_tree, write_tables, NodeTables, read_rows, amount_phase, amount_position_fields, null_position_fields, check_digit_coverage, write_coverage_words, check_table_coverage, combine_coverage_tables
from shared.amount import parse_amount


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
        self.assertIsNone(result.amounts[-1]['physical_page'])
        self.assertIsNone(result.amounts[-1]['y0'])
        # The same printed name is a node unless the converter declares otherwise.
        del contexts[-1]['amount_breakdown']
        self.assertEqual(len(migrate_rows([row],metadata).nodes),3)

    def test_amount_owns_its_page_and_position_without_using_label_coordinates(self):
        metadata = {'column_contexts':[context('款',['科目','款'])],
                    'units':[{'text':'円','scope':{'kind':'columns','columns':['款_金額']}}]}
        row = {'款_番号':'1','款_名称':'款','款_金額':'10','款_物理頁':1,'款_上端':1.,
               '款_金額_物理頁':2,'款_金額_上端':3.}
        result = migrate_rows([row],metadata)
        self.assertEqual(result.nodes[0]['physical_page'],1)
        self.assertEqual(result.amounts[0]['physical_page'],2)
        self.assertEqual(result.amounts[0]['y0'],3.)
        del row['款_金額_物理頁']
        result = migrate_rows([row],metadata)
        for field in ('physical_page','x0','y0','x1','y1'):
            self.assertIsNone(result.amounts[0][field])

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

    def test_amount_position_fields_keep_the_printed_page_and_word_union(self):
        fields = amount_position_fields('款_金額', 3, [(10., 20., 30., 25.), (32., 21., 50., 26.)])
        self.assertEqual(fields, {'款_金額_物理頁': 3, '款_金額_左端': 10., '款_金額_上端': 20.,
                                  '款_金額_右端': 50., '款_金額_下端': 26.})
        for page, boxes in [(0, [(1., 1., 2., 2.)]), (1, []), (1, [(2., 2., 1., 1.)])]:
            with self.subTest(page=page):
                with self.assertRaises(ValueError):
                    amount_position_fields('款_金額', page, boxes)
        self.assertEqual(null_position_fields('款_金額'),
                         {'款_金額_物理頁': None, '款_金額_左端': None, '款_金額_上端': None,
                          '款_金額_右端': None, '款_金額_下端': None})

    def test_digit_coverage_covers_box_contents_and_blocks_band_misses(self):
        nodes=[{**node('p'), 'x0': 1., 'y0': 1., 'x1': 40., 'y1': 9.},
               {**node('a','p'), 'code_text': '12', 'name_text': '事業',
                'x0': 1., 'y0': 10., 'x1': 40., 'y1': 18.}]
        amounts=[{**amount('a','1,959,393, 091'), 'x0': 60., 'y0': 10., 'x1': 120., 'y1': 18.}]
        words=[{'page': 1, 'bbox': [60., 10., 100., 18.], 'text': '1,959,393,'},
               {'page': 1, 'bbox': [100., 10., 120., 18.], 'text': '091'},
               {'page': 1, 'bbox': [1., 10., 8., 18.], 'text': '12'},
               {'page': 1, 'bbox': [0., 0., 50., 5.], 'text': '－12－'},
               {'page': 1, 'bbox': [0., 90., 50., 95.], 'text': '令和7年度'},
               # In-band miss (amount territory, no amount row) blocks;
               # out-of-band prose only reports.
               {'page': 1, 'bbox': [70., 30., 110., 38.], 'text': '267,141,613'},
               {'page': 1, 'bbox': [200., 30., 230., 38.], 'text': '99'}]
        result = check_digit_coverage(words, NodeTables(nodes, amounts))
        self.assertFalse(result['passed'])
        self.assertEqual(result['counts'],
                         {'amount': 2, 'label': 1, 'non_amount': 2,
                          'blocked': 1, 'reported': 1})
        self.assertEqual(result['uncovered'],
                         [{'page': 1, 'bbox': [70., 30., 110., 38.], 'text': '267,141,613'}])
        self.assertEqual(result['reported'],
                         [{'page': 1, 'bbox': [200., 30., 230., 38.], 'text': '99'}])

    def test_digit_coverage_covers_poppler_style_words_without_joining(self):
        nodes=[{**node('p'), 'x0': 1., 'y0': 1., 'x1': 40., 'y1': 9.}]
        amounts=[{**amount('p','10'), 'x0': 60., 'y0': 1., 'x1': 90., 'y1': 9.}]
        words=[{'page': 1, 'xMin': 60., 'yMin': 1., 'xMax': 75., 'yMax': 9., 'text': '1'},
               {'page': 1, 'xMin': 76., 'yMin': 1., 'xMax': 90., 'yMax': 9., 'text': '2'}]
        result = check_digit_coverage(words, NodeTables(nodes, amounts))
        self.assertTrue(result['passed'])
        self.assertEqual(result['counts'], {'amount': 2})

    def test_digit_coverage_covers_a_word_split_across_two_adopted_amounts(self):
        nodes=[{**node('p'), 'x0': 1., 'y0': 1., 'x1': 40., 'y1': 9.}]
        amounts=[{**amount('p','0', header='計'), 'x0': 60., 'y0': 1., 'x1': 80., 'y1': 9.},
                 {**amount('p','△181', header='予備費支出'), 'x0': 80., 'y0': 1., 'x1': 110., 'y1': 9.}]
        words=[{'page': 1, 'bbox': [60., 1., 110., 9.], 'text': '0△181'}]
        result = check_digit_coverage(words, NodeTables(nodes, amounts))
        self.assertTrue(result['passed'])
        self.assertEqual(result['counts'], {'split_amount': 1})

    def test_digit_coverage_covers_common_non_amount_prints(self):
        tables = NodeTables([], [])
        words=[{'page': 1, 'bbox': [10., 1., 60., 9.], 'text': '98.4％'},
               {'page': 1, 'bbox': [70., 1., 90., 9.], 'text': '94.0'},
               {'page': 1, 'bbox': [95., 1., 99., 9.], 'text': '％'},
               {'page': 1, 'bbox': [110., 1., 140., 9.], 'text': '１０款'},
               {'page': 1, 'bbox': [150., 1., 160., 9.], 'text': '104'},
               {'page': 1, 'bbox': [150., 810., 160., 819.], 'text': '105'},
               {'page': 1, 'bbox': [170., 1., 200., 9.], 'text': '1,000'}]
        result = check_digit_coverage(words, tables)
        self.assertTrue(result['passed'])
        self.assertEqual(result['counts'], {'non_amount': 4, 'reported': 2})
        self.assertEqual(result['reported'][0]['text'], '104')

    def test_digit_coverage_covers_control_total_baselines(self):
        tables = NodeTables([], [])
        words=[{'page': 2, 'bbox': [10., 5., 60., 9.], 'text': '歳出合計'},
               {'page': 2, 'bbox': [100., 5., 150., 9.], 'text': '1,000'},
               {'page': 2, 'bbox': [300., 50., 350., 54.], 'text': '2,000'}]
        result = check_digit_coverage(words, tables)
        self.assertTrue(result['passed'])
        # The digitless label only marks the baseline; only digits are counted.
        self.assertEqual(result['counts'], {'total': 1, 'reported': 1})

    def test_exclusions_need_known_kind_and_reason_and_report_counts(self):
        nodes = []
        tables = NodeTables(nodes, [])
        words = [{'page': 5, 'bbox': [500., 10., 550., 18.], 'text': '1,000'},
                 {'page': 5, 'bbox': [100., 10., 150., 18.], 'text': '2,000'}]
        exclusions = [{'kind': '節の一覧', 'reason': 'setsu grid is auxiliary',
                       'pages': [[5, 5]], 'x_range': [490., 580.]}]
        result = check_digit_coverage(words, tables, exclusions=exclusions)
        self.assertTrue(result['passed'])
        self.assertEqual(result['counts'], {'excluded': 1, 'reported': 1})
        self.assertEqual(result['exclusions'],
                         [{'kind': '節の一覧', 'reason': 'setsu grid is auxiliary', 'words': 1}])
        for bad in ([{'kind': '未知の表', 'reason': 'x', 'pages': [[1, 1]]}],
                    [{'kind': '節の一覧', 'reason': '  ', 'pages': [[1, 1]]}],
                    [{'kind': '節の一覧', 'pages': [[1, 1]]}]):
            with self.subTest(bad=bad):
                with self.assertRaises(ValueError):
                    check_digit_coverage(words, tables, exclusions=bad)

    def test_header_bands_cover_declared_empty_columns(self):
        tables = NodeTables([], [])
        words = [{'page': 1, 'bbox': [300., 10., 340., 18.], 'text': '5,000'}]
        columns = [{'header': '支出済額', 'x_range': [290., 350.]}]
        result = check_digit_coverage(words, tables, amount_columns=columns)
        self.assertFalse(result['passed'])
        self.assertEqual(result['bands_from'], 'columns')
        self.assertEqual(result['counts'], {'blocked': 1})
        fallback = check_digit_coverage(words, tables)
        self.assertTrue(fallback['passed'])
        self.assertEqual(fallback['bands_from'], 'rows')
        self.assertEqual(fallback['counts'], {'reported': 1})

    def test_adjacent_digit_is_not_hidden_by_an_amount_box(self):
        nodes = []
        amounts = [{**amount('p', '147,680,774'), 'x0': 484., 'y0': 310., 'x1': 534., 'y1': 319.}]
        words = [{'page': 1, 'bbox': [484., 310., 507., 319.], 'text': '147,6'},
                 {'page': 1, 'bbox': [508., 310., 534., 319.], 'text': '80,774'},
                 {'page': 1, 'bbox': [535., 310., 545., 319.], 'text': '7'}]
        result = check_digit_coverage(words, NodeTables(nodes, amounts))
        self.assertTrue(result['passed'])
        self.assertEqual(result['counts'], {'amount': 2, 'reported': 1})
        gated = check_digit_coverage(words, NodeTables(nodes, amounts),
                                    amount_columns=[{'header': '支出済額', 'x_range': [484, 550]}])
        self.assertFalse(gated['passed'])
        self.assertEqual(gated['uncovered'][0]['text'], '7')

    def test_amount_shaped_words_are_never_labels(self):
        nodes = [{**node('p'), 'name_text': '工事1,636', 'x0': 1., 'y0': 1., 'x1': 200., 'y1': 9.}]
        amounts = [{**amount('p', '9,999'), 'x0': 100., 'y0': 50., 'x1': 200., 'y1': 58.}]
        words = [{'page': 1, 'bbox': [150., 1., 190., 9.], 'text': '1,636'},
                 {'page': 1, 'bbox': [10., 1., 20., 9.], 'text': '12'}]
        nodes[0]['code_text'] = '12'
        result = check_digit_coverage(words, NodeTables(nodes, amounts))
        self.assertFalse(result['passed'])
        self.assertEqual(result['counts'], {'label': 1, 'blocked': 1})
        self.assertEqual(result['uncovered'][0]['text'], '1,636')

    def test_coverage_collects_independent_tables_and_deduplicates_prints(self):
        left = NodeTables([], [{**amount('a', '10'), 'x0': 10., 'y0': 10., 'x1': 20., 'y1': 19.}])
        right = NodeTables([], [{**amount('b', '20'), 'x0': 20., 'y0': 10., 'x1': 30., 'y1': 19.}])
        words = [(1, (10., 10., 30., 19.), '1020')]
        self.assertFalse(check_digit_coverage(words, left)['passed'])
        pooled = combine_coverage_tables([left, left, right])
        self.assertEqual(len(pooled.amounts), 2)
        result = check_digit_coverage(words, pooled)
        self.assertTrue(result['passed'])
        self.assertEqual(result['counts'], {'split_amount': 1})

    def test_adopted_prints_precede_observation_only_regions(self):
        tables = NodeTables([], [{**amount('a', '10'), 'x0': 10., 'y0': 10., 'x1': 20., 'y1': 19.}])
        result = check_digit_coverage([(1, (10., 10., 20., 19.), '10')], tables,
                                     exclusions=[{'kind': '本文', 'reason': 'observation',
                                                  'page': 1, 'bbox': [1., 1., 50., 50.]}])
        self.assertEqual(result['counts'], {'amount': 1})
        self.assertEqual(result['exclusions'][0]['words'], 0)

    def test_amount_format_inside_a_name_is_not_a_covered_label(self):
        tables = NodeTables([{**node('a'), 'name_text': '負担金1,000円',
                              'x0': 10., 'y0': 10., 'x1': 80., 'y1': 19.}], [])
        result = check_digit_coverage([(1, (10., 10., 80., 19.), '負担金1,000円')], tables,
                                     amount_columns=[{'header': '金額', 'x_range': [10, 80]}])
        self.assertFalse(result['passed'])
        self.assertEqual(result['counts'], {'blocked': 1})

    def test_split_document_number_and_percent_unit_leave_nearby_money_blocked(self):
        words = [(1, (10., 10., 20., 19.), '令和'), (1, (21., 10., 25., 19.), '7'),
                 (1, (26., 10., 36., 19.), '年第'), (1, (37., 10., 45., 19.), '22'),
                 (1, (46., 10., 50., 19.), '号'), (1, (70., 10., 90., 19.), '令和７年第７号・第７７号'),
                 (1, (115., 20., 120., 29.), '％'), (1, (100., 28., 120., 37.), '94.0'),
                 (1, (80., 28., 90., 37.), '1,234'), (1, (10., 50., 30., 59.), '22'),
                 (1, (10., 80., 60., 89.), '第142号、令和8年第5号'),
                 (1, (10., 100., 80., 109.), '7新総総総第4262号区長決定')]
        result = check_digit_coverage(words, NodeTables([], []),
                                     amount_columns=[{'header': '金額', 'x_range': [10, 120]}])
        self.assertEqual(result['counts'], {'non_amount': 6, 'blocked': 2})
        self.assertEqual([w['text'] for w in result['uncovered']], ['1,234', '22'])

    def test_overhanging_glyph_requires_exact_reconstruction_of_its_amount(self):
        tables = NodeTables([], [{**amount('a', '20'), 'x0': 10., 'y0': 10., 'x1': 20., 'y1': 19.}])
        words = [(1, (10., 10., 19., 19.), '2'), (1, (15., 10., 24., 19.), '0')]
        result = check_digit_coverage(words, tables,
                                     amount_columns=[{'header': '金額', 'x_range': [10, 30]}])
        self.assertTrue(result['passed'])
        self.assertEqual(result['counts'], {'amount': 1, 'amount_fragments': 1})
        mismatched = check_digit_coverage([*words, (1, (19., 10., 28., 19.), '7')], tables,
                                         amount_columns=[{'header': '金額', 'x_range': [10, 30]}])
        self.assertFalse(mismatched['passed'])
        self.assertEqual(mismatched['counts'], {'amount': 1, 'blocked': 2})

    def test_unlabeled_total_requires_two_exact_columns_from_direct_siblings(self):
        tables = NodeTables([node('a'), node('b')], [
            {**amount(key, value, header), 'x0': x, 'y0': y, 'x1': x + 20., 'y1': y + 9.}
            for key, y, actual, budget in [('a', 10., '3', '4'), ('b', 30., '7', '8')]
            for value, header, x in [(actual, '支出済額', 10.), (budget, '当初予算額', 50.)]])
        columns = [{'header': '支出済額', 'x_range': [10, 30]},
                   {'header': '当初予算額', 'x_range': [50, 70]}]
        words = [(1, (10., 60., 30., 69.), '10'), (1, (50., 60., 70., 69.), '12')]
        result = check_digit_coverage(words, tables, amount_columns=columns)
        self.assertTrue(result['passed'])
        self.assertEqual(result['counts'], {'verified_total': 2})
        for invalid in [words[:1], [words[0], (1, words[1][1], '13')],
                        [(1, (10., 20., 30., 29.), '10'), (1, (50., 20., 70., 29.), '12')]]:
            with self.subTest(words=invalid):
                self.assertFalse(check_digit_coverage(invalid, tables, amount_columns=columns)['passed'])

    def test_adjacent_total_words_stay_separate_when_column_spans_overlap(self):
        tables = NodeTables([node('a'),node('b')],[
            {**amount(k,v,h),'x0':x,'y0':y,'x1':x+25.,'y1':y+9.}
            for k,y,a,b in [('a',10.,'3','4'),('b',30.,'7','8')]
            for v,h,x in [(a,'支出済額',10.),(b,'当初予算額',30.)]])
        words=[(1,(10.,60.,29.,69.),'10'),(1,(31.,60.,50.,69.),'12')]
        self.assertTrue(check_digit_coverage(words,tables)['passed'])
        self.assertFalse(check_digit_coverage([words[0],(1,words[1][1],'13')],tables)['passed'])

    def test_parent_total_in_a_different_column_does_not_expand_zero_band(self):
        tables = NodeTables([node('p'),node('a','p')],[
            {**amount('p','0','比較'),'x0':110.,'y0':1.,'x1':119.,'y1':10.},
            {**amount('a','0','比較'),'x0':50.,'y0':30.,'x1':59.,'y1':39.}])
        words=[(1,(10.,60.,20.,69.),'計'),(1,(50.,60.,59.,69.),'0'),
               (1,(80.,60.,89.,69.),'0'),(1,(110.,60.,119.,69.),'0')]
        actual=check_digit_coverage(words,tables,amount_columns=[{'header':'比較','x_range':[40.,70.]}])
        self.assertEqual(actual['counts'].get('verified_total'),2)
        self.assertEqual(actual['reported'][0]['bbox'],[80.,60.,89.,69.])

    def test_one_print_under_two_headers_is_not_an_independent_total(self):
        tables = NodeTables([node('a'), node('b')], [
            {**amount(key, value, header), 'x0': 10., 'y0': y, 'x1': 30., 'y1': y + 9.}
            for key, y, value in [('a', 10., '3'), ('b', 30., '7')]
            for header in ('支出済額', '当初予算額')])
        self.assertFalse(check_digit_coverage([(1, (10., 60., 30., 69.), '10')], tables)['passed'])

    def test_wrapped_nonzero_total_needs_a_nearby_established_total_row(self):
        tables = NodeTables([node('a'), node('b')], [
            {**amount(key, value, header), 'x0': x, 'y0': y, 'x1': x + 20., 'y1': y + 9.}
            for key, y, actual, budget, carry in [('a', 10., '3', '4', '2'), ('b', 30., '7', '8', '3')]
            for value, header, x in [(actual, '支出済額', 10.), (budget, '当初予算額', 50.),
                                      (carry, '翌年度繰越額', 90.)]])
        columns = [{'header': h, 'x_range': [x, x + 20]} for h, x in
                   [('支出済額', 10), ('当初予算額', 50), ('翌年度繰越額', 90)]]
        first = [(1, (10., 60., 30., 69.), '10'), (1, (50., 60., 70., 69.), '12')]
        continuation = (1, (90., 72., 110., 81.), '5')
        self.assertTrue(check_digit_coverage([*first, continuation], tables, amount_columns=columns)['passed'])
        for tail in [continuation, (1, continuation[1], '6'), (1, (90., 100., 110., 109.), '5')]:
            words = [tail] if tail == continuation else [*first, tail]
            self.assertFalse(check_digit_coverage(words, tables, amount_columns=columns)['passed'])

    def test_page_total_uses_only_same_parent_and_same_page_siblings(self):
        tables = NodeTables([node(key) for key in ('a', 'b', 'c', 'd')], [
            {**amount(key, value, header), 'physical_page': page,
             'x0': x, 'y0': y, 'x1': x + 20., 'y1': y + 9.}
            for key, page, y, actual, budget in [('a', 1, 10., '3', '4'), ('b', 1, 30., '7', '8'),
                                                ('c', 2, 10., '1', '5'), ('d', 2, 30., '9', '7')]
            for value, header, x in [(actual, '支出済額', 10.), (budget, '当初予算額', 50.)]])
        columns = [{'header': h, 'x_range': [x, x + 20]} for h, x in
                   [('支出済額', 10), ('当初予算額', 50)]]
        words = [(1, (10., 60., 30., 69.), '10'), (1, (50., 60., 70., 69.), '12')]
        self.assertTrue(check_digit_coverage(words, tables, amount_columns=columns)['passed'])
        tables.nodes[1]['parent_node_key'] = 'different-parent'
        self.assertFalse(check_digit_coverage(words, tables, amount_columns=columns)['passed'])

    def test_printed_total_label_requires_exact_sibling_sum_including_zero(self):
        tables = NodeTables([node('a'), node('b')], [
            {**amount(key, value), 'x0': 50., 'y0': y, 'x1': 80., 'y1': y + 9.}
            for key, value, y in [('a', '3', 10.), ('b', '7', 30.)]])
        words = [(1, (10., 60., 20., 69.), '計'), (1, (50., 60., 80., 69.), '10')]
        self.assertTrue(check_digit_coverage(words, tables)['passed'])
        self.assertFalse(check_digit_coverage([words[0], (1, words[1][1], '11')], tables)['passed'])
        only_zero = NodeTables([node('a')], [{**amount('a', '0'), 'x0': 50., 'y0': 10., 'x1': 80., 'y1': 19.}])
        self.assertTrue(check_digit_coverage([words[0], (1, words[1][1], '0')], only_zero)['passed'])
        self.assertFalse(check_digit_coverage([(1, words[1][1], '0')], only_zero)['passed'])

    def test_numeric_quantity_can_precede_a_unit_glued_to_an_amount_word(self):
        tables = NodeTables([node('p')], [{**amount('p','53,236,000'),
                            'x0':197., 'y0':30., 'x1':260., 'y1':39.}])
        words = [(1,(170.,30.,196.,39.),'15,810'), (1,(197.,30.,260.,39.),'人）53,236,000')]
        self.assertTrue(check_digit_coverage(words,tables,amount_columns=[{'header':'支出済額','x_range':[150.,270.]}])['passed'])
        words[1] = (1,words[1][1],'円53,236,000')
        self.assertFalse(check_digit_coverage(words,tables,amount_columns=[{'header':'支出済額','x_range':[150.,270.]}])['passed'])

    def test_continued_ancestor_codes_join_overlapping_glyphs_exactly(self):
        nodes = [{**node('k'), 'level_header':'款','code_text':'10','name_text':'教育費',
                  'x0':20.,'y0':20.,'x1':29.,'y1':29.},
                 {**node('h','k'), 'level_header':'項','code_text':'1','name_text':'体育費',
                  'x0':31.,'y0':30.,'x1':35.5,'y1':39.},
                 {**node('m','h'), 'level_header':'目','code_text':'3','name_text':'施設費',
                  'x0':40.,'y0':40.,'x1':44.5,'y1':49.}]
        tables = NodeTables(nodes,[{**amount('m','100'),'x0':100.,'y0':40.,'x1':120.,'y1':49.}])
        words = [(1,(20.,20.,29.,29.),'10'),(1,(31.,30.,35.5,39.),'1'),(1,(40.,40.,44.5,49.),'3'),
                 (2,(20.,10.,35.,19.),'款項'),(2,(50.,10.,59.,19.),'目'),
                 (2,(20.,30.,24.5,39.),'1'),(2,(24.49,30.,29.,39.),'0'),
                 (2,(31.,30.,35.5,39.),'1'),(2,(40.,30.,44.5,39.),'3')]
        columns = [{'header':'支出済額','x_range':[15.,130.]}]
        self.assertTrue(check_digit_coverage(words,tables,amount_columns=columns)['passed'])
        words[-2] = (2,words[-2][1],'2')
        self.assertFalse(check_digit_coverage(words,tables,amount_columns=columns)['passed'])

    def test_short_printed_date_is_non_amount_but_a_decimal_is_not(self):
        result = check_digit_coverage([(1, (10., 10., 30., 19.), '（8．3．31）'),
                                      (1, (10., 30., 30., 39.), '8.31')], NodeTables([], []),
                                     amount_columns=[{'header': '金額', 'x_range': [10, 30]}])
        self.assertEqual(result['counts'], {'non_amount': 1, 'blocked': 1})

    def test_coverage_reports_elapsed_seconds(self):
        result = check_digit_coverage([], NodeTables([], []))
        self.assertTrue(result['passed'])
        self.assertGreaterEqual(result['elapsed'], 0)

    def test_coverage_sidecar_roundtrip_and_pre_save_gate(self):
        nodes=[{**node('p'), 'x0': 1., 'y0': 1., 'x1': 40., 'y1': 9.}]
        tables = NodeTables(nodes, [{**amount('p','10'), 'x0': 60., 'y0': 1., 'x1': 90., 'y1': 9.}])
        with TemporaryDirectory() as tmp:
            wide = Path(tmp) / 'general-setsu.parquet'
            wide.write_bytes(b'wide')
            report = write_coverage_words(wide, [(1, (60., 1., 90., 9.), '10'),
                                                 (1, (1., 1., 8., 9.), '12'),
                                                 (1, (70., 30., 80., 38.), '77'),
                                                 (1, (200., 30., 210., 38.), '99')])
            self.assertEqual(report['words'], 4)
            with self.assertRaises(ValueError):
                check_table_coverage(wide, tables)
            wide2 = Path(tmp) / 'general-notes.parquet'
            wide2.write_bytes(b'wide')
            write_coverage_words(wide2, [(1, (60., 1., 90., 9.), '10'),
                                         (1, (1., 1., 8., 9.), '12'),
                                         (1, (200., 30., 210., 38.), '99')])
            passed = check_table_coverage(wide2, tables)
            self.assertTrue(passed['passed'])
            self.assertEqual(passed['counts'], {'amount': 1, 'reported': 2})
            nodes[0]['code_text'] = '12'
            relabeled = check_table_coverage(wide2, tables)
            self.assertEqual(relabeled['counts'], {'amount': 1, 'label': 1, 'reported': 1})
            missing = Path(tmp) / 'other.parquet'
            missing.write_bytes(b'wide')
            self.assertEqual(check_table_coverage(missing, tables, require=False)['status'], '対象外')
            with self.assertRaises(ValueError):
                check_table_coverage(missing, tables)


class ParseAmountTest(unittest.TestCase):
    def test_printed_layout_is_ignored_but_absent_or_ambiguous_text_is_not_an_amount(self):
        cases = {'1,234,567': 1234567, '△1,000': -1000, '▲ 2,000': -2000, '-6,000,000': -6000000,
                 '1,959,393, 091': 1959393091, '774,472,949 円': 774472949, '円\n174,501,657': 174501657,
                 '(836,078)': 836078, '０': 0, '0': 0}
        for text, expected in cases.items():
            with self.subTest(text=text):
                self.assertEqual(parse_amount(text), expected)
        for text in (None, '', '－', '103,371,120,00', '繰越明許費', '1,000 千円'):
            with self.subTest(text=text):
                self.assertIsNone(parse_amount(text))


if __name__=='__main__':unittest.main()
