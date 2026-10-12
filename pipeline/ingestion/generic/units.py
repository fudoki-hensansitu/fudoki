"""The unit of printed amounts, decided by one shared rule (no per-jurisdiction declaration).

1. A unit printed on the page: 単位：円／千円／百万円 near the table, the mark
   printed at the top of an amount column (円), or in its heading (金額(円)).
   A page without one carries the unit of the page before it.
2. Otherwise the default of the document kind: a settlement (決算) prints
   円, a budget (当初・補正) prints 千円.
3. Checks (one place, `check`): the sum of the 款 (each 款 printed in both a summary
   and the detail counted once) equals the printed 歳出合計,
   and, for a general account, the total has the digits the unit implies
   (DIGITS assumes a general account; small special accounts print less).
   The converter entry (`build.run_with_repairs`) stops on a failure; the
   all-tables measurement records it instead. (A per-capita check waits for a
   population source.)
"""
from __future__ import annotations

import re

from ingestion.generic.layout import UNIT as PRINTED, Band, Logical, normalize  # PRINTED: read while laying out pages

COLUMN_MARK = re.compile(r'[(（](百万円|千円|円)[)）]')
DEFAULTS = {'settlement': '円', 'initial': '千円', 'supplementary': '千円'}
MULTIPLIER = {'円': 1, '千円': 1_000, '百万円': 1_000_000}
# Printed digits of an expenditure total: a settlement in 円 prints 億〜兆
# (10^8 up to below 10^13), a budget in 千円 prints 十万〜十億 (10^5 up to below 10^10).
DIGITS = {'settlement': (10 ** 8, 10 ** 13), 'initial': (10 ** 5, 10 ** 10), 'supplementary': (10 ** 5, 10 ** 10)}


def column_mark(band: Band) -> str | None:
    found = COLUMN_MARK.search(''.join(band.header))
    if found:
        return found.group(1)
    top = sorted(band.words, key=lambda w: w.y0)[:1]
    return top[0].text if top and top[0].text in MULTIPLIER else None


def resolve(logicals: list[Logical], document_kind: str) -> dict:
    """Fill every logical page's unit; return how each was decided."""
    sources = {'printed': 0, 'column mark': 0, 'carried': 0, 'default': 0}
    carried = None
    for logical in logicals:
        if logical.unit:
            sources['printed'] += 1
        else:
            mark = next((m for band in logical.bands if band.kind == 'amount' for m in [column_mark(band)] if m), None)
            if mark:
                logical.unit = mark
                sources['column mark'] += 1
            elif carried:
                logical.unit = carried
                sources['carried'] += 1
            else:
                logical.unit = DEFAULTS.get(document_kind)
                sources['default'] += 1
        carried = logical.unit
    return sources


def _phase(document_kind: str) -> str:
    return 'executed' if document_kind == 'settlement' else 'approved'


def kan_entries(nodes: list[dict], amounts: list[dict], document_kind: str) -> list[tuple[dict, int, str | None]]:
    """Every 款 amount of the phase the document reports, as (root node, value, unit), each
    printing counted once. Shared by `check` and `general_total`.

    A summary table (歳入歳出決算書) and the detail can print the same 款 twice. The roots are cut
    into runs in document order (a run ends where the 款 number stops increasing). A run that
    repeats an earlier run exactly, the same 款 (number and name) in the same order with the same
    amounts and units (a 款 of 0 may be left out of either), is that printing again and is not
    counted. Anything less (a different unit, a 款 with an amount missing or added, an unnamed
    款) counts in full, so a doubtful sum stops the build.
    """
    from ingestion.generic.build import dictionary_header
    from ingestion.lib.node_tables import amount_phase
    from shared.amount import number
    phase = _phase(document_kind)
    first: dict[str, tuple[int, str | None]] = {}
    for amount in amounts:
        if amount['node_key'] not in first and number(amount['amount_text']) is not None and \
                amount_phase(dictionary_header(amount['header_path'], document_kind), document_kind, '科目', '款') == phase:
            first[amount['node_key']] = (number(amount['amount_text']), amount.get('unit_text'))
    roots = [n for n in nodes if n['axis_header'] == '科目' and n['parent_node_key'] is None and n['node_key'] in first]
    runs: list[list[dict]] = []
    for node in roots:
        code = normalize(node.get('code_text') or '')
        previous = normalize(runs[-1][-1].get('code_text') or '') if runs else ''
        if not runs or not (code.isdigit() and previous.isdigit() and int(code) > int(previous)):
            runs.append([])
        runs[-1].append(node)
    # A 款 of 0 adds nothing to the sum; the detail may leave it out (利島村の災害復旧費).
    signature = lambda run: tuple((normalize(n.get('code_text') or ''), normalize(n.get('name_text') or ''), *first[n['node_key']])
                                  for n in run if first[n['node_key']][0] != 0)
    seen, entries = set(), []
    for run in runs:
        key = signature(run)
        named = all(code and name for code, name, *_ in key)
        if named and key in seen:
            continue
        seen.add(key)
        entries += [(n, *first[n['node_key']]) for n in run]
    return entries


def general_total(nodes: list[dict], amounts: list[dict], document_kind: str) -> int | None:
    """The expenditure total in yen: the executed (決算) or approved (予算) amounts of every 款."""
    entries = [(value, unit) for _, value, unit in kan_entries(nodes, amounts, document_kind) if unit]
    return sum(value * MULTIPLIER.get(unit, 1) for value, unit in entries) if entries else None


def check(built, document_kind: str, account: str | None = None) -> dict:
    """款 sum = printed 歳出合計 (in the phase the document reports), and a general account's digits fit the unit."""
    from ingestion.generic.build import dictionary_header
    from ingestion.lib.node_tables import amount_phase
    from shared.amount import number
    phase = _phase(document_kind)
    printed = [n for n in built.notes if n.get('kind') == 'total amount' and n.get('header')
               and amount_phase(dictionary_header(n['header'], document_kind), document_kind, '科目', '款') == phase]
    entries = kan_entries(built.nodes, built.amounts, document_kind)
    units = {unit for _, _, unit in entries}
    # One unit: compare the printed numbers. Mixed units: compare in yen (an unknown unit fails).
    raw_sum = sum(value for _, value, _ in entries) if len(units) <= 1 else \
        sum(value * MULTIPLIER[unit] if unit in MULTIPLIER else 0 for _, value, unit in entries)
    result = {'phase': phase, 'kan_sum': raw_sum, 'printed_total': None, 'sum_matches': None, 'digits': DIGITS.get(document_kind),
              'digits_ok': None, 'stopped': False}
    if printed:
        # The grand total: a row named 合計 (歳出合計) if any, else the largest printed total
        # (other 計 rows are subtotals).
        named = [n for n in printed if '合計' in (n.get('label') or '')]
        chosen = named[-1] if named else max(printed, key=lambda n: abs(number(n['text']) or 0))
        total = number(chosen['text'])
        result['total_label'] = chosen.get('label')
        result['printed_total'] = total
        if len(units) <= 1:
            result['sum_matches'] = total == raw_sum
        else:
            result['sum_matches'] = chosen.get('unit') in MULTIPLIER and None not in units and \
                total is not None and total * MULTIPLIER[chosen['unit']] == raw_sum
        low, high = DIGITS.get(document_kind, (0, float('inf')))
        if account == '一般会計':
            result['digits_ok'] = total is not None and low <= abs(total) < high
        result['stopped'] = not result['sum_matches'] or result['digits_ok'] is False
    elif raw_sum and account == '一般会計':
        # No printed total in the pages read: only the digits of the 款 sum can be checked.
        low, high = DIGITS.get(document_kind, (0, float('inf')))
        result['digits_ok'] = low <= abs(raw_sum) < high
        result['stopped'] = not result['digits_ok']
    return result
