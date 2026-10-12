import sqlite3
import unittest

from serving import columns, sync_d1


class LiteralTest(unittest.TestCase):
    def test_roundtrip_through_sqlite(self):
        """escape が sqlite で元の値に戻る。引用符・改行・日本語・boolean。"""
        values = ["a'b", "''", 'x"y', 'line\nbreak', '款\\項;--', '', None, True, False, -5, 2**62]
        con = sqlite3.connect(':memory:')
        con.execute('create table t (v)')
        for v in values:
            con.execute(f'insert into t values ({sync_d1.literal(v)})')
        got = [r[0] for r in con.execute('select v from t order by rowid')]
        self.assertEqual(got, [int(v) if isinstance(v, bool) else v for v in values])

    def test_nul_rejected(self):
        with self.assertRaises(ValueError):
            sync_d1.literal('a\x00b')


class StatementTest(unittest.TestCase):
    def test_insert_split_by_rows_and_size(self):
        rows = iter([(f'r{i}', i) for i in range(250)])
        stmts = list(sync_d1.insert_statements('t', ['a', 'b'], rows))
        self.assertEqual([s.count('),(') + 1 for s in stmts], [100, 100, 50])
        big = iter([('x' * 30_000, 1), ('y' * 30_000, 2)])
        stmts = list(sync_d1.insert_statements('t', ['a', 'b'], big))
        self.assertEqual(len(stmts), 2)
        self.assertTrue(all(len(s) <= sync_d1.MAX_STATEMENT_BYTES for s in stmts))

    def test_insert_executes_in_sqlite(self):
        con = sqlite3.connect(':memory:')
        con.execute('create table t ("a" text, "b" integer)')
        for s in sync_d1.insert_statements('t', ['a', 'b'], iter([("o'k", None), ('z', 3)])):
            con.execute(s)
        self.assertEqual(con.execute('select * from t order by rowid').fetchall(), [("o'k", None), ('z', 3)])

    def test_pack_respects_batch_size(self):
        stmts = iter(['x' * 400_000] * 5)
        batches = list(sync_d1.pack(stmts))
        self.assertEqual([len(b) for b in batches], [2, 2, 1])

    def test_swap_is_one_ordered_batch_with_indexes(self):
        tables = columns.load()
        sql = [s['sql'] for s in sync_d1.swap_statements(tables)]
        self.assertEqual(sql[0], 'drop table if exists "origin"')
        self.assertEqual(sql[1], 'alter table "origin__new" rename to "origin"')
        self.assertEqual(sum(s.startswith('create index') for s in sql), 6)
        self.assertEqual(sum(s.startswith('alter table') for s in sql), 3)

    def test_ddl_loads_in_sqlite(self):
        con = sqlite3.connect(':memory:')
        for name, spec in columns.load().items():
            con.execute(columns.create_table_sql(name, spec))
            for sql in columns.create_index_sql(name, spec):
                con.execute(sql)


if __name__ == '__main__':
    unittest.main()
