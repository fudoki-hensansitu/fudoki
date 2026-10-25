"""Execute fixed observation fixtures in a fresh process for the dependency contract test."""
import gzip
import json
from pathlib import Path
import sys
import tempfile

from ingestion.fiscal import manifest
from ingestion.generic.convert import canonical_headings
from ingestion.generic.patterns import catalog
from ingestion.generic.runtime import run_pages
from ingestion.generic.scan import build_table
from ingestion.generic.workflow import effective_settings, selections
from ingestion.lib.pdf_rules import PageRules, Rule


def execute(adapter, subject, detail, headers):
    workflow = {'layout': {'pattern': 'ruled', 'options': {'columns': {'支出済額': {'kind': 'amount'}}}},
                'headers': {'pattern': headers},
                'hierarchy': {'subject': {'pattern': subject}, 'breakdown': {'備考': {'pattern': detail}}}}
    if adapter == 'text':
        workflow['repairs'] = ['stacked_rows', 'split_at_rules']
    options = {'account': '一般会計', 'table_id': 'general', 'workflow': workflow}
    words = [['科目' if subject == 'indent' else '款', 5, 15, 30, 24],
             ['備考', 50, 15, 80, 24], ['支出済額', 150, 15, 190, 24],
             ['1 総務費', 5, 40, 35, 49], ['1 事業A', 50, 60, 110, 69], ['900', 160, 60, 190, 69]]
    verticals, horizontals = [0, 40, 140, 200], [10, 30, 100]
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        pdf = root / 'blank.pdf'
        if adapter == 'text':
            cache = root / 'words.json'
            cache.write_text(json.dumps({'pages': [1], 'observed': [
                {'number': 1, 'width': 210, 'height': 120, 'words': words,
                 'rules': [[x, 10, x, 100] for x in verticals] + [[0, y, 200, y] for y in horizontals]}]}))
            settings = effective_settings({}, options, text_pdf=True)
            built, _, _, _ = run_pages(pdf, [1], cache, workflow=workflow, layout=settings['breakdown'],
                                       columns=settings['columns'], header=settings['header'],
                                       repairs=frozenset(settings['repairs']), stop=False)
            # A permuted inner heading must reach the selected character reader, not the dictionary fast path.
            if headers == 'characters':
                built.amounts[0]['header_path'] = '予算現額／費予及増び流出用減'
            nodes = built.nodes
            amounts, _ = canonical_headings(built.amounts, nodes, 'settlement', settings['header'])
        else:
            import pypdfium2 as pdfium
            document = pdfium.PdfDocument.new()
            page = document.new_page(210, 120)
            document.save(pdf)
            page.close()
            document.close()
            observations = [{'id': str(i), 'kind': 'region', 'parent_id': None,
                             'raw_text': word[0], 'bbox_pdf_pt': word[1:]} for i, word in enumerate(words)]
            observations[3]['raw_text'] = '7 総務費'
            observations.extend([
                {'id': 'subject-code', 'kind': 'word', 'parent_id': '3',
                 'raw_text': '7', 'bbox_pdf_pt': [5, 40, 10, 49]},
                {'id': 'subject-name', 'kind': 'word', 'parent_id': '3',
                 'raw_text': '総務費', 'bbox_pdf_pt': [15, 40, 35, 49]}])
            ocr = root / 'ocr.json.gz'
            ocr.write_bytes(gzip.compress(json.dumps({'origin': {'sha256': '0' * 64}, 'request': {},
                'pages': [{'page_number': 1, 'regions': [{'observations': observations}]}]}).encode()))
            options['code_corrections'] = [{'id': 'code', 'page': 1, 'observation_id': 'subject-code',
                'observed_code': '7', 'corrected_code': '1', 'reason': 'Fixed observation fixture'}]
            source = {'path': pdf, 'format': 'pdf', 'pdf_type': 'scan', 'sha256': '0' * 64,
                      'target': {'document_kind': 'settlement'},
                      'scope': [{'account': '一般会計', 'pages': [[1, 1]]}], 'ocr': [{'id': 'fixed', 'path': ocr}]}
            rules = {1: PageRules(1, 210, 120, tuple(Rule(x, 10, 100, 1) for x in verticals),
                                 tuple(Rule(y, 0, 200, 1) for y in horizontals))}
            table = build_table(source, options, stop=False, rules=rules)
            nodes, amounts = table.nodes, table.amounts
    conversion = {'converter': f'fiscal/layouts/generic_{adapter}/convert.py', 'options': options}
    files = set(manifest.dependencies(conversion))
    loaded = set()
    for name, module in tuple(sys.modules.items()):
        path = getattr(module, '__file__', None)
        if name.startswith('ingestion.') and path and Path(path).is_relative_to(manifest.INGESTION):
            relative = str(Path(path).relative_to(manifest.INGESTION))
            if not manifest.is_check_module(relative) and relative not in manifest.FINGERPRINT_EXCLUDED:
                loaded.add(relative)
    selected = set(selections(workflow).values())
    unselected = {module.removeprefix('ingestion.').replace('.', '/') + '.py'
                  for patterns in catalog().values() for module in patterns.values() if module not in selected}
    parent, child = nodes
    return {'nodes': len(nodes), 'amounts': [a['amount_text'] for a in amounts],
            'parent_preserved': child['parent_node_key'] == parent['node_key'],
            'names': [n['name_text'] for n in nodes], 'headers': [a['header_path'] for a in amounts],
            'missing': sorted(loaded - files), 'unselected': sorted(unselected.intersection(loaded | files)),
            'loaded': sorted(loaded)}


if __name__ == '__main__':
    print(json.dumps(execute(*sys.argv[1:]), ensure_ascii=False))
