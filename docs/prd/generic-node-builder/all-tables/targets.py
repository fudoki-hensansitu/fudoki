"""List every saved PDF table with its original file and printed pages, from the repo's manifests.

usage (from the repo root, after restoring the saved tables and originals read-only from R2):
    for m in pipeline/ingestion/fiscal/jurisdictions/*/2025/*/expenditure.json; do
      bun run --cwd pipeline ingestion:restore --manifest "$PWD/$m" --remote
      bun run --cwd pipeline ingestion:originals --manifest "$PWD/$m" --output "$TMPDIR/inputs.json" --remote
    done
    uv run --project pipeline python docs/prd/generic-node-builder/all-tables/targets.py .agent/all-tables/targets.json

The expected tables are the saved node/amount tables (R2, restored into
pipeline/.cache/objects); the pages read are the physical pages those tables
print on, with gaps of up to 3 pages filled. CSV tables and scan PDFs are out of scope.
"""
import glob
import hashlib
import json
import os
import sys
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parents[4]
OBJECTS = ROOT / 'pipeline/.cache/objects'
SCAN = {'132055', '132101'}

originals = {}
for path in glob.glob(str(OBJECTS / 'fiscal/source-selection/*/*/*.pdf')):
    originals[hashlib.sha256(open(path, 'rb').read()).hexdigest()] = path
rows = []
for manifest_path in sorted(glob.glob(str(ROOT / 'pipeline/ingestion/fiscal/jurisdictions/*/*/*/*.json'))):
    manifest = json.load(open(manifest_path))
    if not isinstance(manifest, dict) or 'schema_version' not in manifest or manifest.get('direction') != 'expenditure':
        continue
    jurisdiction = manifest['target']['jurisdiction']
    owners = {t['table_id']: c for c in manifest['conversions'] for t in c['expected_tables']}
    for table in manifest.get('tables', []):
        if 'nodes' not in table:
            continue  # CSV tables keep the original rows; nothing to build
        prefix = str(OBJECTS / table['nodes']['object']['key']).removesuffix('-nodes.parquet')
        pages = None
        if os.path.exists(prefix + '-nodes.parquet'):
            pages = [row[0] for row in duckdb.sql(
                f"select distinct physical_page from (select physical_page from '{prefix}-nodes.parquet' "
                f"union all select physical_page from '{prefix}-amounts.parquet') "
                f"where physical_page is not null order by 1").fetchall()]
            # Fill short gaps: a continuation page may print only columns the saved table omits.
            pages = sorted({p for a, b in zip(pages, pages[1:]) for p in range(a, b + 1) if b - a <= 3} | set(pages))
        inputs = [originals.get(i['sha256']) for i in owners[table['table_id']]['inputs']]
        pdfs = [p for p in inputs if p and p.endswith('.pdf')]
        rows.append({'target': f"{jurisdiction}-{manifest['target']['fiscal_year']}-{manifest['target']['document_kind']}-expenditure",
                     'jurisdiction': jurisdiction, 'table_id': table['table_id'],
                     'document_kind': manifest['target']['document_kind'], 'account': table.get('account'),
                     'pdf': pdfs[0] if len(pdfs) == 1 else None, 'pages': pages,
                     'scan': jurisdiction in SCAN, 'expected': prefix})
missing = [r['table_id'] for r in rows if r['pages'] is None or r['pdf'] is None]
Path(sys.argv[1]).parent.mkdir(parents=True, exist_ok=True)
json.dump(rows, open(sys.argv[1], 'w'), ensure_ascii=False, indent=1)
print(json.dumps({'tables': len(rows), 'not restored': missing}, ensure_ascii=False))
