"""Declared hints must preserve amounts and apply only to their document and axis."""
from copy import deepcopy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import jsonschema

from ingestion.fiscal import manifest
from ingestion.generic.layout import Band, Glyph, Logical
from ingestion.generic.layout_settings import load, validator
from ingestion.generic.tree import Group, Item, apply_layout, build
from shared.amount import number


class LayoutHintsTest(unittest.TestCase):
    def setUp(self):
        band = Band(0, 200, 1, ('備考',), [0, 100], 0, 100, kind='label')
        self.group = Group([band], '備考', False)

    def test_column_role_and_split_axis_apply_to_text_pages_too(self):
        from ingestion.generic.layout import logical_pages
        from ingestion.generic.observe import Page, Rule, Word
        from ingestion.generic.tree import groups
        rules = [Rule(x, 10, x, 100) for x in (0, 40, 80)] + [Rule(0, y, 80, y) for y in (10, 30, 100)]
        page = Page(1, 100, 120, [Word('区分', 5, 15, 25, 25), Word('事故繰越', 45, 15, 75, 25),
                                Word('1報酬', 5, 40, 25, 50), Word('C', 50, 40, 60, 50)], rules)
        plain = logical_pages([page])[0]
        self.assertEqual([b.kind for b in plain.bands], ['label', 'label'])
        configured = logical_pages([page], columns={'区分': {'axis_header': '節'}, '事故繰越': {'kind': 'amount'}})[0]
        self.assertEqual([b.kind for b in configured.bands], ['label', 'amount'])
        self.assertEqual(groups(configured)[0].axis, '節')
        validator().validate({'schema_version': 1, 'columns': {'事故繰越': {'kind': 'amount'}}})

    def item(self, raw, code, name, x, y, amount=None):
        glyph = Glyph(raw, x, y, x + len(raw) * 9, y + 9, 1, 0)
        item = Item(self.group, 1, [[glyph]], code, name, x)
        if amount is not None:
            item.amounts = [('備考', [Glyph(amount, 150, y, 180, y + 9, 1, 0)])]
        return item

    def test_last_line_amount_wraps_after_a_fused_code_and_leaves_next_paid_item(self):
        first = self.item('1.特定給付', '1', '特定給付', 80, 10)
        last = self.item('費', None, '費', 89, 23, '100')
        other = self.item('給付事務', None, '給付事務', 89, 36, '100')
        result = apply_layout([first, last, other], {'wrap': 'amount_on_last_line'}, set())
        self.assertEqual([item.name for item in result], ['特定給付費', '給付事務'])
        self.assertEqual([run[0].text for item in result for _, run in item.amounts], ['100', '100'])
        self.assertEqual((result[0].y0, result[0].y1, result[0].indent), (10, 32, 89))

    def test_column_money_stops_wrap_and_explanation_exclusion(self):
        first = self.item('1.給付費', '1', '給付費', 80, 10)
        next_item = self.item('給付事務', None, '給付事務', 89, 23, '100')
        self.assertEqual(len(apply_layout([first, next_item], {'wrap': 'amount_on_last_line'}, {id(first)})), 2)
        paragraph = self.item('□説明', None, '説明', 80, 10)
        for owners in ({id(paragraph)}, set()):
            if not owners:
                paragraph.amounts = [('備考', [Glyph('0', 150, 10, 155, 19, 1, 0)])]
            with self.assertRaisesRegex(ValueError, 'explanation carries money'):
                apply_layout([paragraph], {'marks': {'□': '説明'}}, owners)

    def test_configured_note_wrap_keeps_money_and_does_not_extend_other_notes(self):
        note = self.item('○同目へ流', None, '同目へ流', 80, 10)
        last = self.item('用', None, '用', 80, 23, '20,000')
        result = apply_layout([note, last], {'notes': ['○同目']}, set())
        self.assertEqual([(item.name, item.role) for item in result], [('同目へ流用', 'annotation')])
        self.assertEqual(result[0].amounts[0][1][0].text, '20,000')
        other = self.item('別注記', None, '別注記', 80, 10)
        other.role = 'annotation'
        self.assertEqual(len(apply_layout([other, last], {'notes': ['○同目']}, set())), 2)

    def test_marks_keep_existing_annotation_and_use_numbering_shapes(self):
        note = self.item('□説明へ流用', None, '説明へ流用', 80, 10, '10,000')
        note.role = 'annotation'
        self.assertEqual(apply_layout([note], {'marks': {'□': '説明'}}, set())[0].role, 'annotation')
        numbered = self.item('12.事業', '12', '事業', 80, 10, '100')
        counter = self.item('12歳健診', None, '12歳健診', 80, 30, '100')
        result = apply_layout([numbered, counter], {'marks': {'1': 2}}, set())
        self.assertEqual([item.level for item in result], [1, None])

    def test_marker_priority_does_not_depend_on_json_key_order(self):
        settings = [{'marks': {'○': 1, '○事業': 2}}, {'marks': {'○事業': 2, '○': 1}}]
        self.assertEqual(manifest.canonical(settings[0]), manifest.canonical(settings[1]))
        levels = []
        for hints in settings:
            item = self.item('○事業費', None, '事業費', 80, 10, '100')
            levels.append(apply_layout([item], hints, set())[0].level)
        self.assertEqual(levels, [1, 1])

    def test_fitted_name_moves_to_declared_frame_without_changing_money_or_source_box(self):
        long = self.item('審議会委員報酬', None, '審議会委員報酬', 80, 10, '100')
        short = self.item('評価員報酬', None, '評価員報酬', 89, 30, '100')
        before = deepcopy([(item.lines, item.amounts) for item in (long, short)])
        result = apply_layout([long, short], {'fitted_names': {'chars': 5, 'overflow_left_chars': 1}}, set())
        self.assertEqual([item.indent for item in result], [89, 89])
        self.assertEqual([(item.lines, item.amounts) for item in result], before)

    def test_fitted_frame_is_applied_once_after_wrap_finishes(self):
        for name in ('特定給付', '特定給付事業費'):
            with self.subTest(first_name=name):
                first = self.item('1.' + name, '1', name, 80, 10)
                last = self.item('補助費', None, '補助費', 89, 23, '100')
                result = apply_layout([first, last], {'wrap': 'amount_on_last_line',
                                                    'fitted_names': {'chars': 5, 'overflow_left_chars': 1}}, set())
                self.assertEqual([(item.name, item.indent) for item in result], [(name + '補助費', 98)])
                self.assertEqual(result[0].amounts[0][1][0].text, '100')

    def test_configured_note_with_separate_column_money_stops_real_build(self):
        subject = Band(0, 40, 1, ('款',), [20, 100], 20, 100, kind='label')
        remarks = Band(40, 140, 1, ('備考',), [20, 100], 20, 100, kind='label')
        money = Band(140, 200, 1, ('支出済額',), [20, 100], 20, 100, kind='amount')
        subject.words = [Glyph('1 民生費', 5, 30, 35, 39, 1, 0)]
        remarks.words = [Glyph('※指定注記', 50, 50, 110, 59, 1, 0)]
        money.words = [Glyph('100', 160, 50, 190, 59, 1, 0)]
        logicals = [Logical([1], [subject, remarks, money], '円', [])]
        self.assertEqual(build(logicals).amounts[0]['amount_text'], '100')
        with self.assertRaisesRegex(ValueError, 'note carries separate-column money'):
            build(logicals, layout={'備考': {'notes': ['※指定']}})
        remarks.words = [Glyph('○同目へ流用', 50, 50, 110, 59, 1, 0)]
        with self.assertRaisesRegex(ValueError, 'note carries separate-column money'):
            build(logicals, layout={'備考': {'notes': ['○同目']}})

    def test_note_continuation_with_separate_column_money_stops_before_join(self):
        subject = Band(0, 40, 1, ('款',), [20, 100], 20, 100, kind='label')
        remarks = Band(40, 140, 1, ('備考',), [20, 100], 20, 100, kind='label')
        money = Band(140, 200, 1, ('支出済額',), [20, 100], 20, 100, kind='amount')
        subject.words = [Glyph('1 民生費', 5, 30, 35, 39, 1, 0)]
        remarks.words = [Glyph('※指定注記', 50, 50, 110, 59, 1, 0), Glyph('続き', 50, 63, 75, 72, 1, 0)]
        money.words = [Glyph('100', 160, 63, 190, 72, 1, 0)]
        logicals = [Logical([1], [subject, remarks, money], '円', [])]
        self.assertEqual(build(logicals).amounts[0]['amount_text'], '100')
        with self.assertRaisesRegex(ValueError, 'note carries separate-column money'):
            build(logicals, layout={'備考': {'notes': ['※指定']}})

    def test_absent_hints_do_not_change_items(self):
        items = [self.item('1.事業', '1', '事業', 80, 10), self.item('費', None, '費', 89, 23, '100')]
        before = deepcopy(items)
        self.assertEqual(apply_layout(items, {}, set()), before)

    def test_bracket_amounts_preserve_printed_text_and_boxes_only_on_configured_axis(self):
        subject = Band(0, 40, 1, ('款',), [20, 100], 20, 100, kind='label')
        remarks = Band(40, 200, 1, ('備考',), [20, 100], 20, 100, kind='label')
        subject.words = [Glyph('1総務費', 5, 30, 35, 39, 1, 0)]
        remarks.words = [Glyph('1事業', 50, 30, 95, 39, 1, 0),
                         Glyph('(', 145, 30, 149, 39, 1, 0), Glyph('14,101,213)', 160, 30, 195, 39, 1, 0),
                         Glyph('2事業', 50, 50, 95, 59, 1, 0),
                         Glyph('(0)', 160, 63, 190, 72, 1, 0)]
        logicals = [Logical([1], [subject, remarks], '円', [])]
        result = build(logicals, layout={'備考': {'amount_brackets': True}})
        self.assertEqual([a['amount_text'] for a in result.amounts], ['(14,101,213)', '(0)'])
        self.assertEqual([number(a['amount_text']) for a in result.amounts], [14101213, 0])
        self.assertEqual([(a['x0'], a['x1'], a['physical_page']) for a in result.amounts], [(145, 195, 1), (160, 190, 1)])
        self.assertEqual([n['name_text'] for n in result.nodes], ['総務費', '事業', '事業'])
        plain = build(logicals)
        for layout in ({'備考': {'amount_brackets': False}}, {'説明': {'amount_brackets': True}}):
            other = build(logicals, layout=layout)
            self.assertEqual((other.nodes, other.amounts), (plain.nodes, plain.amounts))
        remarks.words = [Glyph('1事業(管理課)', 50, 30, 135, 39, 1, 0), Glyph('100', 160, 30, 190, 39, 1, 0)]
        result = build(logicals, layout={'備考': {'amount_brackets': True}})
        self.assertEqual(result.nodes[-1]['name_text'], '事業(管理課)')
        self.assertEqual(result.amounts[0]['amount_text'], '100')

    def test_character_indents_keep_levels_when_the_page_frame_moves(self):
        logicals = []
        for page, shift in ((1, 0), (2, 34)):
            subject = Band(0, 40 + shift, page, ('款',), [20, 100], 20, 100, kind='label')
            remarks = Band(40 + shift, 200 + shift, page, ('備考',), [20, 100], 20, 100, kind='label')
            subject.words = [Glyph('1総務費', 5, 30, 35, 39, page, 0)]
            remarks.words = [Glyph(str(page), 50 + shift, 40, 54.5 + shift, 49, page, 0),
                             Glyph('事業', 59 + shift, 40, 86 + shift, 49, page, 0),
                             Glyph('100', 160 + shift, 40, 190 + shift, 49, page, 0),
                             Glyph('10', 59 + shift, 60, 68 + shift, 69, page, 0),
                             Glyph('需用費', 68 + shift, 60, 95 + shift, 69, page, 0),
                             Glyph('100', 160 + shift, 60, 190 + shift, 69, page, 0)]
            logicals.append(Logical([page], [subject, remarks], '円', []))
        result = build(logicals, layout={'備考': {'indent_chars': 1}})
        nodes = [n for n in result.nodes if n['axis_header'] == '備考']
        self.assertEqual([n['depth'] for n in nodes], [1, 2, 1, 2])
        self.assertEqual([n['physical_page'] for n in nodes], [1, 1, 2, 2])
        self.assertEqual([a['amount_text'] for a in result.amounts], ['100'] * 4)
        self.assertEqual(nodes[3]['parent_node_key'], nodes[2]['node_key'])

    def test_marks_apply_only_to_the_configured_axis_in_real_tree_build(self):
        subject = Band(0, 40, 1, ('款',), [20, 100], 20, 100, kind='label')
        remarks = Band(40, 200, 1, ('備考',), [20, 100], 20, 100, kind='label')
        subject.words = [Glyph('1 民生費', 5, 30, 35, 39, 1, 0)]
        remarks.words = [Glyph('○事業A', 50, 30, 100, 39, 1, 0), Glyph('100', 160, 30, 190, 39, 1, 0),
                         Glyph('○事業B', 59, 50, 110, 59, 1, 0), Glyph('100', 160, 50, 190, 59, 1, 0)]
        logicals = [Logical([1], [subject, remarks], '円', [])]
        configured = build(logicals, layout={'備考': {'marks': {'○': 1}}})
        wrong_axis = build(logicals, layout={'説明': {'marks': {'○': 1}}})
        self.assertEqual([n['depth'] for n in configured.nodes if n['axis_header'] == '備考'], [1, 1])
        self.assertEqual([n['depth'] for n in wrong_axis.nodes if n['axis_header'] == '備考'], [1, 2])
        self.assertEqual(configured.amounts, wrong_axis.amounts)

    def test_wrap_never_moves_an_inline_amount_across_subject_events(self):
        make = lambda value, x, y, width: Glyph(value, x, y, x + width, y + 9, 1, 0)
        subject = Band(0, 200, 1, ('目',), [70, 115, 170], 70, 170, kind='label')
        subject.words = [make('1第一費', 5, 80, 55), make('2第二費', 5, 121, 55)]
        remarks = Band(250, 590, 1, ('備考',), [70, 115, 170], 70, 170, kind='label')
        remarks.words = [make('1.特定給付', 300, 108, 60), make('費', 309, 121, 10),
                         make('100', 520, 121, 40)]
        logicals = [Logical([1], [subject, remarks], '円', [])]
        plain = build(logicals)
        hinted = build(logicals, layout={'備考': {'wrap': 'amount_on_last_line'}})
        self.assertEqual(hinted.nodes, plain.nodes)
        self.assertEqual(hinted.amounts, plain.amounts)
        self.assertEqual(hinted.unowned, [])
        parents = {n['node_key']: n['parent_node_key'] for n in hinted.nodes}
        names = {n['node_key']: n['name_text'] for n in hinted.nodes}
        self.assertEqual(names[parents[hinted.amounts[0]['node_key']]], '第二費')


class LayoutRegistryTest(unittest.TestCase):
    def test_settings_add_change_and_remove_stale_only_converters_that_read_them(self):
        generic = manifest.read(manifest.JURISDICTIONS / '132039/2025/settlement/expenditure.json')
        csv = manifest.read(manifest.JURISDICTIONS / '132047/2024/initial/expenditure.json')
        with tempfile.TemporaryDirectory() as tmp, patch.object(manifest, 'JURISDICTIONS', Path(tmp)):
            plain = manifest.fingerprints(generic)
            layout = manifest.manifest_path(generic['target'], generic['direction']).with_suffix('.layout.json')
            layout.parent.mkdir(parents=True)
            document = {'schema_version': 1, 'breakdown': {'備考': {'marks': {'○': 1}}}}
            layout.write_text(json.dumps(document))
            added = manifest.fingerprints(generic)
            self.assertNotEqual(plain, added)
            document['breakdown']['備考']['marks']['○'] = 2
            layout.write_text(json.dumps(document))
            self.assertNotEqual(added, manifest.fingerprints(generic))
            layout.unlink()
            self.assertEqual(plain, manifest.fingerprints(generic))
            unchanged = manifest.fingerprints(csv)
            layout = manifest.manifest_path(csv['target'], csv['direction']).with_suffix('.layout.json')
            layout.parent.mkdir(parents=True)
            layout.write_text(json.dumps(document))
            self.assertEqual(unchanged, manifest.fingerprints(csv))

    def test_adjacent_layout_is_validated_and_is_not_an_ingestion_manifest(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(manifest, 'JURISDICTIONS', Path(tmp)):
            target = {'jurisdiction': '132128', 'fiscal_year': 2025, 'document_kind': 'settlement'}
            path = manifest.manifest_path(target, 'expenditure')
            path.parent.mkdir(parents=True)
            path.write_text('{}')
            layout = path.with_suffix('.layout.json')
            self.assertIsNone(load(target, 'expenditure'))
            document = {'schema_version': 1, 'breakdown': {'備考': {'notes': ['○同目']}}}
            layout.write_text(json.dumps(document))
            self.assertEqual(load(target, 'expenditure'), document)
            self.assertEqual(manifest.paths(), [path])
            document['breakdown']['備考']['totals'] = ['計']
            layout.write_text(json.dumps(document))
            with self.assertRaises(jsonschema.ValidationError):
                load(target, 'expenditure')

    def test_schema_stops_invalid_marks_wrap_and_empty_notes(self):
        for hints in ({'marks': {'○': 0}}, {'wrap': 'always'}, {'notes': ['']},
                      {'fitted_names': {'chars': 0, 'overflow_left_chars': 1}},
                      {'indent_chars': 0}, {'indent_chars': 0.5}, {'amount_brackets': 'true'}):
            with self.subTest(hints=hints), self.assertRaises(jsonschema.ValidationError):
                validator().validate({'schema_version': 1, 'breakdown': {'備考': hints}})

    def test_spread_declares_a_gutter_inside_the_physical_page(self):
        validator().validate({'schema_version': 1, 'spread': {'gutter': .5}})
        for spread in ({}, {'gutter': 0}, {'gutter': 1}, {'gutter': 'middle'}, {'gutter': .5, 'unknown': True}):
            with self.subTest(spread=spread), self.assertRaises(jsonschema.ValidationError):
                validator().validate({'schema_version': 1, 'spread': spread})
