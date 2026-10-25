"""Turn recorded PDF readings into explicit workflows; the default only previews changes."""
import argparse
import ast
from copy import deepcopy
import json
from pathlib import Path
import re

from ingestion.fiscal import manifest, storage
from ingestion.generic.layout_settings import load
from ingestion.generic.workflow import validate
from ingestion.lib.node_tables import read_rows

CONVERTERS = {'fiscal/layouts/generic_text/convert.py', 'fiscal/layouts/generic_scan/convert.py'}
PATTERN_NOTE = re.compile(r'科目の段は (\w+)、内訳の段は (\{.*?\})。')


def plan(document: dict) -> tuple[dict, list[dict]]:
    candidate = deepcopy(document)
    changes = []
    original_settings = load(document['target'], document['direction']) or {}
    for conversion in candidate['conversions']:
        if conversion['converter'] not in CONVERTERS or 'workflow' in conversion['options']:
            continue
        tables = [table for table in document['tables'] if table['conversion_id'] == conversion['id']]
        if not tables:
            raise ValueError(f'Workflow migration requires saved tables: {conversion["id"]}')
        readings = []
        axes = set()
        for table in tables:
            notes = [PATTERN_NOTE.search(note) for note in table.get('notes', [])]
            notes = [match for match in notes if match]
            if len(notes) != 1:
                raise ValueError(f'Expected one recorded reading: {table["table_id"]}')
            readings.append((notes[0][1], ast.literal_eval(notes[0][2])))
            for node in read_rows(storage.fetch(table['nodes']['object'])):
                axis = node['axis_header']
                if axis not in ('科目', '注記'):
                    axes.add('節' if axis == '細節' and '細節' not in readings[-1][1] else axis)
        subject, detail = readings[0]
        if any(reading != readings[0] for reading in readings):
            raise ValueError(f'Conversion has conflicting recorded readings: {conversion["id"]}')
        settings = deepcopy(original_settings)
        text = conversion['converter'] == 'fiscal/layouts/generic_text/convert.py'
        if text:
            settings.update(settings.get('accounts', {}).get(conversion['options']['account'], {}))
        header = settings.get('header', {}).copy()
        characters = header.pop('kind_by_characters', False)
        layout = {key: settings[key] for key in ('columns', 'spread', 'rules') if key in settings}
        if header:
            layout['header'] = header
        if text and 'text_layer' in settings:
            layout['text_layer'] = settings['text_layer']
        declared = settings.get('breakdown', {})
        missing = sorted((axes | declared.keys()) - detail.keys())
        workflow = {
            'layout': {'pattern': 'ruled', **({'options': layout} if layout else {})},
            'headers': {'pattern': 'characters' if characters else 'standard'},
            'hierarchy': {'subject': {'pattern': subject}, 'breakdown': {
                axis: {'pattern': pattern, **({'options': declared[axis]} if declared.get(axis) else {})}
                for axis, pattern in [*detail.items(), *((axis, 'indent') for axis in missing)]}},
        }
        if text and settings.get('codes') and subject == 'indent':
            workflow['hierarchy']['subject']['codes'] = settings['codes']
        if text and settings.get('repairs'):
            workflow['repairs'] = settings['repairs']
        validate(workflow)
        conversion['options']['workflow'] = workflow
        expanded = {axis: value['pattern'] for axis, value in workflow['hierarchy']['breakdown'].items()}
        if expanded != detail:
            for table in candidate['tables']:
                if table['conversion_id'] == conversion['id']:
                    table['notes'] = [PATTERN_NOTE.sub(lambda match: f'科目の段は {subject}、内訳の段は {expanded}。', note)
                                      for note in table['notes']]
        changes.append({'conversion': conversion['id'], 'subject': subject, 'breakdown': detail,
                        'explicit_indent_axes': missing})
    return candidate, changes


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', type=Path, action='append', help='Default: all fiscal manifests')
    parser.add_argument('--write', action='store_true', help='Write workflow selections; fingerprints still require content verification')
    args = parser.parse_args()
    results = []
    layouts = []
    for path in args.manifest or manifest.paths():
        document = manifest.read(path)
        candidate, changes = plan(document)
        if changes and args.write:
            manifest.write(path, candidate)
        if changes:
            results.append({'manifest': str(path.resolve().relative_to(manifest.PIPELINE)), 'changes': changes})
        layout = path.with_suffix('.layout.json')
        if layout.exists() and all('workflow' in item['options'] for item in candidate['conversions']):
            old = json.loads(layout.read_text())
            retained = {'schema_version': old['schema_version']}
            if old.get('source_inconsistencies'):
                retained['source_inconsistencies'] = old['source_inconsistencies']
            if old != retained or len(retained) == 1:
                layouts.append({'path': str(layout.resolve().relative_to(manifest.PIPELINE)),
                                'action': 'retain-inconsistencies' if len(retained) > 1 else 'remove'})
                if args.write:
                    if len(retained) > 1:
                        layout.write_text(json.dumps(retained, ensure_ascii=False, indent=2) + '\n')
                    else:
                        layout.unlink()
    print(json.dumps({'written': args.write, 'manifests': len(results),
                      'conversions': sum(len(item['changes']) for item in results), 'results': results,
                      'layouts': layouts},
                     ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
