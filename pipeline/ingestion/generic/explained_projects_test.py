import unittest
from types import SimpleNamespace
from unittest import mock

from ingestion.generic import explained_projects as E
from ingestion.generic.observe import Page, Word


def line(y, *cells):
    """Words on one line: (x, text) pairs, each word 9pt a character."""
    return [Word(text, x, y, x + 9 * len(text), y + 9) for x, text in cells]


def node(key, parent, axis, depth, level, code, name, page=1, y=100.0, x=80.0):
    return {'node_key': key, 'parent_node_key': parent, 'axis_header': axis, 'depth': depth, 'level_header': level,
            'code_text': code, 'name_text': name, 'physical_page': page, 'x0': x, 'y0': y, 'x1': 200.0, 'y1': y + 9}


class LevelCellsTest(unittest.TestCase):
    def test_one_header_cell_over_the_four_code_columns_names_each(self):
        from ingestion.generic.layout import level_cells
        cells = level_cells([((30, 90, 70, 80), '款項目事務事業')], [30, 45, 60, 75, 90], '款項目事務事業')
        self.assertEqual([(key[:2], level) for key, level in cells],
                         [((30, 45), '款'), ((45, 60), '項'), ((60, 75), '目'), ((75, 90), '事務事業')])


class KeyTest(unittest.TestCase):
    def test_a_department_row_matches_its_total_through_ocr_misreadings(self):
        # 131211: 創工ネ and 防犯力メラ (kanji of the shape of a katakana), サ一ビス (a long vowel as 一), 大気污染.
        self.assertEqual(E._key('8 省工ネ・創工ネ推進事業'), E._key('8 省エネ・創エネ推進事業'))
        self.assertEqual(E._key('防犯力メラ一括管理事業'), E._key('防犯カメラ一括管理事業'))
        self.assertEqual(E._key('サ一ビス'), E._key('サービス'))
        self.assertEqual(E._key('大気污染健康障害'), E._key('大気汚染健康障害'))

    def test_a_short_amount_read_with_its_unit_comes_apart(self):
        figure, unit = E._split_unit(Word('0円', 481, 374, 500, 386))
        self.assertEqual((figure.text, unit.text), ('0', '円'))
        self.assertLess(figure.x1, unit.x0 + 0.01)
        self.assertEqual([w.text for w in E._split_unit(Word('5,977,191', 447, 374, 490, 386))], ['5,977,191'])

    def test_a_kanji_away_from_katakana_stays(self):
        self.assertEqual(E._key('人口動態'), '人口動態')


class ExplanationTest(unittest.TestCase):
    def page(self):
        words = (line(37, (90, '01'), (118, '一般会計'))
                 + line(94, (112, '翌年度繰越額'), (342, '執行率'))
                 + line(110, (105, 'イ'), (123, '世論調査'))  # the explanation of a row on the spread before
                 + line(139, (93, '(2)'), (120, '区民相談運営事業'))
                 + line(154, (105, 'ア'), (123, '委託費用'))
                 + line(169, (123, '一般相談12,128件'))
                 + line(198, (105, 'イ区民相談室の人材派遣'), (360, '延'), (380, '93人'))
                 + line(257, (87, '4'), (105, '報道事務'))
                 + line(272, (111, '(政策経営部)'))
                 + line(287, (105, 'ア'), (123, '中継委託')))
        return Page(18, 595, 842, words)

    def test_items_are_read_under_the_row_they_explain(self):
        items = E.explained_items(self.page())
        self.assertEqual([(i['section'], i['code'], i['name']) for i in items], [
            (None, 'イ', '世論調査'),
            (('(2)', '区民相談運営事業', None), 'ア', '委託費用'),
            (('(2)', '区民相談運営事業', None), 'イ', '区民相談室の人材派遣'),
            (('4', '報道事務', '(政策経営部)'), 'ア', '中継委託')])

    def test_an_item_whose_code_ocr_left_unread_takes_the_code_its_neighbours_skip(self):
        words = (line(94, (112, '翌年度繰越額'), (342, '執行率'))
                 + line(139, (87, '1'), (105, '住民基本台帳事務'))
                 + line(154, (105, 'ア'), (123, 'コンビニ交付委託手数料'))
                 + line(169, (123, '郵送請求住民票交付業務委託'))  # OCR read no イ
                 + line(184, (105, 'ウ'), (123, '証明書交付センター運営負担金等')))
        items = E.explained_items(Page(2, 595, 842, words))
        self.assertEqual([(i['code'], i['name']) for i in items],
                         [('ア', 'コンビニ交付委託手数料'), ('イ', '郵送請求住民票交付業務委託'), ('ウ', '証明書交付センター運営負担金等')])

    def test_a_row_takes_its_own_explanation_even_when_the_one_above_names_none(self):
        items = E.explained_items(self.page())
        # 情報公開 prints ア/イ on the left page but OCR read no line of its explanation: they get no name, and
        # 報道事務's names stay for 報道事務.
        self.assertIsNone(E._name([items], ('(1)', '情報公開・個人情', None), 'ア'))
        self.assertEqual(E._name([items], ('4', '報道事務', '(政策経営部)'), 'ア'), '中継委託')
        # an item at the top of the left page continues the row of the spread before
        self.assertEqual(E._name([items], ('(1)', '世論調査事業', None), 'イ'), '世論調査')


class ContinuedRowsTest(unittest.TestCase):
    def test_a_volume_that_starts_inside_a_project_hangs_its_first_rows_under_the_rows_it_continues(self):
        header = (line(20, (51, '令和6年度'), (144, '歳出事業別決算説明書'))
                  + line(40, (30, '2'), (49, '総務費'), (93, '4'), (110, '戸籍及び住民基本台帳費'), (227, '2'), (244, '戸籍事務費'))
                  + line(58, (94, '予'), (304, '明'))
                  + line(70, (30, '款項目'), (95, '事'), (280, '予')))
        page = Page(1, 595, 842, header)  # the rows' levels come from their x: 款 30, 項 46, 目 60 (step 13.5)
        built = SimpleNamespace(nodes=[
            node('sub', None, '事務事業', 3, None, '1', '戸籍整備事務', y=100),
            # the builder, with no 款 row, levels from the shallowest: 目 3 as 項, 項 5 as 款, 目 4 under 目 3
            node('moku3', None, '科目', 2, '項', '3', '住民基本台帳費', y=120, x=60),
            node('moku4', 'moku3', '科目', 3, '目', '4', '住居表示費', y=160, x=60),
            node('kou5', None, '科目', 1, '款', '5', '選挙費', y=200, x=46)],
            unowned=[{'kind': 'no subject parent', 'page': 1, 'text': '戸籍整備事務'}])
        continued = [{'code': '1', 'name': '戸籍整備事務'}, {'code': '1', 'name': '戸籍整備事務', 'department': '区民部'}]
        with mock.patch.object(E, '_edges', return_value=(70.5, 0, 0, 0, 0)):  # the 事務事業 column starts at 70.5
            problems = E.continue_rows(built, [page], continued, {(1, 100): 2}, '科目', '事務事業', {})
        self.assertEqual(problems, [])
        by = {n['node_key']: n for n in built.nodes}
        name = lambda key: by[key]['name_text'] if key else None
        chain = [(n['level_header'], n['code_text'], n['name_text'], name(n['parent_node_key']), n['depth'])
                 for n in built.nodes]
        self.assertEqual(chain, [
            ('款', '2', '総務費', None, 1),
            ('項', '4', '戸籍及び住民基本台帳費', '総務費', 2),
            ('目', '2', '戸籍事務費', '戸籍及び住民基本台帳費', 3),
            (None, '1', '戸籍整備事務', '戸籍事務費', 1),
            (None, '1', '戸籍整備事務(区民部)', '戸籍整備事務', 2),
            (None, '1', '戸籍整備事務', '戸籍整備事務(区民部)', 3),
            ('目', '3', '住民基本台帳費', '戸籍及び住民基本台帳費', 3),
            ('目', '4', '住居表示費', '戸籍及び住民基本台帳費', 3),
            ('項', '5', '選挙費', '総務費', 2)])
        self.assertEqual(built.unowned, [])


class AttachTest(unittest.TestCase):
    def item(self, code, name, y, amount):
        return E.Item(17, code, name, (105, y, 200, y + 9), amount, (447, y, 490, y + 9), (17, 300))

    def test_latin_items_hang_under_the_item_above_and_a_declared_name_fills_one_ocr_left_unread(self):
        built = SimpleNamespace(nodes=[node('row', 'moku', '事務事業', 2, None, '1', '生活保護費', page=17, y=300)],
                                amounts=[])
        items = [self.item('ア', '扶助費', 310, '100'), self.item('a', '生活費', 320, '60'),
                 self.item('(a)', '冬季加算', 330, '10'), self.item('b', None, 340, '40'), self.item('イ', '事務費', 350, '5')]
        declared = [{'page': 17, 'code': 'b', 'amount': '40', 'name': '住宅費'},
                    {'page': 17, 'code': 'ウ', 'amount': '1', 'name': '無い項目'}]
        problems = E.attach(built, items, {'items_axis': '決算説明'}, declared=declared)
        by = {n['node_key']: n for n in built.nodes}
        self.assertEqual([(n['code_text'], n['name_text'], by[n['parent_node_key']]['code_text'], n['depth'])
                          for n in built.nodes[1:]],
                         [('ア', '扶助費', '1', 1), ('a', '生活費', 'ア', 2), ('(a)', '冬季加算', 'a', 3),
                          ('b', '住宅費', 'ア', 2), ('イ', '事務費', '1', 1)])
        self.assertEqual(problems, ['宣言した説明の項目の名前に当たる項目が無い: 17頁 ウ 1'])


class UnusedNotesTest(unittest.TestCase):
    def test_a_bare_amount_under_a_row_is_its_unused_note_and_no_part_of_a_sum(self):
        built = SimpleNamespace(nodes=[node('row', 'moku', '事務事業', 2, None, '4', '報道事務(政策経営部)', page=17, y=300)],
                                amounts=[])
        word = Word('1,563,852', 447, 360, 490, 369)
        problems = E.notes(built, [E.Moved(17, word, 'unused', (17, 300.4), 1563852)])
        self.assertEqual(problems, [])
        note = built.nodes[-1]
        self.assertEqual((note['parent_node_key'], note['axis_header'], note['level_header']), ('row', '注記', '不用額'))
        self.assertEqual([(a['header_path'], a['amount_text'], a['unit_text']) for a in built.amounts],
                         [('注記金額', '1,563,852', '円')])

    def test_the_part_carried_from_the_year_before_is_a_labelled_note(self):
        built = SimpleNamespace(nodes=[node('row', 'moku', '事務事業', 2, None, '3', '駐輪場の建設・改修事業', page=1, y=300)],
                                amounts=[])
        words = [Word('(令和5年度繰越明許費分', 120, 330, 300, 339), Word('56,600,000円)', 310, 330, 380, 339)]
        moved = [E.Moved(1, w, 'carried', (1, 300.2)) for w in words]
        moved.append(E.Moved(1, Word('616,000', 30, 360, 70, 369), 'forward', (1, 300.2), 616000))
        self.assertEqual(E.notes(built, moved), [])
        self.assertEqual([(n['level_header'], n['name_text']) for n in built.nodes[1:]],
                         [('繰越額', '令和5年度繰越明許費分'), ('繰越額', None)])
        self.assertEqual([(a['amount_text'], a['x0']) for a in built.amounts], [('56,600,000', 310), ('616,000', 30)])


if __name__ == '__main__':
    unittest.main()
