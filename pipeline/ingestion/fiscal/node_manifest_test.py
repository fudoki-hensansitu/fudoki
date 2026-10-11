"""Backward compatibility and paired PDF receipt constraints."""
from copy import deepcopy
import unittest
from unittest.mock import patch
import jsonschema
from ingestion.fiscal import manifest


class NodeManifestTests(unittest.TestCase):
    def document(self, paired=True):
        doc={'schema_version':1,'target':{'jurisdiction':'131041','fiscal_year':2025,'document_kind':'settlement'},
             'direction':'expenditure','conversions':[{'id':'one','converter':'fiscal/layouts/csv/convert.py',
              'inputs':[{'sha256':'a'*64}],'options':{},'expected_tables':[{'table_id':'one'}]}],
             'tables':[]}
        table={'table_id':'one','conversion_id':'one','input_fingerprint':'b'*64}
        for kind in ('nodes','amounts') if paired else (None,):
            receipt={'object':{'key':manifest.object_key(doc,'one',kind),'sha256':'c'*64,'bytes':1},'row_count':1}
            if kind is None:table.update(receipt)
            else:table[kind]=receipt
        if paired:table.update(account='一般会計',notes=[],unread_amount_count=0,unresolved_parent_count=0)
        doc['tables']=[table]
        return doc

    def test_existing_single_parquet_receipt_remains_valid_without_new_fields(self):
        manifest.validate(self.document(False),check_code=False)

    def test_account_must_be_a_selected_pdf_input_scope(self):
        doc=self.document()
        with patch.object(manifest,'resolved_inputs',return_value=[{'format':'pdf','scope':[{'account':'一般会計'}]}]):
            manifest.validate(doc,check_code=False)
            doc['tables'][0]['account']='特別会計'
            with self.assertRaisesRegex(ValueError,'account'):manifest.validate(doc,check_code=False)
        with patch.object(manifest,'resolved_inputs',return_value=[{'format':'csv','scope':[{'account':'一般会計'}]}]):
            with self.assertRaisesRegex(ValueError,'PDF'):manifest.validate(self.document(),check_code=False)

    def test_pair_is_complete_owned_and_cannot_mix_with_legacy_receipt(self):
        for mutate in (lambda t:t.pop('amounts'),lambda t:t.update(object=t['nodes']['object']),
                       lambda t:t.update(unread_amount_count=-1),lambda t:t.pop('account'),
                       lambda t:t['nodes']['object'].update(key=t['amounts']['object']['key'])):
            doc=deepcopy(self.document());mutate(doc['tables'][0])
            with patch.object(manifest,'resolved_inputs',return_value=[{'format':'pdf','scope':[{'account':'一般会計'}]}]):
                with self.assertRaises((ValueError,jsonschema.ValidationError)):manifest.validate(doc,check_code=False)


if __name__=='__main__':unittest.main()
