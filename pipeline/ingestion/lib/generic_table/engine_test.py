"""Counterexamples exercise constraints, not the implementation's iteration order."""
import unittest
from ingestion.lib.generic_table import discover_numeric_columns, extract, numeric_cell, observe
from ingestion.lib.pdf_table import Box, Token
from ingestion.lib.node_tables import check_tree
from pathlib import Path
from unittest.mock import patch


def token(text, x, y, page=1, width=4):
    return Token(f'{page}/{x}/{y}/{text}', 'test', page, text, Box(x,y,x+width,y+8))


def fixture(branch_values=(4,6), branch_indents=(110,110)):
    words=[token('円',190,1)]
    for index,(x,code,name) in enumerate(((10,'1','款名'),(20,'1','項名'),(30,'1','目名'))):
        y=20+20*index
        words.extend([token(code,x,y),token(name,x+5,y,width=10),token(str(sum(branch_values)),70,y)])
    for index,(value,x) in enumerate(zip(branch_values,branch_indents)):
        y=80+20*index
        words.extend([token(str(index+1),x,y),token('子名'+str(index),x+5,y,width=12),token(str(value),190,y)])
    config=dict(body=[10,150],unit='円',principal_indents=[10,20,30],channels=[
        dict(axis='科目',label=[5,60],amounts=[[60,90,'支出済額']]),
        dict(axis='備考',label=[100,170],amounts=[[180,200,'備考']])])
    return tuple(words),config


class GenericTableTest(unittest.TestCase):
    def test_valid_tree_retains_printed_amount_locations(self):
        words,config=fixture()
        result=extract(words,config)
        self.assertTrue(result.accepted)
        self.assertEqual(result.check['counts'],{'一致':3})
        self.assertEqual([a['amount_text'] for a in result.tables.amounts],['10','10','10','4','6'])
        self.assertTrue(all(a['physical_page']==1 and a['x0'] is not None for a in result.tables.amounts))

    def test_right_aligned_two_digit_code_keeps_its_level(self):
        words,config=fixture()
        words=tuple(w for w in words if w.id!=token('1',20,40).id)+(token('10',15,40,width=10),)
        result=extract(words,config)
        self.assertEqual(result.tables.nodes[1]['level_header'],'項')
        self.assertEqual(result.tables.nodes[1]['code_text'],'10')
        self.assertTrue(result.accepted)

    def test_zero_amounts_cannot_disambiguate_hierarchy(self):
        words,config=fixture((0,0),(110,115))
        result=extract(words,config)
        self.assertTrue(result.check['passed'])
        self.assertGreater(result.diagnostics['passing_distinct_trees'],1)
        self.assertFalse(result.accepted)

    def test_empty_equation_set_never_accepts(self):
        words,config=fixture()
        result=extract(tuple(w for w in words if w.bbox.left>100),config)
        self.assertTrue(result.check['passed'])
        self.assertFalse(result.accepted)

    def test_missing_unit_never_accepts(self):
        words,config=fixture()
        result=extract(tuple(w for w in words if w.raw_text!='円'),config)
        self.assertFalse(result.accepted)

    def test_missing_printed_leaf_can_still_pass_sum_check(self):
        words,config=fixture((0,10))
        result=extract(words,config)
        zero=result.tables.nodes[-2]['node_key']
        nodes=[n for n in result.tables.nodes if n['node_key']!=zero]
        amounts=[a for a in result.tables.amounts if a['node_key']!=zero]
        self.assertTrue(check_tree(nodes,amounts)['passed'])
        self.assertLess(len(nodes),len(result.tables.nodes))

    def test_unshared_positive_amount_can_escape_sum_checks(self):
        words,config=fixture()
        result=extract(words,config)
        extra=dict(result.tables.amounts[-1],header_path='不用額',amount_text='123')
        expanded=check_tree(result.tables.nodes,[*result.tables.amounts,extra])
        self.assertTrue(expanded['passed'])
        self.assertEqual(expanded['counts'],result.check['counts'])

    def test_wrapped_label_amount_uses_its_own_baseline(self):
        words,config=fixture()
        words=tuple(w for w in words if w.id!=token('4',190,80).id)+(token('末尾',115,89,width=12),token('4',190,89))
        result=extract(words,config)
        child=result.tables.nodes[3]
        self.assertEqual(child['name_text'],'子名0\n末尾')
        self.assertEqual(result.tables.amounts[3]['y0'],89)
        self.assertTrue(result.accepted)

    def test_split_amount_and_detached_sign_preserve_raw_text(self):
        words=[token('△',70,15),token('12,',70,20,width=12),token('345',82,20,width=12)]
        value,where=numeric_cell(words,60,100,20)
        self.assertEqual(value,'△12,345')
        self.assertEqual(where['y0'],15)
        self.assertEqual(where['y1'],28)

    def test_fused_adjacent_amounts_are_not_guessed(self):
        self.assertIsNone(numeric_cell([token('0△200',70,20,width=30)],60,100,20))

    def test_repeated_numeric_alignment_joins_fragments(self):
        words=[w for y in (20,40,60) for w in (token('12,',60,y,width=12),token('345',72,y,width=12),token('9',100,y))]
        columns=discover_numeric_columns(words,(50,120))
        self.assertEqual([(c['right_edge'],c['observations']) for c in columns],[(84,3),(104,3)])

    def test_numeric_alignment_does_not_join_words_across_pages(self):
        words=[token('123',100,20,page=p,width=12) for p in (1,2,3)]
        self.assertEqual(discover_numeric_columns(words,(90,130)),[{'right_edge':112,'observations':3}])

    def test_spread_retains_amount_page_instead_of_label_page(self):
        words,config=fixture()
        config['spread']=True
        config['channels'][0]['paired_amounts']=[[60,90,'不用額']]
        words+=tuple(token('0',70,y,page=2) for y in (20,40,60))
        result=extract(words,config)
        paired=[a for a in result.tables.amounts if a['header_path']=='不用額']
        self.assertEqual(len(paired),3)
        self.assertTrue(all(a['physical_page']==2 for a in paired))
        self.assertTrue(all(n['physical_page']==1 for n in result.tables.nodes))

    def test_observation_uses_displayed_cropbox_and_physical_page(self):
        xml=b'<html><body><page><word xMin="10" yMin="20" xMax="20" yMax="30">A</word></page></body></html>'
        with patch('ingestion.lib.generic_table.subprocess.check_output',return_value=xml) as call:
            result=observe(Path('input.pdf'),[[7,7]],'fixed-sha')
        self.assertIn('-cropbox',call.call_args.args[0])
        self.assertEqual(result[0].page,7)
        self.assertEqual(result[0].origin_id,'fixed-sha')
