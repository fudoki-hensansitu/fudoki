"""1つの枠に収入と支出、収益的と資本的の表が続けて印字された頁。見出しを読み違えると収入の金額が歳出に入る。"""
import unittest

from ingestion.generic.layout import under_other_headings
from ingestion.generic.observe import Page, Word

SETTING = {'levels': [['収益的収入及び支出', '資本的収入及び支出'], ['収入', '支出']], 'keep': ['収益的収入及び支出', '支出']}


def line(text: str, y: float, x: float = 300.0) -> list[Word]:
    """A heading printed letter-spaced, a word per character (`収 入`)."""
    return [Word(c, x + 14 * i, y, x + 14 * i + 10, y + 9) for i, c in enumerate(text)]


class FrameHeadingsTest(unittest.TestCase):
    def test_only_the_rows_under_the_kept_headings_are_read(self):
        # 栃木県 2024 流域下水道事業会計 344頁: 収益的 / 収入 / 支出 の順
        words = [*line('収益的収入及び支出', 60), *line('収入', 80), Word('（単位千円）', 700, 80, 760, 89),
                 Word('9,789,000', 500, 120, 560, 129), *line('支出', 300), Word('9,445,000', 500, 340, 560, 349)]
        page = Page(344, 842, 595, words)
        state: dict = {}
        dropped, heading_words = under_other_headings(page, SETTING, state)
        self.assertEqual(dropped, [(float('-inf'), 300)])
        self.assertEqual({words[i].text for i in heading_words}, {*'収益的入及び支出', '（単位千円）'})
        # 次の頁は見出しなしで続く支出の行から始まり、資本的の見出しで読まなくなる
        following = Page(345, 842, 595, [Word('98,316', 500, 60, 540, 69), *line('資本的収入及び支出', 200),
                                         *line('収入', 220), *line('支出', 400)])
        dropped, _ = under_other_headings(following, SETTING, state)
        self.assertEqual(dropped, [(200, float('inf'))])

    def test_without_the_setting_nothing_is_dropped(self):
        self.assertEqual(under_other_headings(Page(1, 842, 595, line('収入', 80)), None, None), ([], set()))


if __name__ == '__main__':
    unittest.main()
