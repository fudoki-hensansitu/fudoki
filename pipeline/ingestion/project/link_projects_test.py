"""事業の年度またぎの規則（手順1〜3）。結び方を間違えると、別の事業の金額が1つの事業の推移に混ざる。"""
import json
import unittest

from ingestion.project.link_projects import Line, assign, build_years, link, link_previous, normalize


def line(detail_id, year, kind, path, parent=None, moku='目', order=0):
    return Line(detail_id, parent, ('131091', year, kind, '一般会計', '款', '項', moku, json.dumps(path, ensure_ascii=False)),
                path[-1].split('#')[0], order)


class LinkProjectsTest(unittest.TestCase):
    def test_same_year_and_previous_year(self):
        prev = build_years({'initial': [line('a', 2025, 'initial', ['子育て支援費【子育て課】']),
                                        line('b', 2025, 'initial', ['子育て支援費【子育て課】', '相談'], 'a')]})
        cur = build_years({
            'initial': [line('c', 2026, 'initial', ['子育て支援費【子ども課】']),
                        line('d', 2026, 'initial', ['子育て支援費【子ども課】', '相談'], 'c'),
                        line('e', 2026, 'initial', ['新しい事業'])],
            'settlement': [line('f', 2026, 'settlement', ['子育て支援費【子ども課】']),
                           line('g', 2026, 'settlement', ['補正の事業'])],
        })
        # 決算の行は同じ並びの当初予算の行に結び、結べない決算の行は決算だけの年度になる
        pairs = {(y.initial.detail_id if y.initial else '', y.settlement.detail_id if y.settlement else '') for y in cur}
        self.assertEqual(pairs, {('c', 'f'), ('d', ''), ('e', ''), ('', 'g')})
        link_previous(cur, prev)
        assign({2025: prev, 2026: cur})
        ids = {x.detail_id: y.project_id for ys in (prev, cur) for y in ys for x in y.lines}
        # 所管課が変わっても名前で同じ事業、子は親が同じ事業の中で名前で結ぶ
        self.assertEqual(ids['c'], ids['a'])
        self.assertEqual(ids['d'], ids['b'])
        self.assertNotIn(ids['e'], {ids['a'], ids['b']})
        self.assertEqual(len({ids['e'], ids['g'], ids['a']}), 3)

    def test_same_names_pair_in_print_order(self):
        # 所管課だけ違う名前は比べる形が同じになる。読んだ順ではなく印字の順で組にする
        years = build_years({
            'initial': [line('b2', 2024, 'initial', ['学校維持管理費【学務課】'], order=2),
                        line('b1', 2024, 'initial', ['学校維持管理費【庶務課】'], order=1)],
            'settlement': [line('s1', 2024, 'settlement', ['学校維持管理費【庶務課】'], order=10),
                           line('s2', 2024, 'settlement', ['学校維持管理費【学務課】'], order=20)],
        })
        self.assertEqual({(y.initial.detail_id, y.settlement.detail_id) for y in years}, {('b1', 's1'), ('b2', 's2')})

    def test_ambiguous_names_start_new_projects(self):
        prev = build_years({'initial': [line('a', 2025, 'initial', ['運営費'], moku='目1'),
                                        line('b', 2025, 'initial', ['運営費'], moku='目2')]})
        cur = build_years({'initial': [line('c', 2026, 'initial', ['運営費'], moku='目3')]})
        link_previous(cur, prev)
        assign({2025: prev, 2026: cur})
        self.assertEqual(cur[0].method, 'new')


    def test_link_gives_every_line_one_project(self):
        # dbt が呼ぶ入口。自治体をまたいで行を落とさず、どの行もちょうど1つの事業ID を持つ
        rows = [(x.detail_id, x.parent_detail_id, *x.key, x.name, x.print_order) for x in (
            line('a', 2025, 'initial', ['子育て支援費']),
            line('b', 2025, 'initial', ['子育て支援費', '相談'], 'a'),
            line('c', 2026, 'initial', ['子育て支援費']),
            line('d', 2026, 'settlement', ['子育て支援費']),
            line('e', 2026, 'settlement', ['補正の事業']),
        )]
        rows.append(('z', None, '131016', 2026, 'initial', '一般会計', '款', '項', '目', '["子育て支援費"]', '子育て支援費', 0))
        ids = {}
        for detail_id, project, _ in link(rows):
            self.assertNotIn(detail_id, ids)
            ids[detail_id] = project
        self.assertEqual(set(ids), {'a', 'b', 'c', 'd', 'e', 'z'})
        self.assertEqual(ids['a'], ids['c'])
        self.assertEqual(ids['c'], ids['d'])
        self.assertNotEqual(ids['z'], ids['c'])


    def test_bracketed_department_is_not_part_of_the_name(self):
        # 中央区・八王子は所管課を [] で印字する。所管課が変わっても同じ事業、[1人分] のような注記は名前に残す
        self.assertEqual(normalize('小学校管理事業[学務課]'), normalize('小学校管理事業[教育総務課]'))
        self.assertEqual(normalize('職員費[1人分]'), '職員費[1人分]')


if __name__ == '__main__':
    unittest.main()
