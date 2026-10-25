from functools import partial
import json
from pathlib import Path

import jsonschema

from ingestion.generic.patterns import entry, load
from ingestion.paths import PIPELINE

INGESTION = PIPELINE / 'ingestion'


def declaration_path(value: str) -> Path:
    path = INGESTION / value
    if path.suffix != '.json' or path.is_symlink() or not path.is_file() or not path.resolve().is_relative_to(INGESTION.resolve()):
        raise ValueError(f'PDF reading declaration must be an ingestion JSON file: {value}')
    return path


def declaration_files(workflow: dict) -> list[str]:
    """Selected profile, its referenced JSON declarations, and the reading's option schema."""
    reading = workflow['reading']
    module = entry('reading', reading['pattern']).removeprefix('ingestion.').replace('.', '/')
    found = {module + '.schema.json', module + '.profile.schema.json'}
    pending = [reading['profile']]
    while pending:
        relative = pending.pop()
        if relative in found:
            continue
        path = declaration_path(relative)
        found.add(relative)
        profile = json.loads(path.read_text())
        if isinstance(profile, dict) and 'statement_profile' in profile:
            pending.append(profile['statement_profile'])
    return sorted(found)


def validate(workflow: dict, options: dict | None = None) -> dict:
    selected = workflow['reading']
    module = load('reading', selected['pattern'])
    profile = json.loads(declaration_path(selected['profile']).read_text())
    module_path = entry('reading', selected['pattern']).removeprefix('ingestion.').replace('.', '/')
    schema = json.loads(declaration_path(module_path + '.profile.schema.json').read_text())
    jsonschema.Draft202012Validator(schema).validate(profile)
    provided = set()
    for name in workflow.get('components', []):
        component = load('component', name)
        overlap = provided & component.FUNCTIONS.keys()
        if overlap:
            raise ValueError(f'PDF component functions selected twice: {sorted(overlap)}')
        provided.update(component.FUNCTIONS)
    required = set(module.Reader.REQUIRED_RULES)
    if provided != required:
        raise ValueError(f'PDF reading components differ: missing={sorted(required - provided)}, unused={sorted(provided - required)}')
    for relative in declaration_files(workflow):
        declaration_path(relative)
    if options is not None:
        schema = json.loads((INGESTION / (entry('reading', selected['pattern']).removeprefix('ingestion.').replace('.', '/') + '.schema.json')).read_text())
        jsonschema.Draft202012Validator(schema).validate({k: v for k, v in options.items() if k != 'workflow'})
    return profile


class Reading:
    """Conversion-local state and the selected component callbacks."""
    REQUIRED_RULES = ()

    def __init__(self, profile: dict, workflow: dict):
        self.pattern = workflow['reading']['pattern']
        self._rules = {}
        for name in workflow.get('components', []):
            for function_name, function in load('component', name).FUNCTIONS.items():
                self._rules[function_name] = partial(function, self)

    def rule(self, name: str):
        return self._rules[name]


def convert(inputs: list[dict], destination: Path, options: dict) -> dict:
    workflow = options['workflow']
    from ingestion.generic.workflow import validate as validate_workflow
    validate_workflow(workflow, coupled=True)
    profile = validate(workflow, options)
    reader = load('reading', workflow['reading']['pattern']).Reader(profile, workflow)
    return reader.convert(inputs, destination, {k: v for k, v in options.items() if k != 'workflow'})
