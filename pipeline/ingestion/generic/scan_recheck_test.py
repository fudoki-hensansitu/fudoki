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
from ingestion.generic.scan_recheck import MODEL, amount_sources, column_crop, recheck


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
        # a seam the re-read did not give back whole stops the conversion in any column (a name column has no tree check)
        seam = {'pages': [{'page_number': 1, 'unread_ink': [[20, 41, 25, 47]], 'unread_seams': [[20, 41, 25, 47]]}]}
        declared_unread(table.built, logicals, columns, seam)
        self.assertEqual([r['box'] for r in table.built.unowned if r['kind'] == 'unread strip seam'], [[20, 41, 25, 47]])
        self.assertEqual([r['box'] for r in table.built.unowned if r['kind'] == 'unread ink in amount column'], [[170, 41, 175, 47]])
        glyph = next(g for logical in logicals for band in logical.bands for g in band.words if g.text == 'C')
        glyph.text = '。'
        declared_unread(table.built, logicals, columns)
        self.assertTrue(any(r.get('text') == '。' for r in table.built.unowned))


class BoundedCellTest(unittest.TestCase):
    def test_the_column_crop_includes_a_separate_minus_and_stays_inside_the_row(self):
        from ingestion.lib.pdf_rules import PageRules, Rule
        box = SimpleNamespace(x0=30, y0=18, x1=45, y1=26)
        rules = PageRules(1, 100, 200, tuple(Rule(x, 0, 200, 1) for x in (0, 50, 100)),
                          tuple(Rule(y, 0, 100, 1) for y in (10, 30)))
        x0, y0, x1, y1 = column_crop(box, rules)
        self.assertLess(x0, 5)  # the minus at x=5 is outside the old word crop's margin
        self.assertTrue(10 < y0 < y1 < 30 and x1 < 50)
        with self.assertRaisesRegex(ValueError, 'both ruled edges'):
            column_crop(box, PageRules(1, 100, 200, (), ()))

    def test_only_the_selected_failing_print_can_call_the_reader(self):
        boxes = [SimpleNamespace(page=1, id=name, text='1,000', x0=x, y0=20, x1=x+20, y1=30)
                 for name, x in [('one', 10), ('two', 40)]]
        sources = {(b.id, '支出済額'): [b] for b in boxes}
        table = SimpleNamespace(nodes=[], amounts=[], built=SimpleNamespace(unowned=[]))
        document = {'target': {'document_kind': 'settlement'}}
        conversion = {'id': 'general', 'options': {}, 'ocr_inputs': [{'request': {'pages': [1]}}]}
        with patch('ingestion.generic.scan_recheck.source_input', return_value={'sha256': 'f'*64}), \
                patch('ingestion.generic.scan_recheck.pdf_rules.detect'), \
                patch('ingestion.generic.scan_recheck.build_table', return_value=table), \
                patch('ingestion.generic.scan_recheck.amount_sources', return_value=sources), \
                patch('ingestion.generic.scan_recheck.problems', return_value=1), \
                patch('ingestion.generic.scan_recheck.failing_cells', return_value=list(sources)), \
                patch('ingestion.generic.scan_recheck.read_amount', return_value=('1,000', MODEL)) as reader:
            report = recheck(document, conversion, Path('x.pdf'), cells={(1, 'two')})
            self.assertEqual(reader.call_count, 1)
            self.assertIs(reader.call_args.args[1], boxes[1])
            self.assertEqual((report['new_vlm'], report['added']), (1, []))
            reader.reset_mock()
            with self.assertRaisesRegex(ValueError, 'not bound failing amounts'):
                recheck(document, conversion, Path('x.pdf'), cells={(1, 'unit-or-unknown')})
            reader.assert_not_called()

    def test_a_bad_numeric_answer_does_not_discard_an_independent_verified_fix(self):
        nodes = [{'node_key': key, 'parent_node_key': parent, 'axis_header': '科目', 'level_header': level}
                 for key, parent, level in [('r', None, '款'), ('p', 'r', '項'), ('q', 'r', '項'),
                                            ('c', 'p', '目'), ('d', 'q', '目')]]
        boxes = {key: SimpleNamespace(page=1, id=key, text=value, x0=10, y0=20, x1=30, y1=30)
                 for key, value in [('c', '80'), ('q', '50')]}
        sources = {(key, '支出済額'): [box] for key, box in boxes.items()}

        def build(source, options, **_):
            values = dict(r='150', p='100', q='50', c='80', d='40')
            values.update({r['observation_id']: r['corrected_amount'] for r in options.get('amount_corrections', [])})
            amounts = [{'node_key': key, 'header_path': '支出済額', 'amount_text': value, 'unit_text': '円'}
                       for key, value in values.items()]
            return SimpleNamespace(nodes=nodes, amounts=amounts, built=SimpleNamespace(unowned=[]))

        def read(pdf, box, model, **_):
            return ('100' if box.id == 'c' else '60'), model

        with patch('ingestion.generic.scan_recheck.source_input', return_value={'sha256': 'f'*64}), \
                patch('ingestion.generic.scan_recheck.pdf_rules.detect'), \
                patch('ingestion.generic.scan_recheck.build_table', side_effect=build), \
                patch('ingestion.generic.scan_recheck.amount_sources', return_value=sources), \
                patch('ingestion.generic.scan_recheck.read_amount', side_effect=read):
            result = recheck({'target': {'document_kind': 'settlement'}},
                             {'id': 'general', 'options': {}, 'ocr_inputs': [{'request': {'pages': [1]}}]}, Path('x.pdf'))
        self.assertEqual((result['before'], result['after']), (2, 1))
        self.assertEqual([(r['observation_id'], r['corrected_amount']) for r in result['added']], [('c', '100')])


if __name__ == '__main__':
    unittest.main()
