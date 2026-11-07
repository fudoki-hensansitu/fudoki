import unittest
from types import SimpleNamespace

from ingestion.generic import inner_tables
from ingestion.generic.observe import Page, Rule, Word

SETTING = {'marker': '当初予算額', 'left': '目', 'heading': '事務事業'}


def vertical(x, y0, y1):
    return Rule(x, y0, x, y1)


def horizontal(y, x0, x1):
    return Rule(x0, y, x1, y)


def page():
    """A 131199 page in miniature: a 目 row, then the block under it (a 事業説明 and the boxed 事務事業 table),
    where the amount columns' rule (x 157) stops, then the next 目 row."""
    words = [Word('目', 111, 90, 120, 100), Word('当初予算額', 165, 90, 230, 100),
             Word('1連続立体化事業', 78, 198, 150, 207), Word('16,903,000', 184, 198, 233, 207),
             Word('1', 78, 235, 83, 244), Word('事業説明', 93, 235, 126, 244),
             Word('令和6年度に2件を支出した', 93, 257, 270, 264),
             Word('事務事業', 116, 314, 280, 326), Word('予算現額', 340, 314, 403, 326), Word('決算額', 447, 314, 502, 326),
             Word('1', 92, 342, 95, 350), Word('連続立体化事業推進経費', 105, 342, 198, 350),
             Word('16,683,000円', 348, 341, 423, 352), Word('16,623,682', 471, 341, 514, 352), Word('円', 519, 341, 527, 352),
             Word('(P121)', 114, 352, 147, 360),
             Word('都市計画課', 130, 363, 173, 372), Word('36', 364, 363, 377, 374), Word('000円', 381, 363, 404, 374),
             Word('35,000円', 468, 363, 507, 374),
             Word('件数', 140, 380, 160, 388), Word('12', 250, 380, 260, 388),
             Word('鉄道立体化推進課', 130, 395, 198, 404), Word('16,647,000円', 348, 395, 403, 404),
             Word('16,588,682円', 451, 395, 506, 404),
             Word('2事業費', 62, 432, 102, 443), Word('760,097,000', 184, 432, 234, 443)]
    rules = [vertical(41, 73.5, 759), vertical(74, 73.5, 117.5), vertical(74, 191, 759),
             vertical(157.2, 73.5, 224.5), vertical(157.2, 426, 481),
             vertical(77.5, 308.5, 412), vertical(320.2, 308.5, 412), vertical(423.2, 308.5, 412),
             vertical(526.2, 308.5, 412), vertical(135, 377, 391), vertical(240, 377, 391), vertical(300, 377, 391),
             horizontal(223.8, 73.5, 530.5), horizontal(309.2, 77, 527), horizontal(330.5, 77, 527),
             horizontal(411.5, 77, 527), horizontal(426.8, 57, 530.5)]
    return Page(1, 595, 842, words, rules)


class InnerTablesTest(unittest.TestCase):
    def test_a_block_is_cut_out_of_the_columns(self):
        kept, blocks = inner_tables.cut([page()], SETTING)
        self.assertEqual([(b.top, b.bottom) for b in blocks], [(224.5, 426), (481, 759)])
        texts = [w.text for w in kept[0].words]
        self.assertIn('1連続立体化事業', texts)
        self.assertIn('760,097,000', texts)
        self.assertNotIn('16,683,000円', texts)
        self.assertNotIn('事業説明', texts)
        self.assertFalse(any(abs(r.x0 - 320.2) < 1 for r in kept[0].rules))

    def test_the_boxed_table_is_laid_under_the_subject_above_with_its_amounts(self):
        _, blocks = inner_tables.cut([page()], SETTING)
        subject = {'node_key': 'moku', 'level_header': '目', 'physical_page': 1, 'y0': 198.0}
        built = SimpleNamespace(nodes=[subject], amounts=[])
        prose, figures = inner_tables.attach(built, blocks, SETTING)
        rows = [(n['code_text'], n['name_text'], n['depth'], n['parent_node_key']) for n in built.nodes[1:]]
        project = built.nodes[1]['node_key']
        self.assertEqual(rows, [('1', '連続立体化事業推進経費(P121)', 1, 'moku'), (None, '都市計画課', 2, project),
                                (None, '鉄道立体化推進課', 2, project)])
        self.assertTrue(all(n['axis_header'] == '事務事業' and n['level_header'] is None for n in built.nodes[1:]))
        amounts = [(a['header_path'], a['amount_text'], a['unit_text']) for a in built.amounts]
        self.assertEqual(amounts, [('予算現額', '16,683,000', '円'), ('決算額', '16,623,682', '円'),
                                   ('予算現額', '36,000', '円'), ('決算額', '35,000', '円'),
                                   ('予算現額', '16,647,000', '円'), ('決算額', '16,588,682', '円')])
        self.assertEqual(sorted(w.text for _, w in prose), ['1', '事業説明', '令和6年度に2件を支出した'])
        self.assertEqual(sorted(w.text for _, w in figures), ['12', '件数'])

    def test_a_cell_that_is_no_amount_stops(self):
        broken = page()
        broken.words.append(Word('約', 360, 395, 365, 404))
        _, blocks = inner_tables.cut([broken], SETTING)
        built = SimpleNamespace(nodes=[{'node_key': 'moku', 'level_header': '目', 'physical_page': 1, 'y0': 198.0}],
                                amounts=[])
        with self.assertRaisesRegex(ValueError, 'no amount'):
            inner_tables.attach(built, blocks, SETTING)

    def test_a_page_without_the_marker_header_is_left_alone(self):
        plain = Page(2, 595, 842, [Word('節', 100, 90, 110, 100), Word('12,000', 200, 200, 240, 210)],
                     [vertical(41, 73.5, 759)])
        kept, blocks = inner_tables.cut([plain], SETTING)
        self.assertEqual((kept, blocks), ([plain], []))


if __name__ == '__main__':
    unittest.main()
