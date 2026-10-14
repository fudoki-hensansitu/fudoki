"""Rereading must distinguish a continued value from the currency row above it."""
import gzip
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from ingestion.generic.observe import Page, Rule, Word
from ingestion.generic.scan import _layout, declared_unread
from ingestion.generic.scan_recheck import amount_sources


class AmountSourceTest(unittest.TestCase):
    def test_a_value_before_the_next_named_subject_is_read_but_a_unit_is_not(self):
        columns = {'繰越': {'kind': 'amount'}}
        words = [Word('款', 5, 15, 25, 25), Word('支出済額', 45, 15, 75, 25),
                 Word('不用額', 85, 15, 115, 25), Word('比較', 125, 15, 155, 25),
                 Word('繰越', 162, 15, 178, 25), Word('1民生費', 5, 50, 35, 59),
                 Word('円', 70, 31, 75, 35), Word('円', 110, 31, 115, 35),
                 Word('円', 150, 31, 155, 35), Word('0', 170, 31, 175, 35),
                 Word('C', 170, 40, 175, 49)]
        rules = [Rule(x, 10, x, 100) for x in (0, 40, 80, 120, 160, 180)]
        rules += [Rule(0, y, 180, y) for y in (10, 30, 100)]
        logicals = _layout([Page(1, 200, 120, words, rules)], columns)
        amount = dict(node_key='unit', header_path='繰越', physical_page=1,
                      x0=170, y0=31, x1=175, y1=35)
        table = SimpleNamespace(amounts=[amount], logicals=logicals, built=SimpleNamespace(unowned=[]))
        observations = [{'id': str(i), 'kind': 'region', 'parent_id': None, 'raw_text': w.text,
                         'bbox_pdf_pt': [w.x0, w.y0, w.x1, w.y1]} for i, w in enumerate(words)]
        with TemporaryDirectory() as directory:
            path = Path(directory) / 'ocr.json.gz'
            path.write_bytes(gzip.compress(json.dumps({'pages': [{'page_number': 1,
                'regions': [{'observations': observations}]}]}).encode()))
            source = {'ocr': [{'path': path}], 'target': {}, 'direction': 'expenditure'}
            with patch('ingestion.generic.scan_recheck.load', return_value={'columns': columns}):
                found = amount_sources(table, source, [])
        self.assertEqual(list(found), [('unread:1:10', '')])
        observation = {'pages': [{'page_number': 1, 'unread_ink': [
            [170, 41, 175, 47], [20, 41, 25, 47], [170, 15, 175, 20], [170, 31, 175, 35]]}]}
        declared_unread(table.built, logicals, columns, observation)
        ink = [r for r in table.built.unowned if r['kind'] == 'unread ink in amount column']
        self.assertEqual([r['box'] for r in ink], [[170, 41, 175, 47]])
        glyph = next(g for logical in logicals for band in logical.bands for g in band.words if g.text == 'C')
        glyph.text = '。'
        declared_unread(table.built, logicals, columns)
        self.assertTrue(any(r.get('text') == '。' for r in table.built.unowned))


if __name__ == '__main__':
    unittest.main()
