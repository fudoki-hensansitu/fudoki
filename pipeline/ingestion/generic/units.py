"""The unit of printed amounts, decided by one shared rule (no per-jurisdiction declaration).

1. A unit printed on the page: 単位：円／千円／百万円 near the table, the mark
   printed at the top of an amount column (円), or in its heading (金額(円)).
   A page without one carries the unit of the page before it.
2. Otherwise the default of the document kind: a settlement (決算) prints
   円, a budget (当初・補正) prints 千円.
3. A check: the general account's expenditure total divided by the population
   must fall in PER_CAPITA_RANGE; outside it the unit is wrong and the build stops.
"""
from __future__ import annotations

import re

from ingestion.generic.layout import Band, Logical

PRINTED = re.compile(r'単位\s*[:：]?\s*(百万円|千円|円)')
COLUMN_MARK = re.compile(r'[(（](百万円|千円|円)[)）]')
DEFAULTS = {'settlement': '円', 'initial': '千円', 'supplementary': '千円'}
MULTIPLIER = {'円': 1, '千円': 1_000, '百万円': 1_000_000}
# Expenditure per resident of a general account: tens of thousands to a few
# million yen (Tokyo's wards and cities print about 300,000–1,200,000).
PER_CAPITA_RANGE = (30_000, 5_000_000)


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


def per_capita(total_yen: int, population: int) -> dict:
    value = total_yen / population
    return {'per_capita_yen': round(value), 'range': PER_CAPITA_RANGE,
            'plausible': PER_CAPITA_RANGE[0] <= value <= PER_CAPITA_RANGE[1]}
