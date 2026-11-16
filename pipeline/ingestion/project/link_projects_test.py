import json
import unittest

from ingestion.project.link_projects import link


def row(detail_id, year, names, parent=None, kind='initial'):
    """(detail_id, parent_detail_id, *KEY, name, print_order)。会計・款・項・目は全部同じ"""
    return (detail_id, parent, '131091', year, kind, '一般会計', '民生費', '児童福祉費', '保育園費',
            json.dumps(names, ensure_ascii=False), names[-1], 0)


class LinkPreviousTest(unittest.TestCase):
    def ids(self, rows):
        return {d: p for d, p, _ in link(rows)}

    def test_年度で変わる数を名前に印字した事業は前の年度と結ぶ(self):
        ids = self.ids([
            row('a', 2024, ['私立保育園費']), row('a1', 2024, ['私立保育園費', '区内私立保育園経費105園定員7,701人'], 'a'),
            row('b', 2025, ['私立保育園費']), row('b1', 2025, ['私立保育園費', '区内私立保育園経費105園定員7,576人'], 'b'),
        ])
        self.assertEqual(ids['a1'], ids['b1'])

    def test_数を除くと同じ名前が複数あれば結ばない(self):
        ids = self.ids([
            row('a', 2024, ['職員費']), row('a1', 2024, ['職員費', '職員給与費17人'], 'a'), row('a2', 2024, ['職員費', '職員給与費9人'], 'a'),
            row('b', 2025, ['職員費']), row('b1', 2025, ['職員費', '職員給与費22人'], 'b'), row('b2', 2025, ['職員費', '職員給与費8人'], 'b'),
        ])
        self.assertNotIn(ids['b1'], {ids['a1'], ids['a2']})
        self.assertNotIn(ids['b2'], {ids['a1'], ids['a2']})

    def test_名前が同じ事業を先に結ぶ(self):
        ids = self.ids([
            row('a', 2024, ['職員費']), row('a1', 2024, ['職員費', '職員給与費17人'], 'a'), row('a2', 2024, ['職員費', '職員給与費9人'], 'a'),
            row('b', 2025, ['職員費']), row('b1', 2025, ['職員費', '職員給与費17人'], 'b'), row('b2', 2025, ['職員費', '職員給与費8人'], 'b'),
        ])
        self.assertEqual(ids['a1'], ids['b1'])
        self.assertEqual(ids['a2'], ids['b2'])

    def test_番号で見分ける事業は数を除いて結ばない(self):
        ids = self.ids([
            row('a', 2024, ['学校改築費']), row('a1', 2024, ['学校改築費', '区立第1小学校改築事業'], 'a'),
            row('b', 2025, ['学校改築費']), row('b1', 2025, ['学校改築費', '区立第2小学校改築事業'], 'b'),
        ])
        self.assertNotEqual(ids['a1'], ids['b1'])

    def test_名前の末尾の式が年度で変わる事業は前の年度と結ぶ(self):
        ids = self.ids([
            row('a', 2024, ['療養給付費']), row('a1', 2024, ['療養給付費', '7歳~69歳分16,124,513×0.7='], 'a'),
            row('a2', 2024, ['療養給付費', '0歳~6歳分268,062×0.8='], 'a'),
            row('b', 2025, ['療養給付費']), row('b1', 2025, ['療養給付費', '7歳~69歳分16,026,551×0.7='], 'b'),
            row('b2', 2025, ['療養給付費', '0歳~6歳分177,194×0.8='], 'b'),
        ])
        self.assertEqual(ids['a1'], ids['b1'])
        self.assertEqual(ids['a2'], ids['b2'])


class BuildYearsTest(unittest.TestCase):
    def test_当初予算と決算で末尾の式が違う事業は同じ年度に結ぶ(self):
        ids = {d: p for d, p, _ in link([
            row('a', 2025, ['療養給付費']), row('a1', 2025, ['療養給付費', '7歳~69歳分16,026,551×0.7='], 'a'),
            row('a2', 2025, ['療養給付費', '0歳~6歳分177,194×0.8='], 'a'),
            row('s', 2025, ['療養給付費'], kind='settlement'), row('s1', 2025, ['療養給付費', '7歳~69歳分0.7'], 's', 'settlement'),
            row('s2', 2025, ['療養給付費', '0歳~6歳分0.8'], 's', 'settlement'),
        ])}
        self.assertEqual(ids['a1'], ids['s1'])
        self.assertEqual(ids['a2'], ids['s2'])
        self.assertNotEqual(ids['a1'], ids['a2'])

    def test_数を除いて結ぶ子は同じ親の中だけで結ぶ(self):
        # 親は名前どおりに結ばれる（決算は逆の順に印字）。子は数を除くと同じ名前になるが、親が違う子どうしは結ばない
        ids = {d: p for d, p, _ in link([
            row('a', 2025, ['施設10人']), row('a1', 2025, ['施設10人', '委託費100円'], 'a'),
            row('b', 2025, ['施設20人']), row('b1', 2025, ['施設20人', '委託費200円'], 'b'),
            (*row('t', 2025, ['施設20人'], kind='settlement')[:-1], 0), (*row('t1', 2025, ['施設20人', '委託費300円'], 't', 'settlement')[:-1], 1),
            (*row('s', 2025, ['施設10人'], kind='settlement')[:-1], 2), (*row('s1', 2025, ['施設10人', '委託費400円'], 's', 'settlement')[:-1], 3),
        ])}
        self.assertEqual(ids['a'], ids['s'])
        self.assertEqual(ids['b'], ids['t'])
        self.assertEqual(ids['a1'], ids['s1'])
        self.assertEqual(ids['b1'], ids['t1'])


if __name__ == '__main__':
    unittest.main()
