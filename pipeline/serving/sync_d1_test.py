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

    def test_number_roundtrip_through_sqlite(self):
        values = [0.0, 1.5, -2.25, 1e-05, 1.2345678901234567e+20, -3e-7, 123456.789, None, 7]
        con = sqlite3.connect(':memory:')
        con.execute('create table t (v real)')
        for v in values:
            con.execute(f'insert into t values ({sync_d1.literal(v)})')
        self.assertEqual([r[0] for r in con.execute('select v from t order by rowid')], values)

    def test_nan_rejected(self):
        for v in (float('nan'), float('inf')):
            with self.assertRaises(ValueError):
                sync_d1.literal(v)

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

    def test_ddl_loads_in_sqlite(self):
        con = sqlite3.connect(':memory:')
        for name, spec in columns.load().items():
            con.execute(columns.create_table_sql(name, spec))
            for sql in columns.create_index_sql(name, spec):
                con.execute(sql)


class ByteLimitTest(unittest.TestCase):
    def test_multibyte_rows_split_within_byte_limit(self):
        stmts = list(sync_d1.insert_statements('t', ['s'], iter([('あ' * 1000,)] * 50)))
        self.assertGreater(len(stmts), 1)
        self.assertTrue(all(len(s.encode()) <= sync_d1.MAX_STATEMENT_BYTES for s in stmts))
        self.assertEqual(sum(s.count("'あ") for s in stmts), 50)

    def test_single_oversized_row_stops(self):
        with self.assertRaises(ValueError):
            list(sync_d1.insert_statements('t', ['s'], iter([('あ' * 30_000,)])))

    def test_pack_counts_bytes(self):
        batches = list(sync_d1.pack(iter(['あ' * 200_000] * 3)))  # 1文 600KB
        self.assertEqual([len(b) for b in batches], [1, 1, 1])


class CompareTest(unittest.TestCase):
    names = ['pk', 'sha', 'amt', 'flag']

    def test_equal(self):
        rows = [['a', 'x1', 10, 1], ['b', 'x2', 20, 0]]
        self.assertEqual(sync_d1.compare_rows(self.names, 'pk', rows, [list(r) for r in rows]), [])

    def test_same_length_string_replacement_detected(self):
        got = [['a', 'x1', 10, 1]]
        want = [['a', 'y1', 10, 1]]
        problems = sync_d1.compare_rows(self.names, 'pk', got, want)
        self.assertEqual(len(problems), 1)
        self.assertIn('a.sha', problems[0])

    def test_amount_swap_between_rows_detected(self):
        got = [['a', 'x1', 20, 1], ['b', 'x2', 10, 0]]
        want = [['a', 'x1', 10, 1], ['b', 'x2', 20, 0]]
        self.assertEqual(len(sync_d1.compare_rows(self.names, 'pk', got, want)), 2)

    def test_boolean_swap_detected(self):
        got = [['a', 'x1', 10, 0], ['b', 'x2', 20, 1]]
        want = [['a', 'x1', 10, 1], ['b', 'x2', 20, 0]]
        self.assertEqual(len(sync_d1.compare_rows(self.names, 'pk', got, want)), 2)

    def test_missing_extra_null_and_limit(self):
        want = [['a', 'x1', 10, 1], ['b', None, 20, 0]]
        got = [['b', '', 20, 0], ['c', 'x', 1, 1]]
        problems = sync_d1.compare_rows(self.names, 'pk', got, want)
        self.assertEqual(len(problems), 3)  # a 欠け・b.sha（NULL と空文字）・c 余り
        self.assertEqual(len(sync_d1.compare_rows(self.names, 'pk', got, want, limit=2)), 2)

    def test_bool_normalized(self):
        self.assertEqual([sync_d1.d1_value(v) for v in (True, False, None, 3, 1.5)], [1, 0, None, 3, 1.5])


class SwapTest(unittest.TestCase):
    def setUp(self):
        self.tables = columns.load()

    def run_sql(self, con, statements):
        for s in statements:
            con.execute(s['sql'])

    def tables_of(self, con):
        return {r[0] for r in con.execute("select name from sqlite_master where type='table'")}

    def test_swap_with_existing_tables(self):
        spec = self.tables
        con = sqlite3.connect(':memory:')
        for name, sp in spec.items():
            con.execute(columns.create_table_sql(name, sp))
            for sql in columns.create_index_sql(name, sp):
                con.execute(sql)
            con.execute(columns.create_table_sql(name, sp, f'{name}__new'))
            con.execute(f'insert into "{name}__new" ("{sp["primary_key"]}") values (\'new\')')
        self.run_sql(con, sync_d1.swap_statements(spec, set(spec)))
        self.assertEqual(self.tables_of(con), set(spec))
        for name, sp in spec.items():
            self.assertEqual(con.execute(f'select count(*) from "{name}"').fetchone()[0], 1)
            idx = {r[0] for r in con.execute("select name from sqlite_master where type='index' and name not like 'sqlite_%'")}
            self.assertTrue(set(columns.index_name(name, c) for c in sp['indexes']) <= idx)

    def test_swap_first_time(self):
        spec = self.tables
        con = sqlite3.connect(':memory:')
        for name, sp in spec.items():
            con.execute(columns.create_table_sql(name, sp, f'{name}__new'))
        self.run_sql(con, sync_d1.swap_statements(spec, set()))
        self.assertEqual(self.tables_of(con), set(spec))

    def test_crash_at_every_statement_leaves_old_or_new_and_recovers(self):
        spec = self.tables
        statements = sync_d1.swap_statements(spec, set(spec))
        for stop in range(len(statements) + 1):
            con = sqlite3.connect(':memory:')
            for name, sp in spec.items():
                con.execute(columns.create_table_sql(name, sp))
                con.execute(f'insert into "{name}" ("{sp["primary_key"]}") values (\'old\')')
                con.execute(columns.create_table_sql(name, sp, f'{name}__new'))
                con.execute(f'insert into "{name}__new" ("{sp["primary_key"]}") values (\'new\')')
            self.run_sql(con, statements[:stop])
            existing = self.tables_of(con)
            # どの時点でも、各表について本名・__old・__new のどれかにデータがある
            for name in spec:
                self.assertTrue({name, f'{name}__old', f'{name}__new'} & existing)
            before = {n for n in spec if n in existing or f'{n}__old' in existing}
            self.run_sql(con, sync_d1.recover_statements(spec, existing))
            after = self.tables_of(con)
            self.assertEqual(after & {f'{n}__old' for n in spec} | after & {f'{n}__new' for n in spec}, set(),
                             f'stop={stop}')
            self.assertEqual(before, {n for n in spec if n in after}, f'stop={stop}')


if __name__ == '__main__':
    unittest.main()
