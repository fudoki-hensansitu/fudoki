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


def drop_rule_ink(unowned: list[dict], declared: list[dict]) -> list[dict]:
    """The unowned records without the unread ink the conversion declares a piece of a rule (`rule_ink`).

    A vertical rule cut by a tick where a row rule meets it leaves a piece shorter than a rule, and the OCR
    acquisition keeps it as unread ink in the amount column. The declaration names the ink area (the box of the
    observation's `unread_ink`) checked on the rendered page; one that matches no such ink stops the conversion."""
    boxes = [(rule['id'], rule['page'], box) for rule in declared for box in rule['boxes']]
    used: set[int] = set()

    def ruled(issue: dict) -> bool:
        if issue['kind'] != 'unread ink in amount column':
            return False
        cx, cy = (issue['box'][0] + issue['box'][2]) / 2, (issue['box'][1] + issue['box'][3]) / 2
        hits = [i for i, (_, page, box) in enumerate(boxes)
                if page == issue['page'] and box[0] <= cx <= box[2] and box[1] <= cy <= box[3]]
        used.update(hits)
        return bool(hits)

    kept = [issue for issue in unowned if not ruled(issue)]
    if missing := sorted({boxes[i][0] for i in range(len(boxes)) if i not in used}):
        raise ValueError(f'Declared rule ink matched no unread ink: {missing}')
    return kept


def convert(inputs: list[dict], destination: Path, options: dict) -> dict:
    if len(inputs) != 1:
        raise ValueError('The generic builder converts one original per table')
    table = build_table(inputs[0], options)
    table.built.unowned[:] = drop_rule_ink(table.built.unowned, options.get('rule_ink', ()))
    if table.built.unowned or table.unresolved:
        raise ValueError(f'Scan table has unowned amounts/rows or unresolved annotations: '
                         f'{len(table.built.unowned)}/{len(table.unresolved)}')
    table.built.notes.extend(observation_bound_corrections(options))
    return write_files(destination, options['table_id'], table)
