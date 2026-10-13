"""A parent whose children print nothing is not compared; every other group is checked as before."""
import unittest

from ingestion.lib import node_tables
from ingestion.lib.tree_check import check_tree


def node(key, parent=None, axis='科目'):
    return {'node_key': key, 'parent_node_key': parent, 'axis_header': axis, 'depth': 1,
            'level_header': None, 'code_text': None, 'name_text': key,
            'physical_page': 1, 'x0': None, 'y0': 1., 'x1': None, 'y1': None}


def amount(key, text, header='支出済額', unit='円'):
    return {'node_key': key, 'header_path': header, 'amount_text': text, 'unit_text': unit,
            'physical_page': 1, 'x0': None, 'y0': 1., 'x1': None, 'y1': None}


class TreeCheckTest(unittest.TestCase):
    def test_a_lone_child_that_prints_nothing_is_not_a_mismatch(self):
        # 細節が1つのとき金額を印字しない作り（節の金額と同じなので省く）。
        nodes = [node('p'), node('setsu', 'p', '節'), node('only', 'setsu', '節')]
        amounts = [amount('p', '10'), amount('setsu', '10', '節/金額')]
        self.assertFalse(node_tables.check_tree(nodes, amounts)['passed'])  # the strict check still stops
        checked = check_tree(nodes, amounts)
        self.assertTrue(checked['passed'])
        self.assertEqual(checked['counts'], {})

    def test_one_printing_child_among_unprinted_ones_still_compares(self):
        nodes = [node('p'), node('a', 'p'), node('b', 'p')]
        amounts = [amount('p', '10'), amount('a', '4')]
        checked = check_tree(nodes, amounts)
        self.assertEqual(checked['counts'], {'不一致': 1})
        self.assertFalse(checked['passed'])
        amounts.append(amount('b', '6'))
        self.assertEqual(check_tree(nodes, amounts)['counts'], {'一致': 1})

    def test_a_printing_grandchild_under_an_unprinted_child_still_compares(self):
        nodes = [node('p'), node('a', 'p'), node('aa', 'a')]
        amounts = [amount('p', '10'), amount('aa', '9')]
        self.assertEqual(check_tree(nodes, amounts)['counts'], {'不一致': 1})
        amounts[-1] = amount('aa', '10')
        self.assertEqual(check_tree(nodes, amounts)['counts'], {'一致': 1})

    def test_children_printing_another_heading_do_not_excuse_the_parent(self):
        nodes = [node('p'), node('a', 'p')]
        amounts = [amount('p', '10'), amount('a', '10', '予算現額')]
        self.assertEqual(check_tree(nodes, amounts)['counts'], {'不一致': 1})

    def test_structural_failures_stay_failures(self):
        nodes = [node('p'), node('a', 'missing')]
        checked = check_tree(nodes, [amount('p', '1')])
        self.assertFalse(checked['passed'])
        self.assertTrue(checked['issues'])


if __name__ == '__main__':
    unittest.main()
