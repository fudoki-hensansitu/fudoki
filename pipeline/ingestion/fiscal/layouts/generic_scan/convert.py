"""Pinned scan OCR to fiscal tables through the generic node builder (no model calls)."""
from pathlib import Path

from ingestion.generic.convert import write_files
from ingestion.generic.scan import build_table


def observation_bound_corrections(options: dict) -> list[dict]:
    """The receipt lines of the name corrections bound to an observation.

    The builder notes the corrections it applies to a node (`correct_names`); a correction bound to
    an observation replaces the characters while the observation is read, so without this the
    receipt would count fewer corrections than the conversion declares."""
    return [{'kind': 'name correction', 'text': f'{rule["page"]}頁 {rule["observed_name"]}→{rule["corrected_name"]}'}
            for rule in options.get('name_corrections', ()) if 'observation_id' in rule]


def convert(inputs: list[dict], destination: Path, options: dict) -> dict:
    if len(inputs) != 1:
        raise ValueError('The generic builder converts one original per table')
    table = build_table(inputs[0], options)
    if table.built.unowned or table.unresolved:
        raise ValueError(f'Scan table has unowned amounts/rows or unresolved annotations: '
                         f'{len(table.built.unowned)}/{len(table.unresolved)}')
    table.built.notes.extend(observation_bound_corrections(options))
    return write_files(destination, options['table_id'], table)
