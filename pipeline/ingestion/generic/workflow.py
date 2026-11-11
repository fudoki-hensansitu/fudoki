from copy import deepcopy
import importlib
import json
from pathlib import Path

import jsonschema

from ingestion.generic.patterns import catalog, entry, load


def selections(workflow: dict) -> dict[tuple[str, str], str]:
    if 'reading' in workflow:
        choices = [('reading', workflow['reading']['pattern'])]
        choices += [('component', name) for name in workflow.get('components', [])]
        return {choice: entry(*choice) for choice in choices}
    hierarchy = workflow['hierarchy']
    choices = [('layout', workflow['layout']['pattern']), ('headers', workflow['headers']['pattern']),
               ('subject', hierarchy['subject']['pattern'])]
    choices += [('breakdown', value['pattern']) for value in hierarchy['breakdown'].values()]
    choices += [('repairs', name) for name in workflow.get('repairs', [])]
    choices += [('quirks', name) for name in quirk_names(workflow)]
    entries = catalog()
    return {choice: entry(*choice, entries=entries) for choice in dict.fromkeys(choices)}


def quirk_names(workflow: dict) -> list[str]:
    """The quirks a layered workflow selects, for the document and for each breakdown axis."""
    names = list(workflow.get('quirks', {}))
    for value in workflow['hierarchy']['breakdown'].values():
        names.extend(value.get('quirks', {}))
    return names


def validate_quirks(workflow: dict) -> None:
    """Each selected quirk is used where its module says it applies (`SCOPE`: the document or an axis) with a value
    its module's `OPTIONS` schema accepts."""
    scoped = [('document', name, value) for name, value in workflow.get('quirks', {}).items()]
    scoped += [('axis', name, value) for axis in workflow['hierarchy']['breakdown'].values()
               for name, value in axis.get('quirks', {}).items()]
    for scope, name, value in scoped:
        module = load('quirks', name)
        if module.SCOPE != scope:
            raise ValueError(f'Quirk {name} applies to the {module.SCOPE}, not the {scope}')
        jsonschema.Draft202012Validator(module.OPTIONS).validate(value)


def settings(workflow: dict) -> dict:
    found = deepcopy(workflow['layout'].get('options', {}))
    found['schema_version'] = 1
    found.setdefault('header', {})
    if workflow['headers']['pattern'] == 'characters':
        found['header']['kind_by_characters'] = True
    found['breakdown'] = {axis: deepcopy(value.get('options', {}))
                          for axis, value in workflow['hierarchy']['breakdown'].items()}
    for axis, value in workflow['hierarchy']['breakdown'].items():
        if value.get('quirks'):
            found['breakdown'][axis]['quirks'] = deepcopy(value['quirks'])
    if workflow.get('quirks'):
        found['quirks'] = deepcopy(workflow['quirks'])
    if 'codes' in workflow['hierarchy']['subject']:
        found['codes'] = workflow['hierarchy']['subject']['codes']
    found['repairs'] = workflow.get('repairs', [])
    return found


def validate(workflow: dict, *, text_pdf: bool = True, coupled: bool | None = None) -> dict:
    schema = json.loads(Path(__file__).with_name('workflow.schema.json').read_text())
    jsonschema.Draft202012Validator(schema).validate(workflow)
    selections(workflow)
    if coupled is not None and ('reading' in workflow) != coupled:
        raise ValueError('Coupled readings require workflow_text; layered workflows require generic_text or generic_scan')
    if 'reading' in workflow:
        if not text_pdf:
            raise ValueError('Coupled text readings cannot be applied to scan workflows')
        return workflow
    if not text_pdf and (workflow.get('repairs') or 'text_layer' in workflow['layout'].get('options', {})):
        raise ValueError('Text-layer repairs cannot be applied to a scan workflow')
    if 'kind_by_characters' in workflow['layout'].get('options', {}).get('header', {}):
        raise ValueError('Select a header pattern instead of setting kind_by_characters')
    validate_quirks(workflow)
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
    built = build(logicals, judge, subject, detail, layout, codes_right, strict=True,
                  amounts_next_row=hierarchy['subject'].get('amounts') == 'next_row', document=workflow)
    if (fourth := hierarchy['subject'].get('fourth_level_axis')):
        fourth_level_axis(built.nodes, fourth)
    return built, {'chosen': subject, 'detail': detail, 'units': units}


def fourth_level_axis(nodes: list[dict], axis: str) -> None:
    """The workflow's `hierarchy.subject.fourth_level_axis`: the subject column prints a level below 目 in its
    staircase (133086's 事業 `(01)一般管理費` under the 目 `01 一般管理費`). The subject axis holds 款・項・目
    only, so the items one level below 目 are a breakdown of the 目 on an axis of their own, at its depth 1.
    They keep their parent, their key and their amounts; their own items keep theirs."""
    subject = {n['axis_header'] for n in nodes if n['level_header'] == '款'}
    for node in nodes:
        if node['axis_header'] in subject and node['depth'] == 4:
            node.update(axis_header=axis, depth=1, level_header=None)
        elif node['axis_header'] in subject and node['depth'] > 4:
            raise ValueError(f'A subject item below the fourth level: {node["node_key"]} {node["name_text"]!r}')


def effective_settings(source: dict, options: dict, *, text_pdf: bool) -> dict:
    if 'workflow' in options:
        workflow = validate(options['workflow'], text_pdf=text_pdf, coupled=False)
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
