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


class CheckTest(unittest.TestCase):
    def test_check_sql_same_in_duckdb_and_sqlite(self):
        """日本語・絵文字・引用符・空文字・NULL・小数を含む表で、DuckDB と SQLite の検査値が一致する。"""
        import duckdb

        spec = {'document_kind': 'x', 'primary_key': 'k', 'indexes': [], 'columns': [
            {'name': 'jurisdiction_code', 'type': 'string'}, {'name': 'fiscal_year', 'type': 'integer'},
            {'name': 's', 'type': 'string'}, {'name': 'b', 'type': 'boolean'}, {'name': 'x', 'type': 'number'}]}
        rows = [('1', 2025, '款😀ｱ', True, 1.5), ('1', 2025, "it's", False, None), ('1', 2025, '', None, 2.25),
                ('2', 2025, None, True, -1e-5)]
        d = duckdb.connect()
        d.execute('create table t (jurisdiction_code varchar, fiscal_year integer, s varchar, b boolean, x double)')
        d.executemany('insert into t values (?,?,?,?,?)', rows)
        q = sqlite3.connect(':memory:')
        q.execute('create table t (jurisdiction_code text, fiscal_year integer, s text, b integer, x real)')
        q.executemany('insert into t values (?,?,?,?,?)', [(a, b, c, None if d_ is None else int(d_), e) for a, b, c, d_, e in rows])
        sql = sync_d1.check_sql('t', spec)
        want = sync_d1.normalize(d.execute(sql).fetchall(), spec)
        got = sync_d1.normalize(q.execute(sql).fetchall(), spec)
        self.assertEqual(sync_d1.differences('t', spec, got, want), [])
        self.assertEqual(want[('1', 2025)][0], 3)
        self.assertEqual(want[('1', 2025)][5:7], [7, 0])  # s の文字数の和（3+4+0）と NULL の数

    def test_truncation_and_null_swap_are_detected(self):
        spec = {'columns': [{'name': 's', 'type': 'string'}]}
        base = {('a',): [2, 5, 0]}
        self.assertTrue(sync_d1.differences('t', spec, {('a',): [2, 4, 0]}, base))  # 切り詰め
        self.assertTrue(sync_d1.differences('t', spec, {('a',): [2, 5, 1]}, base))  # 空文字と NULL
        self.assertTrue(sync_d1.differences('t', spec, {}, base))  # グループ欠落
        self.assertEqual(sync_d1.differences('t', spec, base, base), [])


if __name__ == '__main__':
    unittest.main()
