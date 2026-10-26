"""Declared readers used by the fiscal-domain regression fixtures."""
import json

from ingestion.generic.patterns import load
from ingestion.generic.reading import declaration_path


PROFILES = {
    'parallel_breakdowns': ('131156', 'text_settlement', ['scoped_text', 'marker_boundary']),
    'staggered_execution': ('132063', 'fuchu_settlement', []),
    'profiled_budget': ('132071', 'text_budget', ['page_context']),
    'enterprise_expenses': ('132071', 'enterprise_statement', ['enterprise_hierarchy']),
}


def reader(pattern):
    code, folder, components = PROFILES[pattern]
    path = f'fiscal/jurisdictions/{code}/layouts/{folder}/reading.json'
    workflow = {'reading': {'pattern': pattern, 'profile': path}, 'components': components}
    return load('reading', pattern).Reader(json.loads(declaration_path(path).read_text()), workflow)
