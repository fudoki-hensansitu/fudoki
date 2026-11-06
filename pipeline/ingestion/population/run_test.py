"""住民基本台帳人口の xlsx の読み方。人数を取り違えると1人あたりの金額が全部ずれる。"""
import unittest

from ingestion.population.run import parse

HEAD = [
    ('令和8年1月1日住民基本台帳人口・世帯数（市区町村別）（総計）', None, None, None, None, None, None),
    (None, None, None, '人口', '人口', '人口', '世帯数'),
    (None, None, None, '男', '女', '計', '世帯数'),
    ('団体コード', '都道府県名', '市区町村名', '人', '人', '人', '世帯'),
]
# 47都道府県の行が揃わないと途中で切れた資料とみなすので、東京都以外の都道府県の行を足す
OTHER_PREFECTURES = [(f'{n:02d}0001', '県', '-', '1', '1', '2', '1') for n in range(1, 48) if n != 13]


class ParseTest(unittest.TestCase):
    def test_reads_prefectures_and_municipalities_but_not_the_national_total_or_notes(self):
        rows = HEAD + [('-', '合計', '-', '1', '2', '3', '4'),
                       ('130001', '東京都', '-', '6909523', '7168017', '14077553', '7778945'),
                       ('131091', '東京都', '品川区', '203897', '211747', '415644', '240687'),
                       *OTHER_PREFECTURES,
                       ('注2：外国人住民のうち…', None, None, None, None, None, None)]
        self.assertEqual([row for row in parse(rows, '2026-01-01') if row[0].startswith('13')], [('130001', 6909523, 7168017, 14077553, 7778945),
                                       ('131091', 203897, 211747, 415644, 240687)])

    def test_changed_columns_stop(self):
        rows = [*HEAD[:2], (None, None, None, '男', '女', '世帯数', '計'), HEAD[3],
                ('131091', '東京都', '品川区', '1', '2', '3', '4')]
        with self.assertRaisesRegex(ValueError, 'header'):
            parse(rows, '2026-01-01')

    def test_truncated_file_stops(self):
        rows = HEAD + [('130001', '東京都', '-', '1', '2', '3', '4'), *OTHER_PREFECTURES[:-1]]
        with self.assertRaisesRegex(ValueError, 'missing prefectures'):
            parse(rows, '2026-01-01')

    def test_reference_date_that_differs_from_the_title_stops(self):
        rows = HEAD + [('131091', '東京都', '品川区', '1', '2', '3', '4')]
        with self.assertRaisesRegex(ValueError, 'title'):
            parse(rows, '2025-01-01')


if __name__ == '__main__':
    unittest.main()
