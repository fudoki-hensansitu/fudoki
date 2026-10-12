import unittest

import yaml

from serving import columns


class ColumnsTest(unittest.TestCase):
    def test_columns_json_matches_models_yml_order_and_set(self):
        """warehouse が無い環境でも、yml の列集合（木の表は一致、origin は部分集合）と JSON を比べることを検査する。"""
        tables = columns.load()
        descriptions = columns.model_descriptions()
        self.assertEqual(set(tables), set(columns.TABLES))
        for table, spec in tables.items():
            names = [c['name'] for c in spec['columns']]
            if spec.get('document_kind'):
                self.assertEqual(set(names), set(descriptions[table]), table)
            else:  # origin は yml が一部の列だけ説明する
                self.assertLessEqual(set(descriptions[table]), set(names), table)
            self.assertIn(spec['primary_key'], names)
            for cols in spec['indexes']:
                self.assertLessEqual(set(cols), set(names))
            for column in spec['columns']:
                self.assertEqual(column['description'], descriptions[table].get(column['name']))

    def test_columns_json_is_current_when_warehouse_exists(self):
        if not columns.WAREHOUSE.exists():
            self.skipTest('warehouse が無い')
        self.assertEqual(columns.OUTPUT.read_text(encoding='utf-8'), columns.render())

    def test_no_public_marker_in_models_yml(self):
        models = yaml.safe_load(columns.MODELS.read_text(encoding='utf-8'))['models']
        for model in models:
            self.assertNotIn('public', (model.get('meta') or {}))

    def test_ddl(self):
        spec = {'primary_key': 'id', 'indexes': [['a', 'b']],
                'columns': [{'name': 'id', 'type': 'string'}, {'name': 'a', 'type': 'integer'},
                            {'name': 'b', 'type': 'boolean'}]}
        self.assertEqual(columns.create_table_sql('t', spec, 't__new'),
                         'create table "t__new" (\n  "id" text primary key,\n  "a" integer,\n  "b" integer\n)')
        self.assertEqual(columns.create_index_sql('t', spec), ['create index "t_a_b" on "t" (a, b)'])


if __name__ == '__main__':
    unittest.main()
