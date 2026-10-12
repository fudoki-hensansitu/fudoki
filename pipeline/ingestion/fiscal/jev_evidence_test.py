"""Candidate and stored evidence replay through the fiscal entry points."""
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from ingestion.fiscal import manifest, run, storage
from ingestion.lib import jev_recheck as jev, node_tables

CONVERTER = '''
from ingestion.lib.parquet import write_parquet, ParquetColumn
from ingestion.lib.node_tables import write_coverage_words, amount_position_fields

def convert(inputs, destination, options):
    path = destination / 'one.parquet'
    row = {'款_番号': '1', '款_名称': '総務費', '款_支出済額': '10',
           **amount_position_fields('款_支出済額', 1, [(100, 100, 110, 110)])}
    write_parquet(path, [row], columns=[ParquetColumn(k, 'VARCHAR' if isinstance(v, str) else 'BIGINT' if isinstance(v, int) else 'DOUBLE')
                                      for k, v in row.items()])
    write_coverage_words(path, [(1, (100,100,110,110), '10'), (1, (10,10,80,20), '2025年度')])
    return {'one': {'path': path, 'metadata': {'column_contexts': [
        {'columns': ['款_番号','款_名称','款_支出済額'], 'header_path':['科目','款'], 'grain_columns':['款_番号']}],
        'units':[{'text':'円','scope':{'kind':'columns','columns':['款_支出済額']}}]}}}
'''


class EvidenceTest(unittest.TestCase):
    def test_convert_candidate_and_saved_replay_and_storage_receipt(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            origin = root / 'origin.pdf'
            origin.write_bytes(b'fixed original')
            sha = manifest.sha_file(origin)
            converter = root / 'convert.py'
            converter.write_text(CONVERTER)
            conversion = {'id':'one', 'converter':'fiscal/layouts/csv/convert.py',
                'inputs':[{'sha256':sha}], 'options':{}, 'expected_tables':[{'table_id':'one'}]}
            document = {'schema_version':1, 'target':{'jurisdiction':'131041','fiscal_year':2025,'document_kind':'settlement'},
                        'direction':'expenditure', 'conversions':[conversion], 'tables':[]}
            def service(state, questions, key):
                return {'model':jev.MODEL, 'usage':{'input_tokens':100, 'output_tokens':10},
                        'answers':{q:{'type':'choice','choice':'non_amount',
                            'probabilities':{c: float(c == 'non_amount') for c in jev.CRITERIA}}
                                   for q in questions}}
            resolved = [{'sha256':sha,'format':'pdf','pdf_type':'text','scope':[{'account':'一般会計'}]}]
            validate = manifest.validate
            with patch.object(manifest,'read',return_value=document), \
                 patch.object(manifest,'selection_for',return_value={}), \
                 patch.object(manifest,'resolved_inputs',return_value=resolved), \
                 patch.object(manifest,'code_path',return_value=converter), \
                 patch.object(manifest,'fingerprints',return_value={'one':'a'*64}), \
                 patch.object(manifest,'validate',side_effect=lambda d:validate(d,check_code=False)), \
                 patch.object(jev,'call_api',side_effect=service), patch.dict('os.environ',{'TYPESAFE_API_KEY':'stub'}):
                result = run.convert(root / 'manifest.json', {sha:str(origin)}, root / 'candidate')
            candidate = root / 'candidate'
            document = json.loads((candidate / 'manifest.json').read_text())
            table = document['tables'][0]
            self.assertEqual(result['status'], 'candidate')
            self.assertTrue(table['jev']['object']['key'].endswith('/one.jev.json'))
            self.assertEqual(set(manifest.table_references(table)), {'nodes','amounts'})
            evidence_path = candidate / 'one/one.jev.json'
            self.assertIn('scope', json.loads(evidence_path.read_text()))
            locate = run.candidate_locator(candidate)
            with patch.dict('os.environ',{},clear=True), patch.object(jev,'call_api',side_effect=AssertionError('API during replay')):
                replay = run.verify_coverage(document, locate, candidate)
                self.assertEqual(replay['one']['status'], run.MATCH)
                with patch.object(run,'fetch',return_value=evidence_path):
                    saved = run.verify_coverage(document, locate, None)
                self.assertEqual(saved['one']['jev']['judgments'], replay['one']['jev']['judgments'])
                evidence_path.unlink()
                missing = run.verify_coverage(document, locate, candidate)
                self.assertEqual(missing['one']['status'],run.MISMATCH)
                self.assertIn('reason', missing['one'])

    def test_storage_prepares_auxiliary_bytes_without_treating_them_as_parquet(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            cache = root / 'cache'
            path = root / 'one.jev.json'
            path.write_text('{}')
            document = {'target':{'jurisdiction':'131041','fiscal_year':2025,'document_kind':'settlement'},
                        'direction':'expenditure'}
            node = {k: None for k in ('physical_page','x0','y0','x1','y1')}
            node.update(node_key='n', parent_node_key=None, axis_header='款', depth=0,
                        level_header='款', code_text='1', name_text='総務費')
            amount = {k: None for k in ('physical_page','x0','y0','x1','y1')}
            amount.update(node_key='n', header_path='支出済額', amount_text='10', unit_text='円')
            pair = node_tables.write_tables(root, 'one', node_tables.NodeTables([node],[amount]))
            pair['jev'] = path
            table = {'table_id':'one', 'unread_amount_count':0, 'unresolved_parent_count':0}
            for kind, file in pair.items():
                table[kind] = {'object':{'key':manifest.object_key(document,'one',kind),
                    'sha256':manifest.sha_file(file),'bytes':file.stat().st_size}}
            with patch.object(storage,'OBJECTS',cache), patch.object(storage.subprocess,'run') as upload:
                storage.save(document, table, pair, remote=True)
                self.assertEqual(upload.call_count,3)
                self.assertTrue((cache / table['jev']['object']['key']).exists())
