"""The amendment's lines carry the amended and proposed amounts, and page 1 must agree with them."""
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

from ingestion.generic.observe import Word

spec = importlib.util.spec_from_file_location('council_amendment', Path(__file__).with_name('convert.py'))
convert = importlib.util.module_from_spec(spec)
spec.loader.exec_module(convert)

OPTIONS = {'account': '一般会計', 'table_id': 'general-amendment', 'bill': '第7号議案', 'business_axis': '説明',
           'headings': {'修正金額': '本年度予算額', '原案金額': '予算案額', '差': '比較'}}


def line(y, *cells):
    return [Word(text, x, y, x1, y + 12) for x, x1, text in cells]


def page1(kou_amended='23,703,567'):
    return [*line(264, (445.8, 541.7, '（単位：千円）')),
            *line(285, (131.2, 143.2, '款'), (269.4, 281.4, '項'), (352.0, 364.0, '修'), (376.0, 388.0, '正'),
                  (400.0, 412.0, '金'), (424.0, 436.0, '額'), (451.4, 463.4, '原'), (475.4, 487.4, '案'),
                  (499.4, 511.4, '金'), (523.4, 535.4, '額')),
            *line(308, (73.5, 85.5, '10'), (97.5, 193.5, 'まちづくり推進費'), (378.3, 438.3, '23,703,567'), (477.7, 537.7, '23,704,417')),
            *line(331, (211.7, 217.7, '1'), (229.7, 325.7, 'まちづくり推進費'), (378.3, 438.3, kou_amended), (477.7, 537.7, '23,704,417'))]


def page2():
    return [*line(141, (704.9, 781.9, '（単位：千円）')),
            *line(160, (113.2, 124.2, '款'), (231.6, 242.6, '項'), (363.2, 374.3, '目'), (497.2, 541.3, '事務事業'),
                  (608.2, 652.3, '修正金額'), (679.2, 723.4, '原案金額'), (756.1, 767.2, '差')),
            *line(180.5, (448.7, 454.2, '1'), (459.7, 569.8, '中野駅周辺まちづくり')),
            *line(189.7, (61.7, 72.7, '10'), (78.2, 166.3, 'まちづくり推進費'), (185.6, 191.2, '1'), (196.7, 284.8, 'まちづくり推進費'),
                  (298.7, 304.2, '3'), (309.7, 430.7, '中野駅周辺まちづくり費'), (605.8, 660.8, '11,495,551'),
                  (676.8, 731.9, '11,496,401'), (748.7, 759.7, '▲'), (765.2, 781.8, '850')),
            *line(199, (448.7, 465.2, '(1)'), (470.8, 569.8, '中野駅周辺地区整備'))]


def run(first):
    with patch.object(convert, 'words', return_value={1: (595, 842, first), 2: (842, 595, page2())}):
        return convert.convert([{'path': 'amendment.pdf'}], None, OPTIONS)['general-amendment']['node_tables']


class CouncilAmendmentTest(unittest.TestCase):
    def test_the_deepest_business_line_holds_the_amended_and_proposed_amounts(self):
        tables = run(page1())
        leaf = [n for n in tables.nodes if n['name_text'] == '中野駅周辺地区整備']
        self.assertEqual([(n['axis_header'], n['depth'], n['code_text']) for n in leaf], [('説明', 2, '1')])
        self.assertEqual({(a['header_path'], a['amount_text'], a['unit_text']) for a in tables.amounts},
                         {('本年度予算額', '11,495,551', '千円'), ('予算案額', '11,496,401', '千円'), ('比較', '▲850', '千円')})
        self.assertTrue(all(a['node_key'] == leaf[0]['node_key'] for a in tables.amounts))

    def test_a_page_1_difference_the_lines_do_not_explain_stops(self):
        with self.assertRaisesRegex(ValueError, 'Page 1 differences'):
            run(page1(kou_amended='23,703,000'))


if __name__ == '__main__':
    unittest.main()
