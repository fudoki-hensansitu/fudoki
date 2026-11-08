"""施策を予算書の内訳に名前で紐付ける規則。取り違えると施策に別の目の分野が付く。"""
import unittest

from ingestion.evaluation.link_press import direct


def detail(detail_id, name, amount):
    return {'detail_id': detail_id, 'name': name, 'amount_yen': amount}


class DirectTest(unittest.TestCase):
    def test_a_unique_name_links_regardless_of_amount(self):
        found = direct({'names': ['防災区民憲章の啓発'], 'budget_yen': 1}, [detail('a', '防災区民憲章の啓発【防災課】', 5)])
        self.assertEqual(found['detail_id'], 'a')

    def test_a_repeated_name_is_settled_by_the_amount(self):
        details = [detail('a', '施設管理費', 100), detail('b', '施設管理費', 200)]
        self.assertEqual(direct({'names': ['施設管理費'], 'budget_yen': 200}, details)['detail_id'], 'b')

    def test_a_repeated_name_without_a_matching_amount_goes_to_jev_not_to_a_partial_match(self):
        details = [detail('a', '施設管理費', 100), detail('b', '施設管理費', 200), detail('c', '施設管理費等', 300)]
        self.assertIsNone(direct({'names': ['施設管理費'], 'budget_yen': 300}, details))

    def test_a_partial_name_needs_the_same_amount_and_one_row(self):
        details = [detail('a', '子ども食堂支援事業', 300), detail('b', '子ども食堂運営支援', 300)]
        self.assertIsNone(direct({'names': ['子ども食堂'], 'budget_yen': 300}, details))
        self.assertEqual(direct({'names': ['子ども食堂'], 'budget_yen': 300}, details[:1])['detail_id'], 'a')
