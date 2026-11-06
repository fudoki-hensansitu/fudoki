"""住民基本台帳人口の xlsx の読み方。人数を取り違えると1人あたりの金額が全部ずれる。"""
import unittest

from ingestion.population.run import parse

HEAD = [
    ('令和8年1月1日住民基本台帳人口・世帯数（市区町村別）（総計）', None, None, None, None, None, None),
    (None, None, None, '人口', '人口', '人口', '世帯数'),
    (None, None, None, '男', '女', '計', '世帯数'),
    ('団体コード', '都道府県名', '市区町村名', '人', '人', '人', '世帯'),
]


class ParseTest(unittest.TestCase):
    def test_reads_prefectures_and_municipalities_but_not_the_national_total_or_notes(self):
        rows = HEAD + [('-', '合計', '-', '1', '2', '3', '4'),
                       ('130001', '東京都', '-', '6909523', '7168017', '14077553', '7778945'),
                       ('131091', '東京都', '品川区', '203897', '211747', '415644', '240687'),
                       ('注2：外国人住民のうち…', None, None, None, None, None, None)]
        self.assertEqual(parse(rows), [('130001', 6909523, 7168017, 14077553, 7778945),
                                       ('131091', 203897, 211747, 415644, 240687)])

    def test_changed_columns_stop(self):
        rows = [*HEAD[:2], (None, None, None, '男', '女', '世帯数', '計'), HEAD[3],
                ('131091', '東京都', '品川区', '1', '2', '3', '4')]
        with self.assertRaisesRegex(ValueError, 'header'):
            parse(rows)


if __name__ == '__main__':
    unittest.main()
