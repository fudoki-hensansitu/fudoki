import unittest

from ingestion.project import sheet


class AmountTest(unittest.TestCase):
    def test_units_and_signs(self):
        self.assertEqual(sheet.amount('1,234', '千円'), 1_234_000)
        self.assertEqual(sheet.amount('1,234', '円'), 1_234)
        self.assertEqual(sheet.amount('▲1,234', '円'), -1_234)
        self.assertEqual(sheet.amount('△5', '千円'), -5_000)
        self.assertIsNone(sheet.amount('―', '円'))
        self.assertIsNone(sheet.amount(None, '円'))


class ParseTest(unittest.TestCase):
    WORKFLOW = {
        'fields': [
            '^事業名 (?P<name>.+)\\n(?P<name_more>.+) 課$',
            {'pattern': '^予算 (?P<budget>[\\d,]+)', 'unit': '円'},
            '^決算 (?P<settled>[\\d,]+)',
            '^方向 (?P<grade>\\S+)',
        ],
        'unit': '千円',
    }

    def test_fields(self):
        text = sheet.norm('事業名 広報\n活動 課\n予算 1,500\n決算 2\n方向 成果拡大に向けて見直し')
        got = sheet.parse(text, 3, self.WORKFLOW)
        self.assertEqual(got.name, '広報活動')
        self.assertEqual(got.budget_yen, 1_500)
        self.assertEqual(got.settled_yen, 2_000)
        self.assertEqual(got.grade_label, '成果拡大に向けて見直し')

    def test_missing_name_is_skipped(self):
        self.assertIsNone(sheet.parse('方向 縮小', 2, self.WORKFLOW))



class DirectionTest(unittest.TestCase):
    def test_default_order(self):
        cases = {'対象・規模等の拡大': 'expand', '事業の廃止等に向けた検討': 'consider_end', '取組みの一部廃止': 'reduce',
                 '成果拡大に向けて見直し': 'improve', '整理・統合に向けて見直し': 'merge', '休止・完了': 'complete',
                 '事業の廃止': 'end', '重点的に推進': 'expand', '維持・推進': 'keep', 'その他・対象外': None, None: None}
        for text, code in cases.items():
            self.assertEqual(sheet.direction_code(text), code, text)

    def test_overrides_come_first(self):
        self.assertEqual(sheet.direction_code('E', {'^E$': 'keep'}), 'keep')
        with self.assertRaises(ValueError):
            sheet.direction_code('X', {'X': 'unknown'})

class ItemTest(unittest.TestCase):
    WORKFLOW = {'item': '^事業名 ', 'fields': ['^事業名 (?P<name>.+)$', '^所管 (?P<division>.+)$'], 'unit': '円'}

    def test_items_get_positions_and_share_header(self):
        text = sheet.norm('所管 総務課\n事業名 広報\n事業名 庁舎管理')
        got = sheet.parse_items(text, 4, self.WORKFLOW)
        self.assertEqual([(s.name, s.page, s.position, s.division) for s in got],
                         [('広報', 4, 1, '総務課'), ('庁舎管理', 4, 2, '総務課')])

    def test_page_without_items_is_empty(self):
        self.assertEqual(sheet.parse_items('所管 総務課', 1, self.WORKFLOW), [])


class CsvTest(unittest.TestCase):
    def test_rows_become_sheets(self):
        import tempfile
        from pathlib import Path
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / 'a.csv'
            path.write_text('\ufeff事業名,課,評価\n広報,総務課,維持・推進\n,,\n庁舎,管財課,―\n', encoding='utf-8')
            got = sheet.read_csv(path, {'columns': {'name': '事業名', 'division': '課', 'grade': '評価'}})
        self.assertEqual([(s.page, s.name, s.division, s.grade_label) for s in got],
                         [(1, '広報', '総務課', '維持・推進'), (3, '庁舎', '管財課', None)])

    def test_fallback_column(self):
        import tempfile
        from pathlib import Path
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / 'a.csv'
            path.write_text('事業名,検索キー\n広報,1 広報\n,2 庁舎管理\n', encoding='utf-8')
            got = sheet.read_csv(path, {'columns': {'name': ['事業名', {'column': '検索キー', 'pattern': '^\\d+ (.+)$'}]}})
        self.assertEqual([s.name for s in got], ['広報', '庁舎管理'])

    def test_amounts_are_not_allowed(self):
        with self.assertRaises(ValueError):
            sheet.read_csv('unused.csv', {'columns': {'name': 'a', 'budget': 'b'}})


class RegionTest(unittest.TestCase):
    from ingestion.generic.page_words import Word
    W = staticmethod(lambda text, x, y: RegionTest.Word(text, x, y, x + 10 * len(text), y + 10))

    def test_wrapped_name_and_named_groups(self):
        anchor = self.W('3', 30, 100)
        words = [self.W('技能功労褒賞事', 40, 95), anchor, self.W('業', 40, 105), self.W('ア', 120, 100),
                 self.W('一般', 40, 140), self.W('5', 70, 140), self.W('1', 80, 140), self.W('業務量', 300, 140)]
        self.assertEqual(sheet.region(words, anchor, {'x': [36, 110], 'y': [-10, 10]}), '技能功労褒賞事業')
        self.assertEqual(sheet.region(words, anchor, {'from': '^業務量', 'x': [36, 110], 'y': [-2, 2],
                                                      'pattern': '^(?P<account>\\D+)(?P<kan_code>\\d+) (?P<kou_code>\\d+)'}),
                         {'account': '一般', 'kan_code': '5', 'kou_code': '1'})
        # before の行から下は枠に入れない
        self.assertEqual(sheet.region(words, anchor, {'x': [36, 110], 'y': [-10, 50], 'before': '^業務量'}), '技能功労褒賞事業')


if __name__ == '__main__':
    unittest.main()
