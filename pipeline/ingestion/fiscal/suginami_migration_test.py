"""Scoped name repair and per-level printed identities for Suginami's explanation."""
import importlib.util
from pathlib import Path
import unittest

CODE=Path(__file__).parent/'jurisdictions/131156/layouts/text_settlement/convert.py'
spec=importlib.util.spec_from_file_location('suginami_text_settlement',CODE)
converter=importlib.util.module_from_spec(spec)
spec.loader.exec_module(converter)


class SuginamiMigrationTests(unittest.TestCase):
    def test_subject_name_repair_is_scoped_to_the_render_verified_full_word(self):
        self.assertEqual(converter.repair_name('馬齢者福祉普'),'高齢者福祉費')
        for value in ('馬齢','高齢者福祉費','馬の普及','高齢者福祉'):
            with self.subTest(value=value):self.assertEqual(converter.repair_name(value),value)

    def test_explanation_levels_have_their_own_grains_and_positions(self):
        metadata=converter.metadata(converter.BREAKDOWN_COLUMNS,'一般会計','notes')
        contexts=metadata['column_contexts'][-3:]
        self.assertEqual(len(contexts),3)
        for level,context in zip(('実施事業','項目','細目'),contexts):
            self.assertEqual(context['grain_columns'],[level+'_物理頁',level+'_上端'])
            self.assertEqual(context['header_path'],['備考'])
            for field in ('物理頁','上端','下端'):
                self.assertIn(level+'_'+field,converter.BREAKDOWN_COLUMNS)
                self.assertIn(level+'_'+field,context['columns'])


if __name__=='__main__':unittest.main()
