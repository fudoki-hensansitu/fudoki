"""A budget statement read by the layered builder whose explanation marks its reckonings with a unit and wraps its
counts (渋谷区の予算説明書).

The spread prints 款・項・目 on the left page and the 節 and the 説明 on the right; the layered workflow of the profile
(`workflow`: layout, headers, hierarchy, the same settings a `generic_text` conversion holds) reads it. Two things of
the 説明 it cannot read as declared settings, and this reading does them around the shared builder:

- A reckoning prints its unit after the amount (`区商連補助 7,000 千円`, `ｱ 就学後70歳未満148,284 千円`). The unit
  word left after an amount on its line (`unit_words`) is taken off the observed words before the layout is read, as
  the builder takes off a `円`; the amount stays the line's last run. The unit carries no digit, so the coverage of the
  printed digits is not changed by it.
- A count wraps to a line of its own (`議会運営委員会（閉会中）` / `22 回`). The builder reads `22 回` as an item
  numbered 22 with no amount. A leaf of the 説明 with no amount whose number is the count and whose name is a counter
  of the profile (`quantity.counters`) is no item: it is taken out of the node table, and its digits are a coverage
  exclusion of kind 数量表 at the place it was printed.
"""
from __future__ import annotations

import re
from pathlib import Path

from ingestion.fiscal.manifest import sha_file
from ingestion.generic import mixed
from ingestion.generic.convert import (Table, canonical_headings, excluded_regions, fine_sections, observation_cache,
                                       scope_pages, split_notes, write_files)
from ingestion.generic.layout import normalize
from ingestion.generic.observe import Page, observe
from ingestion.generic.reading import Reading
from ingestion.generic.repair import repair
from ingestion.generic.runtime import page_titles
from ingestion.generic.units import check as check_units
from ingestion.generic.workflow import build_reading, effective_settings, read_layout

LINE = 2.5    # points: words of one printed line
REACH = 12.0  # points: how far after an amount its unit word may stand
JOIN = 1.0    # points: words of one unit abut
ENDS_IN_DIGIT = re.compile(r'[0-9０-９]$')


def without_units(page: Page, units: frozenset[str]) -> tuple[Page, int]:
    """The page without the unit words printed after an amount on their line, and how many were taken off.

    The text layer may cut the unit into abutting words (`千` `円`): the words that spell it together go."""
    gone: set[int] = set()
    dropped = 0
    for index, word in enumerate(page.words):
        if not any(abs(other.y0 - word.y0) <= LINE and 0 <= word.x0 - other.x1 <= REACH
                   and ENDS_IN_DIGIT.search(other.text.strip()) for other in page.words if other is not word):
            continue
        run, spelled = [index], normalize(word.text)
        while spelled not in units and any(unit.startswith(spelled) for unit in units):
            following = [i for i, other in enumerate(page.words)
                         if abs(other.y0 - word.y0) <= LINE and 0 <= other.x0 - page.words[run[-1]].x1 <= JOIN]
            if not following:
                break
            run.append(min(following, key=lambda i: page.words[i].x0))
            spelled += normalize(page.words[run[-1]].text)
        if spelled in units:
            gone.update(run)
            dropped += 1
    kept = [w for i, w in enumerate(page.words) if i not in gone]
    return Page(page.number, page.width, page.height, kept, page.rules), dropped


class Reader(Reading):
    REQUIRED_RULES = []

    def __init__(self, profile, workflow):
        super().__init__(profile, workflow)
        self.profile = profile
        self.units = frozenset(normalize(u) for u in profile['unit_words'])
        self.quantity_axis = profile['quantity']['axis']
        self.counters = frozenset(normalize(c) for c in profile['quantity']['counters'])

    def convert(self, inputs, destination, options):
        if len(inputs) != 1:
            raise ValueError('One original makes one table')
        source = inputs[0]
        if source.get('format') != 'pdf' or source.get('pdf_type') != 'text':
            raise ValueError('Expected a text PDF')
        if sha_file(source['path']) != source['sha256']:
            raise ValueError('Original SHA differs')
        inner = {'account': options['account'], 'table_id': options['table_id'], 'workflow': self.profile['workflow']}
        table, dropped = self.build_table(source, inner)
        removed = self.take_out_counts(table)
        result = write_files(Path(destination), options['table_id'], table)
        result[options['table_id']]['notes'] += [
            f'説明の額の後ろに印字された単位の語（{"・".join(sorted(self.units))}）{dropped} 語を、額の一部・名前の一部とせずに外して読んだ。',
            f'数量だけを折り返した説明の行（「22 回」のような数と助数詞）{removed} 件を項目にせず、数量表として網羅の検査から外した。',
        ]
        return result

    def build_table(self, source: dict, options: dict) -> tuple[Table, int]:
        """`ingestion.generic.convert.build_table` for a text PDF, with the unit words taken off the observed pages."""
        account = options['account']
        pages = scope_pages(source, account)
        if mixed.numbers(source, pages):
            raise ValueError('This reading reads text pages only')
        layout = effective_settings(source, options, text_pdf=True)
        header = layout.get('header')
        pdf = Path(source['path'])
        printed = observe(pdf, pages, observation_cache(source, pages), (layout.get('text_layer') or {}).get('character_map'))
        cleaned = [without_units(page, self.units) for page in printed]
        printed = [page for page, _ in cleaned]
        dropped = sum(count for _, count in cleaned)
        unrepaired = [Page(p.number, p.width, p.height, list(p.words), p.rules) for p in printed]
        observed, report = repair(pdf, printed, frozenset(layout.get('repairs', ())), False, None)
        direction = source.get('direction')
        titles = page_titles(unrepaired) if direction else {}
        if direction:
            report.skipped_pages = [n for n, title in titles.items() if title not in (None, direction)]
            observed = [p for p in observed if p.number not in report.skipped_pages]
        logicals = read_layout(observed, columns=layout.get('columns'), spread=layout.get('spread'), header=header,
                               split_text=False, ocr_pages=frozenset())
        built, choice = build_reading(logicals, source['target']['document_kind'], None, layout.get('breakdown'),
                                      layout.get('codes') == 'right', options['workflow'],
                                      staircase=bool((header or {}).get('staircase')))
        report.pattern = choice
        unit = check_units(built, source['target']['document_kind'], account, False)
        if unit['stopped']:
            raise ValueError(f'Unit check failed: {unit}')
        report.unit = unit
        kept, nodes, amounts, unresolved, codes = split_notes(built)
        all_nodes = [*built.nodes, *nodes]
        all_amounts, headings = canonical_headings([*kept, *amounts], all_nodes, source['target']['document_kind'], header)
        fine_sections(all_nodes)
        plain = [name for hints in (layout.get('breakdown') or {}).values() for name in hints.get('plain_names', ())]
        return Table(all_nodes, all_amounts, unresolved, excluded_regions(built, logicals, codes, observed),
                     built, report, observed, logicals, headings, plain, []), dropped

    def take_out_counts(self, table: Table) -> int:
        """Take the count lines out of the node table; their digits become 数量表 exclusions where they are printed."""
        with_amount = {a['node_key'] for a in table.amounts}
        parents = {n['parent_node_key'] for n in table.nodes}
        counts = [n for n in table.nodes
                  if n['axis_header'] == self.quantity_axis and n['node_key'] not in with_amount
                  and n['node_key'] not in parents and (n['code_text'] or '').isdigit()
                  and normalize(n['name_text'] or '') in self.counters]
        gone = {n['node_key'] for n in counts}
        table.nodes[:] = [n for n in table.nodes if n['node_key'] not in gone]
        table.excluded.extend({'kind': '数量表', 'reason': '説明の数量の行（数と助数詞だけを次の行に折り返した「22 回」など）。金額ではない。',
                               'page': n['physical_page'], 'bbox': [n['x0'], n['y0'], n['x1'], n['y1']]} for n in counts)
        return len(counts)
