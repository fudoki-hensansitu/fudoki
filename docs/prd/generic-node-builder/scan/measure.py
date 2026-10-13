"""Measure the generic builder on the pinned scan OCR of 青梅 (132055) and 小金井 (132101): passes and mismatches.

The scan converter in production is `settlement_statement`; the generic builder reads scan pages only here,
through `ingestion.generic.scan.logicals` (which marks the pages as OCR, so `scan.py`'s rules apply).

usage (from pipeline/, after `ingestion:originals --remote` and the OCR observations in the cache):
    git show 73eb1c9:pipeline/ingestion/fiscal/jurisdictions/132055/2025/settlement/expenditure.json > /tmp/132055.json
    git show 73eb1c9:pipeline/ingestion/fiscal/jurisdictions/132101/2025/settlement/expenditure.json > /tmp/132101.json
    uv run python ../docs/prd/generic-node-builder/scan/measure.py /tmp/132055.json /tmp/132101.json <inputs-dir> <out.json>
The manifests at 73eb1c9 (#123) declare every volume's OCR input; main keeps only the saved ones.
<inputs-dir> holds `<jurisdiction>.json` (original SHA-256 → local path) as `ingestion:originals` writes it.
"""
import gzip
import json
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[4] / 'pipeline'))
from ingestion.fiscal.storage import fetch_ocr  # noqa: E402
from ingestion.generic import scan  # noqa: E402
from ingestion.generic.build import choose_pattern  # noqa: E402
from ingestion.generic.convert import canonical_headings, fine_sections, split_notes  # noqa: E402
from ingestion.lib.tree_checks import check_tree  # noqa: E402

*manifests, inputs_dir, out = sys.argv[1:]
rows = []
for path in manifests:
    document = json.loads(Path(path).read_text())
    j = document['target']['jurisdiction']
    files = json.loads((Path(inputs_dir) / f'{j}.json').read_text())
    for conversion in document['conversions']:
        observation = json.loads(gzip.decompress(fetch_ocr(document, conversion['ocr_inputs'][0]).read_bytes()))
        built, _ = choose_pattern(scan.logicals(observation, Path(files[conversion['inputs'][0]['sha256']])))
        kept, note_nodes, note_amounts, _, _ = split_notes(built)  # the converter entry's stages after the builder
        nodes = [*built.nodes, *note_nodes]
        amounts, _ = canonical_headings([*kept, *note_amounts], nodes, 'settlement')
        fine_sections(nodes)
        result = check_tree(nodes, amounts)
        mismatches = sum(1 for r in result['results'] if r['status'] != '一致')
        unowned = Counter(u['kind'] for u in built.unowned)
        rows.append({'jurisdiction': j, 'conversion': conversion['id'], 'mismatches': mismatches, 'unowned': dict(unowned),
                     'passed': bool(result['passed']) and not built.unowned})
        print(j, conversion['id'], mismatches, dict(unowned), flush=True)
Path(out).write_text(json.dumps(rows, ensure_ascii=False, indent=1))
print('passed', sum(r['passed'] for r in rows), '/', len(rows), 'mismatches', sum(r['mismatches'] for r in rows))
