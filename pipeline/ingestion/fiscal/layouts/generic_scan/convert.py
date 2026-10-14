"""Pinned scan OCR to fiscal tables through the generic node builder (no model calls)."""
from pathlib import Path

from ingestion.generic.convert import write_files
from ingestion.generic.scan import build_table


def convert(inputs: list[dict], destination: Path, options: dict) -> dict:
    if len(inputs) != 1:
        raise ValueError('The generic builder converts one original per table')
    table = build_table(inputs[0], options)
    if table.built.unowned or table.unresolved:
        raise ValueError(f'Scan table has unowned amounts/rows or unresolved annotations: '
                         f'{len(table.built.unowned)}/{len(table.unresolved)}')
    return write_files(destination, options['table_id'], table)
