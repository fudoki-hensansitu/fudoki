"""Public migration contract for spread continuations and independent branches."""
from importlib import import_module
import unittest
import xml.etree.ElementTree as ET

from ingestion.fiscal.layouts.statement.text_document import build_document
from ingestion.fiscal.layouts.statement.text_document_test import fixture
from ingestion.lib.node_tables import migrate_rows, check_tree
from ingestion.lib.pdf_table import tokens_from_bbox_layout

converter = import_module('ingestion.fiscal.jurisdictions.132071.layouts.text_budget.convert')


def control_fixture():
    root = ET.Element('doc')
    page = ET.SubElement(root, 'page')
    for y, left, name in ((110, 100, '2総務費'), (130, 150, '1総務管理費'), (150, 100, '歳出合計')):
        for x, text in ((left, name), (300, '100'), (400, '180'), (500, '△80')):
            ET.SubElement(page, 'word', xMin=str(x), yMin=str(y), xMax=str(x + 10), yMax=str(y + 5)).text = text
    return tokens_from_bbox_layout(ET.tostring(root), origin_id='test', first_page=10)


class NodeMigrationContract(unittest.TestCase):
    def candidate(self):
        xml, profile = fixture()
        tables, bindings = build_document(xml, origin_id='test', pages=(108, 111), profile=profile)
        rows, metadata, total = converter.assemble(tables, bindings, control_fixture())
        return migrate_rows(rows, metadata), total

    def test_subject_codes_and_independent_axes_have_confirmed_parents(self):
        tables, total = self.candidate()
        self.assertEqual(total, '100')
        self.assertFalse(tables.issues)
        self.assertEqual((tables.unread_amount_count, tables.unresolved_parent_count), (0, 0))
        self.assertTrue(check_tree(tables.nodes, tables.amounts)['passed'])
        moku = [n for n in tables.nodes if n['level_header'] == '目']
        self.assertEqual([(n['code_text'], n['name_text']) for n in moku], [('1', '一般管理費'), (None, '旧事業')])
        by_key = {n['node_key']: n for n in tables.nodes}
        for n in tables.nodes:
            if n['axis_header'] != '科目' and n['depth'] == 1:
                self.assertEqual(by_key[n['parent_node_key']]['level_header'], '目')
        self.assertTrue(all(n['physical_page'] is not None for n in tables.nodes))
        funding = next(a for a in tables.amounts if a['header_path'] == '本年度予算額の財源内訳／特定財源／その他'
                       and by_key[a['node_key']]['level_header'] == '目')
        self.assertEqual(funding['amount_text'], '100')

    def test_continuation_amount_keeps_its_own_physical_page(self):
        tables, _ = self.candidate()
        leaf = next(n for n in tables.nodes if n['name_text'] == '頁をまたぐ明細')
        amount = next(a for a in tables.amounts if a['node_key'] == leaf['node_key'])
        self.assertEqual((leaf['physical_page'], amount['physical_page']), (109, 111))
        self.assertEqual((amount['x0'], amount['x1']), (494, 508))

    def test_changed_child_amount_is_rejected_by_tree_check(self):
        tables, _ = self.candidate()
        leaf = next(n for n in tables.nodes if n['name_text'] == '頁をまたぐ明細')
        next(a for a in tables.amounts if a['node_key'] == leaf['node_key'])['amount_text'] = '101'
        self.assertFalse(check_tree(tables.nodes, tables.amounts)['passed'])


if __name__ == '__main__':
    unittest.main()
