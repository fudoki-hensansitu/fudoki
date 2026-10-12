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


def general_total(nodes: list[dict], amounts: list[dict], document_kind: str) -> int | None:
    """The expenditure total in yen: the executed (決算) or approved (予算) amounts of every 款."""
    from ingestion.generic.build import dictionary_header
    from ingestion.lib.node_tables import amount_phase
    from shared.amount import number
    phase = 'executed' if document_kind == 'settlement' else 'approved'
    roots = {n['node_key'] for n in nodes if n['axis_header'] == '科目' and n['parent_node_key'] is None}
    total, found = 0, False
    for amount in amounts:
        if amount['node_key'] not in roots or not amount['unit_text']:
            continue
        if amount_phase(dictionary_header(amount['header_path'], document_kind), document_kind, '科目', '款') != phase:
            continue
        value = number(amount['amount_text'])
        if value is not None:
            total += value * MULTIPLIER.get(amount['unit_text'], 1)
            found = True
    return total if found else None


def check(built, document_kind: str, account: str | None = None) -> dict:
    """款 sum = printed 歳出合計 (in the phase the document reports), and a general account's digits fit the unit."""
    from ingestion.generic.build import dictionary_header
    from ingestion.lib.node_tables import amount_phase
    from shared.amount import number
    phase = _phase(document_kind)
    printed = [n for n in built.notes if n.get('kind') == 'total amount' and n.get('header')
               and amount_phase(dictionary_header(n['header'], document_kind), document_kind, '科目', '款') == phase]
    roots = {n['node_key']: n for n in built.nodes if n['axis_header'] == '科目' and n['parent_node_key'] is None}
    # A summary table (歳入歳出決算書) and the detail print the same 款 twice: count a 款 with the
    # same code, name and amount once. A root with neither code nor name is never the same 款.
    def identity(node: dict) -> tuple:
        code, name = normalize(node.get('code_text') or ''), normalize(node.get('name_text') or '')
        return (code, name) if code or name else (node['node_key'],)
    seen = {(identity(roots[a['node_key']]), number(a['amount_text']) or 0)
            for a in built.amounts if a['node_key'] in roots
            and amount_phase(dictionary_header(a['header_path'], document_kind), document_kind, '科目', '款') == phase}
    raw_sum = sum(value for _, value in seen)
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
        result['sum_matches'] = total == raw_sum
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
