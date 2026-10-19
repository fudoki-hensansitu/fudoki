"""Unit check of a finished PDF node table: the 款 sum against the printed 歳出合計, and the digits of the unit.

A check module (ADR 0027): it only decides pass/fail and never builds or writes a table. Tree
sums cannot see a unit mistake (every parent and child is wrong by the same 1,000), so this is the
check that stops a 千円 table read as 円. The rule is the generic builder's own
(`ingestion.generic.units.check`), applied to any converter's table:

- 款 are the roots whose level is 款, whatever the converter calls the axis (科目, 款項, 款項目);
- the printed total comes from the converter's digit-coverage scope (the printed words of the pages it
  read): the 歳出合計 row, its numbers cut into the amount columns. A table with no scope (a scan PDF, a
  saved table) or no such row has none, and only the digits of the unit are checked, as the generic
  builder does when a page prints no total;
- one volume of an account printed in several (`partial`) has its unit mismatch reported.

Ordinary settlement expenditure statements also pass the independent subject-presence check, even without
a printed total or for a partial volume. A declared public-enterprise form keeps the existing
tree, coverage and unit checks but is outside that ordinary executed-subject check.

``status`` tells what was established: ``matched`` (款 sum = printed total), ``digits`` (the digits of a
general account's total fit the unit), ``partial`` (a volume: reported only), ``unchecked`` (a special
account or enterprise form with no comparable printed total) and ``stopped``.
"""
from __future__ import annotations

from collections import Counter, defaultdict
import json
from pathlib import Path
import re
from types import SimpleNamespace

from ingestion.generic.build import dictionary_header
from ingestion.generic.tree import STACKED_KIND
from ingestion.generic.units import _phase, check as check_units
from ingestion.fiscal.subject_checks import check_subject
from ingestion.lib.coverage_checks import TOTAL_LABELS
from ingestion.lib.node_tables import _coverage_word, _word_key, amount_phase
from shared.amount import number

AMOUNT_RUN = re.compile(r'[△▲\-－―—]?(?:0|[1-9][0-9]{0,2}(?:,[0-9]{3})+|[0-9]+)')
JOIN_GAP = 1.0   # points: fragments of one printed number abut; two columns are further apart (3 points in 131172)
BASELINE = 2.0   # points: words of one printed line
SPREAD_BASELINE = 4.0  # points: the same row on the other page of a spread, printed a little off
ALIGN = 2.0      # points: right edges of two numbers printed in one column
NUMERIC = re.compile(r'[0-9,.△▲\-－―—]*')


def printed_totals(scope: dict, nodes: list[dict], amounts: list[dict]) -> list[dict]:
    """The numbers of every 歳出合計 row in a coverage scope, as `total amount` notes.

    A number joins the word fragments it was cut into (a text layer may split `4,753,793,797` into
    `4`, `,753,793,7`, `97`). Its column is found from the table itself, not from the converter's
    declared column geometry (which may be one box for a whole group of columns): the 款 amounts
    printed on the same page with the same right edge (on every page's, when its own page prints no 款).
    A number that no 款 amount aligns with (a total printed on the other page of a spread, a column of no
    款) has no heading and is left out, so the check compares only what it can place.
    """
    roots = {node['node_key'] for node in nodes if node['parent_node_key'] is None and node.get('level_header') == '款'}
    cells: dict[int, list[tuple[float, str, str | None]]] = defaultdict(list)
    for amount in amounts:
        if amount['node_key'] in roots and amount.get('physical_page') is not None and amount.get('x1') is not None \
                and number(amount['amount_text']) is not None:
            cells[amount['physical_page']].append((amount['x1'], amount['header_path'], amount.get('unit_text')))
    if not cells:
        return []
    lines: dict[tuple, list] = {}
    anchor = None
    for page, box, text in sorted((_coverage_word(w) for w in scope.get('words', ())),
                                  key=lambda w: (w[0] if isinstance(w[0], int) else 0, w[1][1], w[1][0])):
        if anchor is None or page != anchor[0] or box[1] - anchor[1] > BASELINE:
            anchor = (page, box[1])
        lines.setdefault(anchor, []).append((box, _word_key(text)))
    for line in lines.values():
        line.sort(key=lambda item: item[0][0])
    found = []
    for (page, top), line in lines.items():
        if not any(label in ''.join(text for _, text in line) for label in TOTAL_LABELS):
            continue
        # On a spread the label is printed on the left page and the amounts go on across the right page,
        # on the same baseline, with nothing but numbers there (and the kind word a stacked carry-over cell
        # prints above its amount: `37,218,383,186 継続費逓次繰越 1,352,313,814`).
        rows = [(page, line)]
        for (other, other_top), other_line in lines.items():
            words = ''.join(text for _, text in other_line if not NUMERIC.fullmatch(text))  # `継続` `費逓次繰越`
            if other == page + 1 and abs(other_top - top) <= SPREAD_BASELINE \
                    and any(NUMERIC.fullmatch(text) for _, text in other_line) \
                    and (not words or STACKED_KIND.fullmatch(words)):
                rows.append((other, other_line))
        for row_page, row in rows:
            runs: list[list] = []
            closed = True
            for part in row:
                if not NUMERIC.fullmatch(part[1]):
                    closed = True  # a name or a heading between numbers ends the number before it
                elif not closed and part[0][0] - runs[-1][-1][0][2] <= JOIN_GAP:
                    runs[-1].append(part)
                else:
                    runs.append([part])
                    closed = False
            for run in runs:
                text = ''.join(item[1] for item in run)
                right = max(box[2] for box, _ in run)
                if not AMOUNT_RUN.fullmatch(text) or number(text) is None:
                    continue
                # The columns of the number's own page first; when that page prints no 款, or none of its
                # 款 lines up (a total on a page of its own), every page's columns are candidates. The
                # number is placed only when they agree on one heading.
                placed = set()
                for candidates in (cells.get(row_page, ()), [cell for each in cells.values() for cell in each]):
                    placed = {(header, unit) for x1, header, unit in candidates if abs(x1 - right) <= ALIGN}
                    if len({header for header, _ in placed}) == 1:
                        break
                if len({header for header, _ in placed}) != 1:
                    continue
                header, unit = next(iter(placed))
                found.append({'kind': 'total amount', 'page': row_page, 'text': text, 'header': header, 'unit': unit,
                              'label': '歳出合計', 'box': [min(b[0] for b, _ in run), min(b[1] for b, _ in run),
                                                         right, max(b[3] for b, _ in run)]})
    return found


def check_table(nodes: list[dict], amounts: list[dict], *, document_kind: str, account: str | None,
                partial: bool = False, scope: dict | None = None, statement_kind: str = 'ordinary',
                direction: str = 'expenditure') -> dict:
    """The generic builder's unit check on a finished table, plus a ``status`` and where the total came from."""
    # The subject axis is named by the converter (科目, 款項, 款項目); the check reads the 款 roots.
    shaped = [{**node, 'axis_header': '科目'} if node['parent_node_key'] is None and node.get('level_header') == '款'
              else node for node in nodes]
    notes = printed_totals(scope, shaped, amounts) if scope else []
    # Two different totals of the phase the document reports (a second table with its own 歳出合計 row on the
    # pages read): which one is the account's is not decided here, so none is compared.
    phase = _phase(document_kind)
    ofphase = [note for note in notes if amount_phase(dictionary_header(note['header'], document_kind),
                                                       document_kind, '科目', '款') == phase]
    ambiguous = len({note['text'] for note in ofphase}) > 1
    if ambiguous:
        notes = [note for note in notes if note not in ofphase]
    result = check_units(SimpleNamespace(nodes=shaped, amounts=amounts, notes=notes), document_kind, account, partial)
    result['subject_check'] = check_subject(nodes, amounts, document_kind, statement_kind, direction)
    result['stopped'] = result['stopped'] or not result['subject_check']['passed']
    result['printed_totals'] = len(notes)
    result['ambiguous_totals'] = ambiguous
    if result['stopped']:
        status = 'stopped'
    elif partial:
        status = 'partial'
    elif result.get('printed_total') is not None and result.get('sum_matches'):
        status = 'matched'
    elif result.get('digits_ok'):
        status = 'digits'
    else:
        status = 'unchecked'
    result['status'] = status
    return result


def describe(result: dict) -> str:
    """One line for a stop: what was compared and what disagreed."""
    parts = [f'款の和 {result["kan_sum"]:,}']
    if result.get('printed_total') is not None:
        parts.append(f'印字の{result.get("total_label") or "合計"} {result["printed_total"]:,}')
    if result.get('digits_ok') is False:
        low, high = result['digits']
        parts.append(f'桁が単位に合わない（{low:,}以上{high:,}未満のはず）')
    if result.get('conflicts'):
        parts.append(f'款の金額が二通りに印字されている: {len(result["conflicts"])}件')
    subject = result.get('subject_check', {})
    if subject.get('applicable') and not subject['passed']:
        if not subject['kan']:
            parts.append('款の科目軸がない')
        elif not subject['executed_kan']:
            parts.append('款の支出済額がない')
        if subject['moku'] and subject['executed_moku'] * 2 <= subject['moku']:
            parts.append(f'目の支出済額が過半に満たない（{subject["executed_moku"]}/{subject["moku"]}）')
    return '、'.join(parts)


def read_scope(sidecar: Path) -> dict | None:
    return json.loads(sidecar.read_text()) if sidecar.is_file() else None


def find_scope(directory: Path | None, table_id: str, suffix: str = '.coverage.json') -> dict | None:
    """The coverage scope of one table under a candidate directory; two of one name would be ambiguous."""
    found = sorted(directory.rglob(table_id + suffix)) if directory else []
    if len(found) > 1:
        raise ValueError(f'Several coverage scopes for {table_id}: {[str(path) for path in found]}')
    return read_scope(found[0]) if found else None


def summarize(results: dict[str, dict]) -> dict[str, int]:
    return dict(Counter(item['status'] for item in results.values()))
