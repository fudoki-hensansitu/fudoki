"""Stop settlement tables missing their subject axis or printed executed amounts.

This check never supplies an amount, subject or level to the table (ADR 0027).
"""
from ingestion.generic.build import dictionary_header
from ingestion.lib.node_tables import amount_phase
from shared.amount import number


def check_subject(nodes: list[dict], amounts: list[dict], document_kind: str,
                  statement_kind: str = 'ordinary') -> dict:
    """Require 款 with executed amounts and a strict majority of printed 目 with them."""
    if document_kind != 'settlement' or statement_kind == 'public-enterprise':
        return {'passed': True, 'applicable': False, 'statement_kind': statement_kind}
    kan = [n for n in nodes if n.get('level_header') == '款' and n.get('parent_node_key') is None
           and n['axis_header'] != '注記']
    axes = {n['axis_header'] for n in kan}
    subjects = {n['node_key']: n for n in nodes if n['axis_header'] in axes}
    moku = {key for key, n in subjects.items() if n.get('level_header') == '目'
            or (n.get('level_header') is None and n['depth'] == 3)}
    printed = {a['node_key'] for a in amounts if (n := subjects.get(a['node_key']))
               and number(a['amount_text']) is not None
               and amount_phase(dictionary_header(a['header_path'], document_kind), document_kind,
                                n['axis_header'], n.get('level_header') or {1: '款', 2: '項', 3: '目'}.get(n['depth'])) == 'executed'}
    kan_printed = len({n['node_key'] for n in kan} & printed)
    moku_printed = len(moku & printed)
    # Some accounts print only 款・項. No unprinted 目 is invented for that denominator;
    # the 款 still must print an executed amount, including a printed zero.
    passed = bool(kan_printed) and (not moku or moku_printed * 2 > len(moku))
    return {'passed': passed, 'applicable': True, 'kan': len(kan), 'executed_kan': kan_printed,
            'moku': len(moku), 'executed_moku': moku_printed}
