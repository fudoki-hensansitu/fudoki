import unittest

from ingestion.generic.observe import Page, Rule, Word
from ingestion.generic.patterns.layout.purpose_section import section


def table(top: float, rows: list[tuple[str, str]]) -> tuple[list[Word], list[Rule]]:
    """A ruled table at `top`: a header row and one row per (name, amount), columns at x 10・100・200."""
    bottom = top + 20 * (len(rows) + 1)
    rules = [Rule(x, top, x, bottom) for x in (10, 100, 200)]
    rules += [Rule(10, top + 20 * i, 200, top + 20 * i) for i in range(len(rows) + 2)]
    words = [Word('科目', 20, top + 5, 40, top + 14), Word('決算額', 120, top + 5, 150, top + 14)]
    for i, (name, amount) in enumerate(rows, start=1):
        y = top + 20 * i + 5
        words += [Word(name, 20, y, 60, y + 9), Word(amount, 150, y, 190, y + 9)]
    return words, rules


class PurposeSectionTest(unittest.TestCase):
    def page(self):
        revenue = table(40, [('村税', '342,595')])
        purpose = table(140, [('議会費', '43,448'), ('総務費', '835,912')])
        nature = table(260, [('人件費', '645,787')])
        titles = [Word('◎', 10, 25, 18, 34), Word('歳', 20, 25, 28, 34), Word('入', 30, 25, 38, 34),
                  Word('◎', 10, 125, 18, 134), Word('歳', 20, 125, 28, 134), Word('出', 30, 125, 38, 134),
                  Word('（目', 40, 125, 56, 134), Word('的', 58, 125, 66, 134), Word('別）', 68, 125, 84, 134),
                  Word('◎', 10, 245, 18, 254), Word('歳出（性質別）', 20, 245, 84, 254)]
        words = titles + revenue[0] + purpose[0] + nature[0]
        return Page(2, 300, 400, words, revenue[1] + purpose[1] + nature[1])

    def test_only_the_table_under_the_purpose_title_is_kept(self):
        cut = section(self.page())
        self.assertEqual({w.text for w in cut.words} - {'科目', '決算額'}, {'議会費', '43,448', '総務費', '835,912'})
        self.assertTrue(all(140 <= min(r.y0, r.y1) and max(r.y0, r.y1) <= 200 for r in cut.rules))

    def test_a_page_without_the_title_stops(self):
        page = self.page()
        page.words = [w for w in page.words if w.text not in ('（目', '的', '別）')]
        with self.assertRaises(ValueError):
            section(page)


if __name__ == '__main__':
    unittest.main()
