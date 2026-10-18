"""Measure pinned scan observations: tree mismatches, unowned amounts and missed code recovery.

Run from the repo root after acquire.py has restored/acquired the declared originals and OCR:
    mise exec -- uv run python docs/prd/generic-node-builder/scan/measure.py \
        docs/prd/generic-node-builder/scan/plans/132055-2025.json <inputs-dir> <out.json>
Use multiple manifests to compare documents. <inputs-dir> holds `<jurisdiction>.json`
(original SHA-256 → local path). --corrections replays frozen individual rereads; without it,
the measurement uses the observation alone. --recover-codes searches only sequence holes.
The original 36-book manifests are available at 73eb1c9; new inputs have separate IDs in plans/.
This diagnostic does not authorize saving: the generic_scan converter and fiscal gates enforce
the complete selected scope, units, coverage and the saved-table contract.
"""
import gzip
import argparse
import json
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[4] / 'pipeline'))
from ingestion.fiscal import manifest  # noqa: E402
from ingestion.fiscal.storage import fetch_ocr  # noqa: E402
from ingestion.generic import scan  # noqa: E402
from ingestion.generic.build import check, choose_pattern  # noqa: E402
from ingestion.generic.convert import canonical_headings, fine_sections, split_notes  # noqa: E402
from ingestion.lib.tree_checks import check_tree  # noqa: E402
from ingestion.generic.layout_settings import load  # noqa: E402

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('manifests', nargs='+')
parser.add_argument('inputs_dir')
parser.add_argument('out')
parser.add_argument('--corrections', action='store_true', help='Replay the declared amount corrections')
parser.add_argument('--details-dir', type=Path, help='Keep rows and full tree results for diagnosis')
parser.add_argument('--recover-codes', action='store_true', help='Search sequence holes for a missed thin 1')
args = parser.parse_args()
manifests, inputs_dir, out = args.manifests, args.inputs_dir, args.out
rows = []
for path in manifests:
    document = manifest.validate(json.loads(Path(path).read_text()), check_code=False)
    j = document['target']['jurisdiction']
    layout = load(document['target'], document['direction'])
    files = json.loads((Path(inputs_dir) / f'{j}.json').read_text())
    for conversion in document['conversions']:
        observed = [json.loads(gzip.decompress(fetch_ocr(document, item).read_bytes())) for item in conversion['ocr_inputs']]
        observation = {'pages': [p for o in observed for p in o['pages']]}
        if len({p['page_number'] for p in observation['pages']}) != len(observation['pages']):
            raise ValueError('More than one OCR input reads the same page')
        observation['pages'].sort(key=lambda p: p['page_number'])
        account = manifest.resolved_inputs(document, conversion)[0]['scope'][0]['account']
        rules = scan.amount_dictionary(conversion['options'].get('amount_corrections', [])) if args.corrections else None
        recovered = []
        logicals = scan.logicals(observation, Path(files[conversion['inputs'][0]['sha256']]), rules,
                                (layout or {}).get('columns'), recover=args.recover_codes, recovered=recovered,
                                spread=(layout or {}).get('spread'), header=(layout or {}).get('header'),
                                code_corrections=conversion['options'].get('code_corrections') if args.corrections else None,
                                rule_dark=((layout or {}).get('rules') or {}).get('dark', 128))
        units = scan.logical_units(logicals)
        letter_cells = Counter(g.text for logical in logicals for band in logical.bands
                               if (layout or {}).get('columns', {}).get('／'.join(band.header), {}).get('kind') == 'amount'
                               for g in band.words if g.text in ('C', 'J') and (g.page, g.original) not in units)
        built, _ = choose_pattern(logicals,
                                  layout=(layout or {}).get('breakdown'))
        # Passed: the builder's own tree check closes and no amount is left without an owner.
        passed = bool(check(built)['passed']) and not built.unowned
        kept, note_nodes, note_amounts, _, _ = split_notes(built)  # the converter entry's stages after the builder
        nodes = [*built.nodes, *note_nodes]
        amounts, _ = canonical_headings([*kept, *note_amounts], nodes, 'settlement')
        fine_sections(nodes)
        result = check_tree(nodes, amounts)
        mismatches = sum(1 for r in result['results'] if r['status'] != '一致')
        unowned = Counter(u['kind'] for u in built.unowned)
        rows.append({'jurisdiction': j, 'conversion': conversion['id'], 'account': account, 'mismatches': mismatches,
                     'unowned': dict(unowned), 'passed': passed, 'recovered_codes': len(recovered),
                     'amount_letter_cells': dict(letter_cells),
                     'finalized_tree_passed': bool(result['passed']) and not built.unowned})
        if args.details_dir:
            args.details_dir.mkdir(parents=True, exist_ok=True)
            (args.details_dir / f'{j}-{conversion["id"]}.json').write_text(json.dumps(
                {'nodes': nodes, 'amounts': amounts, 'tree': result, 'unowned': built.unowned,
                 'recovered': recovered}, ensure_ascii=False))
        print(j, conversion['id'], account, mismatches, dict(unowned), passed, flush=True)
Path(out).write_text(json.dumps(rows, ensure_ascii=False, indent=1))
general = [r for r in rows if r['account'] == '一般会計']
# The design doc's figures: volumes passed out of all, and the mismatches of the general-account volumes.
print('passed', sum(r['passed'] for r in rows), '/', len(rows),
      '| general-account mismatches', sum(r['mismatches'] for r in general), 'in', len(general), 'volumes')
