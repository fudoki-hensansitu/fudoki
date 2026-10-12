"""List every stored-candidate PDF table with its original file and processed pages (from coverage)."""
import glob, hashlib, json, os, sys
W = os.environ['FUDOKI_CANDIDATE_WORKTREE']  # the #103 worktree holding .agent/w3c and the original cache
FINAL = f'{W}/.agent/w3c/final'
SRC = f'{W}/pipeline/.cache/objects/fiscal/source-selection'
SCAN = {'132055', '132101'}
shas = {}
for path in glob.glob(f'{SRC}/*/2025/*'):
    shas[hashlib.sha256(open(path, 'rb').read()).hexdigest()] = path
rows = []
for target in sorted(os.listdir(FINAL)):
    manifest_path = f'{FINAL}/{target}/inspection/manifest.json'
    if not os.path.exists(manifest_path):
        continue
    manifest = json.load(open(manifest_path))
    jurisdiction = manifest['target']['jurisdiction']
    owners = {t['table_id']: c for c in manifest['conversions'] for t in c['expected_tables']}
    for table in manifest.get('tables', []):
        table_id = table['table_id']
        conversion = owners[table_id]
        inputs = [shas.get(i['sha256']) for i in conversion['inputs']]
        coverage = glob.glob(f'{W}/.agent/w3c/{target}/*/{table_id}.coverage.json')
        pages = sorted({w['page'] for w in json.load(open(coverage[0]))['words']}) if coverage else None
        pdfs = [p for p in inputs if p and p.endswith('.pdf')]
        rows.append({'target': target, 'jurisdiction': jurisdiction, 'table_id': table_id,
                     'document_kind': manifest['target']['document_kind'], 'account': table.get('account'),
                     'converter': conversion['converter'], 'pdf': pdfs[0] if len(pdfs) == 1 else None,
                     'inputs': len(inputs), 'pages': pages, 'scan': jurisdiction in SCAN,
                     'expected': f'{FINAL}/{target}/inspection/{table_id}'})
json.dump(rows, open(sys.argv[1], 'w'), ensure_ascii=False, indent=1)
for r in rows:
    p = r['pages']
    print(r['target'][:6], r['table_id'], os.path.basename(r['pdf'] or 'NONE'), f"{p[0]}-{p[-1]}({len(p)})" if p else 'NO-COVERAGE', 'scan' if r['scan'] else '')
