"""Declared inconsistencies of an original: a printed parent whose children do not add up to it.

A document's layout file (`<方向>.layout.json`, in Git) may list, per table, the parents whose printed value
differs from the sum of their printed children, each with the page, the parent's number and name, the printed
value, the sum and the difference, and the reason the printed value is still the original's. The tree check
passes exactly such a difference and nothing else (`tree_checks.check_tree(declared=...)`); the values stay
as printed.
"""
from __future__ import annotations


def declared_for(document: dict, table_id: str | None) -> list[dict]:
    """The declarations of the document's layout file that name this table."""
    from ingestion.generic.layout_settings import load
    layout = load(document['target'], document.get('direction', 'expenditure')) or {}
    return [entry for entry in layout.get('source_inconsistencies', ()) if entry['table_id'] == table_id]
