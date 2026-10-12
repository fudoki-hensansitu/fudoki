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

    def test_oversized_row_after_small_row_stops(self):
        with self.assertRaises(ValueError):
            list(sync_d1.insert_statements('t', ['s'], iter([('x',), ('あ' * 40000,)])))

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

    def create(self, con, suffix, value):
        for name, sp in self.tables.items():
            con.execute(columns.create_table_sql(name, sp, name + suffix))
            con.execute(f'insert into "{name}{suffix}" ("{sp["primary_key"]}") values (\'{value}\')')

    def assert_all_new(self, con, label):
        self.assertEqual(self.tables_of(con), set(self.tables) | {'control'}, label)
        idx = {r[0] for r in con.execute("select name from sqlite_master where type='index' and name not like 'sqlite_%'")}
        for name, sp in self.tables.items():
            self.assertEqual(con.execute(f'select "{sp["primary_key"]}" from "{name}"').fetchall(), [('new',)], label)
            self.assertTrue({columns.index_name(name, c) for c in sp['indexes']} <= idx, label)

    def fresh(self):
        con = sqlite3.connect(':memory:')
        con.execute('create table control (key text primary key, value text not null)')
        con.execute("insert into control values ('serving', 'on')")
        return con

    def test_swap_replaces_old_generation(self):
        con = self.fresh()
        self.create(con, '', 'old')
        for name, sp in self.tables.items():
            for sql in columns.create_index_sql(name, sp):
                con.execute(sql)
        self.create(con, '__new', 'new')
        self.run_sql(con, sync_d1.swap_statements(self.tables))
        self.assert_all_new(con, 'swap')

    def test_swap_first_time(self):
        con = self.fresh()
        self.create(con, '__new', 'new')
        self.run_sql(con, sync_d1.swap_statements(self.tables))
        self.assert_all_new(con, 'first')

    def test_next_sync_rebuilds_after_swap_stopped_at_any_statement(self):
        """入れ替えがどの文で止まっても（成功後に応答を失って再送が失敗する場合を含む）、次の同期で3表とも作り直される。"""
        statements = sync_d1.swap_statements(self.tables)
        for first_time in (False, True):
            for stop in range(len(statements) + 1):
                con = self.fresh()
                if not first_time:
                    self.create(con, '', 'old')
                self.create(con, '__new', 'new')
                self.run_sql(con, statements[:stop])
                if stop == len(statements):  # 成功したのに応答を失い、再送すると失敗する
                    with self.assertRaises(sqlite3.OperationalError):
                        self.run_sql(con, statements)
                # 次の同期: 残骸を捨て、__new を作り直して照合後に入れ替える
                self.run_sql(con, sync_d1.cleanup_statements())
                self.assertFalse({n for n in self.tables_of(con) if n.endswith(('__new', '__old'))})
                self.create(con, '__new', 'new')
                self.run_sql(con, sync_d1.swap_statements(self.tables))
                self.assert_all_new(con, f'first_time={first_time} stop={stop}')

    def test_cleanup_leaves_real_tables(self):
        con = self.fresh()
        self.create(con, '', 'old')
        self.create(con, '__old', 'x')
        self.create(con, '__new', 'x')
        self.run_sql(con, sync_d1.cleanup_statements())
        self.assertEqual(self.tables_of(con), set(self.tables) | {'control'})


class ScopeTest(unittest.TestCase):
    def test_where_is_none_when_not_specified(self):
        self.assertEqual(sync_d1.scope_where(None), '')
        self.assertEqual(sync_d1.scope_where([]), '')

    def test_where_selects_same_rows_in_duckdb_and_sqlite(self):
        import duckdb

        rows = [('132039', 'a'), ('131016', 'b'), ("13'x", 'c'), ('132039', 'd')]
        d = duckdb.connect()
        d.execute('create table t (jurisdiction_code varchar, k varchar)')
        d.executemany('insert into t values (?, ?)', rows)
        q = sqlite3.connect(':memory:')
        q.execute('create table t (jurisdiction_code text, k text)')
        q.executemany('insert into t values (?, ?)', rows)
        for scope in (['132039'], ['132039', "13'x"], ['999999']):
            where = sync_d1.scope_where(scope)
            sql = f'select k from t{where} order by k'
            self.assertEqual(d.execute(sql).fetchall(), q.execute(sql).fetchall())
        self.assertEqual(d.execute('select k from t' + sync_d1.scope_where(['132039']) + ' order by k').fetchall(), [('a',), ('d',)])

    def test_bucket_rows_combines_where(self):
        import duckdb

        d = duckdb.connect()
        d.execute('create table main."t" (jurisdiction_code varchar, node_id varchar)')
        d.execute("insert into main.\"t\" values ('1','a1'), ('2','a2'), ('1','b1')")
        where = sync_d1.scope_where(['1'])
        self.assertEqual(sync_d1.bucket_chars(d, 't', 'node_id', where), {'a': 1, 'b': 1})
        self.assertEqual(sync_d1.bucket_rows(d, 't', ['jurisdiction_code', 'node_id'], 'node_id', 'a', where), [['1', 'a1']])
        self.assertEqual(sync_d1.bucket_chars(d, 't', 'node_id', sync_d1.scope_where(['9'])), {})

    def test_swap_with_empty_tables(self):
        """該当行が0件の表でも、空の表を作って入れ替えが通る。"""
        tables = columns.load()
        con = sqlite3.connect(':memory:')
        for name, sp in tables.items():
            con.execute(columns.create_table_sql(name, sp, f'{name}__new'))
        for s in sync_d1.swap_statements(tables):
            con.execute(s['sql'])
        for name in tables:
            self.assertEqual(con.execute(f'select count(*) from "{name}"').fetchone()[0], 0)


if __name__ == '__main__':
    unittest.main()
