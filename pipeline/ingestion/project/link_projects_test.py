import json
import unittest

from ingestion.project.link_projects import link


def row(detail_id, year, names, parent=None):
    """(detail_id, parent_detail_id, *KEY, name, print_order)。会計・款・項・目は全部同じ"""
    return (detail_id, parent, '131091', year, 'initial', '一般会計', '民生費', '児童福祉費', '保育園費',
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


if __name__ == '__main__':
    unittest.main()
