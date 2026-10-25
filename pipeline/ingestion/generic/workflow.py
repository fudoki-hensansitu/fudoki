from copy import deepcopy
import importlib
import json
from pathlib import Path

import jsonschema

from ingestion.generic.patterns import catalog, entry, load


def selections(workflow: dict) -> dict[tuple[str, str], str]:
    hierarchy = workflow['hierarchy']
    choices = [('layout', workflow['layout']['pattern']), ('headers', workflow['headers']['pattern']),
               ('subject', hierarchy['subject']['pattern'])]
    choices += [('breakdown', value['pattern']) for value in hierarchy['breakdown'].values()]
    choices += [('repairs', name) for name in workflow.get('repairs', [])]
    entries = catalog()
    return {choice: entry(*choice, entries=entries) for choice in dict.fromkeys(choices)}


def settings(workflow: dict) -> dict:
    found = deepcopy(workflow['layout'].get('options', {}))
    found['schema_version'] = 1
    found.setdefault('header', {})
    if workflow['headers']['pattern'] == 'characters':
        found['header']['kind_by_characters'] = True
    found['breakdown'] = {axis: deepcopy(value.get('options', {}))
                          for axis, value in workflow['hierarchy']['breakdown'].items()}
    if 'codes' in workflow['hierarchy']['subject']:
        found['codes'] = workflow['hierarchy']['subject']['codes']
    found['repairs'] = workflow.get('repairs', [])
    return found


def validate(workflow: dict, *, text_pdf: bool = True) -> dict:
    schema = json.loads(Path(__file__).with_name('workflow.schema.json').read_text())
    jsonschema.Draft202012Validator(schema).validate(workflow)
    selections(workflow)
    if not text_pdf and (workflow.get('repairs') or 'text_layer' in workflow['layout'].get('options', {})):
        raise ValueError('Text-layer repairs cannot be applied to a scan workflow')
    if 'kind_by_characters' in workflow['layout'].get('options', {}).get('header', {}):
        raise ValueError('Select a header pattern instead of setting kind_by_characters')
    subject = workflow['hierarchy']['subject']
    if 'codes' in subject and subject['pattern'] != 'indent':
        raise ValueError('Right-aligned subject codes require the indent pattern')
    from ingestion.generic.layout_settings import validator
    validator().validate(settings(workflow))
    return workflow


def read_layout(pages, *, header: dict | None = None, **options):
    name = (header or {}).get('_layout_pattern', 'ruled')
    return load('layout', name).read(pages, header=header, **options)


def build_reading(logicals, document_kind='settlement', judge=None, layout=None,
                  codes_right=False, workflow=None, *, staircase=False):
    if workflow is None:
        discovery = importlib.import_module('.discovery', __package__)
        patterns = ('bands',) if staircase else discovery.SUBJECT_PATTERNS
        return discovery.choose_pattern(logicals, document_kind, judge, layout, codes_right, patterns)
    from ingestion.generic.tree import build
    from ingestion.generic.units import resolve
    units = resolve(logicals, document_kind)
    hierarchy = workflow['hierarchy']
    subject = hierarchy['subject']['pattern']
    detail = {axis: value['pattern'] for axis, value in hierarchy['breakdown'].items()}
    built = build(logicals, judge, subject, detail, layout, codes_right, strict=True)
    return built, {'chosen': subject, 'detail': detail, 'units': units}


def effective_settings(source: dict, options: dict, *, text_pdf: bool) -> dict:
    if 'workflow' in options:
        workflow = validate(options['workflow'], text_pdf=text_pdf)
        found = settings(workflow)
        found['header']['_layout_pattern'] = workflow['layout']['pattern']
        found['header']['_headers_pattern'] = workflow['headers']['pattern']
        found['header']['_subject_pattern'] = workflow['hierarchy']['subject']['pattern']
        return found
    from ingestion.generic.layout_settings import load as load_layout
    found = load_layout(source['target'], source.get('direction', 'expenditure')) or {}
    if text_pdf:
        found = {**found, **found.get('accounts', {}).get(options['account'], {})}
    return found
