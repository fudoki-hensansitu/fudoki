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
        """入れ替えがどの文で止まっても（成功後に応答を失って再送が失敗する場合を含む）、次の同期で全表とも作り直される。"""
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
    def test_condition_selects_same_rows_in_duckdb_and_sqlite(self):
        """自治体コードの列を持つ表はその列で、持たない表は親の表の自治体で絞る。両者で同じ行を選ぶ。"""
        import duckdb

        origins = [('o1', '131202'), ('o2', '131091'), ("o'3", "13'x")]
        locations = [('l1', 'o1'), ('l2', 'o2'), ('l3', "o'3"), ('l4', 'o1')]
        d = duckdb.connect()
        q = sqlite3.connect(':memory:')
        for con in (d, q):
            con.execute('create table expenditure_origin (origin_id varchar, jurisdiction_code varchar)')
            con.execute('create table expenditure_location (line_id varchar, origin_id varchar)')
            con.executemany('insert into expenditure_origin values (?, ?)', origins)
            con.executemany('insert into expenditure_location values (?, ?)', locations)
        for scope in (['131202'], ['131202', "13'x"], ['999999']):
            for table, names in (('expenditure_origin', ['origin_id', 'jurisdiction_code']), ('expenditure_location', ['line_id', 'origin_id'])):
                sql = f'select * from {table} where {sync_d1.scope_condition(table, names, scope)} order by 1'
                self.assertEqual(d.execute(sql).fetchall(), q.execute(sql).fetchall())
        sql = 'select line_id from expenditure_location where ' + sync_d1.scope_condition('expenditure_location', ['line_id', 'origin_id'], ['131202'])
        self.assertEqual(sorted(d.execute(sql).fetchall()), [('l1',), ('l4',)])

    def test_every_table_can_be_scoped(self):
        """新しい表が自治体コードの列も親の表も持たなければ、ここで気づく。"""
        for name, spec in columns.load().items():
            sync_d1.scope_condition(name, [c['name'] for c in spec['columns']], ['131202'])

    def test_ranges_cover_all_keys_in_duckdb_and_sqlite(self):
        """範囲は両端が開いていて、warehouse に無い主キーもどれかの範囲に入る。範囲の式は両者で同じ行を選ぶ。"""
        import duckdb
        from unittest import mock

        keys = [f'{i:04x}' for i in range(0, 50, 3)]
        d = duckdb.connect()
        d.execute('create table main."t" (jurisdiction_code varchar, k varchar)')
        d.executemany('insert into main."t" values (?, ?)', [('1', k) for k in keys])
        q = sqlite3.connect(':memory:')
        q.execute('create table t (jurisdiction_code text, k text)')
        q.executemany('insert into t values (?, ?)', [('1', k) for k in keys] + [('1', ''), ('1', 'zz'), ('1', '0004')])
        with mock.patch.object(sync_d1, 'RANGE_ROWS', 5):
            ranges = sync_d1.key_ranges(d, 't', 'k')
        self.assertEqual(len(ranges), 4)
        self.assertEqual((ranges[0][0], ranges[-1][1]), (None, None))
        seen = []
        for lo, hi in ranges:
            cond = sync_d1.range_condition('k', lo, hi)
            got = [r[0] for r in q.execute(f'select k from t where {cond} order by k')]
            self.assertEqual([r[0] for r in d.execute(f'select k from t where {cond} order by k').fetchall()], [k for k in got if k in keys])
            seen += got
        self.assertEqual(sorted(seen), sorted(keys + ['', 'zz', '0004']))
        self.assertEqual(sync_d1.key_ranges(d, 't', 'k', " where jurisdiction_code = '9'"), [(None, None)])

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


class DiffRowsTest(unittest.TestCase):
    names = ['pk', 'v']

    def test_deletes_and_writes(self):
        got = [['a', 1], ['b', 2], ['c', 3]]
        want = [['b', 2], ['c', 30], ['d', 4]]
        self.assertEqual(sync_d1.diff_rows(self.names, 'pk', got, want), (['a'], ['c', 'd']))

    def test_null_and_empty_string_differ(self):
        self.assertEqual(sync_d1.diff_rows(self.names, 'pk', [['a', '']], [['a', None]]), ([], ['a']))

    def test_delete_statements_execute_in_sqlite(self):
        con = sqlite3.connect(':memory:')
        con.execute('create table t (k text primary key)')
        keys = [f"k'{i}" for i in range(1200)]
        con.executemany('insert into t values (?)', [(k,) for k in keys])
        stmts = list(sync_d1.delete_statements('t', 'k', keys[:1100]))
        self.assertEqual(len(stmts), 3)
        for sql in stmts:
            con.execute(sql)
        self.assertEqual(con.execute('select count(*) from t').fetchone()[0], 100)


class FakeD1:
    """sqlite3 を D1 の代わりにする。文の記録を残す。"""

    local = True

    def __init__(self):
        self.con = sqlite3.connect(':memory:')
        self.con.execute('create table control (key text primary key, value text not null)')
        self.calls = 0
        self.log: list[str] = []

    def batch(self, statements, retries=3):
        self.calls += 1
        out = []
        for s in statements:
            self.log.append(s['sql'])
            cur = self.con.execute(s['sql'])
            out.append({'success': True, 'results': {'rows': [list(r) for r in cur.fetchall()]}})
        return out

    def rows(self, table, key):
        return [list(r) for r in self.con.execute(f'select * from "{table}" order by "{key}"')]

    def writes(self):
        return [s for s in self.log if s.startswith(('insert', 'delete', 'create', 'drop', 'alter'))]


class SyncTest(unittest.TestCase):
    """warehouse（DuckDB）から FakeD1 へ同期し、差分の同期が変わった行だけを書くことを確かめる。"""

    DUCK = {'string': 'varchar', 'integer': 'bigint', 'boolean': 'boolean', 'number': 'double'}

    def setUp(self):
        import duckdb
        from unittest import mock

        self.tables = columns.load()
        self.duck = duckdb.connect()
        for name, spec in self.tables.items():
            cols = ', '.join(f'"{c["name"]}" {self.DUCK[c["type"]]}' for c in spec['columns'])
            self.duck.execute(f'create table main."{name}" ({cols})')
        self.add('jurisdiction', [f'{i:06d}' for i in range(3)])
        self.add('project_year', [f'{i:064x}' for i in range(0, 600, 2)])
        self.d1 = FakeD1()
        patcher = mock.patch.object(sync_d1, 'RANGE_ROWS', 40)
        patcher.start()
        self.addCleanup(patcher.stop)

    def add(self, name, keys, value='x'):
        spec = self.tables[name]
        names = [c['name'] for c in spec['columns']]
        for k in keys:
            row = {n: None for n in names}
            row[spec['primary_key']] = k
            for c in spec['columns']:
                if c['name'] != spec['primary_key'] and c['type'] == 'string':
                    row[c['name']] = value
                    break
            self.duck.execute(f'insert into main."{name}" values ({", ".join("?" for _ in names)})', [row[n] for n in names])

    def sync(self, **kw):
        self.d1.log.clear()
        messages = []
        code = sync_d1.run(self.d1, self.duck, self.tables, False, kw.get('jurisdictions'), kw.get('full', False), messages.append)
        self.assertEqual(code, 0, messages)
        return messages

    def assert_same(self):
        for name, spec in self.tables.items():
            key = spec['primary_key']
            want = [[sync_d1.d1_value(v) for v in r] for r in self.duck.execute(f'select * from main."{name}" order by "{key}"').fetchall()]
            self.assertEqual(self.d1.rows(name, key), want, name)

    def test_first_sync_rebuilds_then_nothing_to_write(self):
        self.sync()
        self.assert_same()
        self.sync()
        # 変わっていなければ、残骸の drop 以外は何も書かない
        self.assertEqual([s for s in self.d1.writes() if not s.endswith(('__new"', '__old"'))], [])

    def test_changed_rows_only(self):
        self.sync()
        key = 'project_year_id'
        self.duck.execute(f'delete from main."project_year" where "{key}" = ?', [f'{4:064x}'])
        self.duck.execute(f'update main."project_year" set "project_id" = \'changed\' where "{key}" = ?', [f'{10:064x}'])
        self.add('project_year', [f'{1:064x}', f'{999:064x}'])
        self.sync()
        self.assert_same()
        writes = [s for s in self.d1.writes() if not s.endswith(('__new"', '__old"'))]
        self.assertEqual(len(writes), 2, writes)  # delete 1文と insert 1文
        self.assertTrue(writes[0].startswith('delete from "project_year"'))
        self.assertEqual(writes[1].count('),(') + 1, 3)
        self.assertFalse([s for s in self.d1.log if 'pragma' not in s and 'select' in s and '__new' in s])

    def test_rows_missing_in_d1_are_refilled(self):
        """途中で止まった同期の続きも、D1 の今の中身と比べて埋まる。"""
        self.sync()
        self.d1.con.execute('delete from project_year where rowid % 3 = 0')
        self.d1.con.execute("insert into jurisdiction (jurisdiction_code) values ('zzz')")
        self.sync()
        self.assert_same()

    def test_schema_change_rebuilds_that_table_only(self):
        self.sync()
        self.d1.con.execute('drop index "project_year_project_id"')
        messages = self.sync()
        self.assert_same()
        self.assertIn('alter table "project_year__new" rename to "project_year"', self.d1.log)
        self.assertEqual([s for s in self.d1.log if s.startswith('alter table')], ['alter table "project_year__new" rename to "project_year"'], messages)
        self.assertIn('project_year_project_id', {r[0] for r in self.d1.con.execute("select name from sqlite_master where type='index'")})

    def test_many_changes_rebuild(self):
        self.sync()
        self.duck.execute('update main."project_year" set "project_id" = \'all\'')
        self.sync()
        self.assert_same()
        self.assertIn('alter table "project_year__new" rename to "project_year"', self.d1.log)

    def test_full_rebuilds_every_table(self):
        self.sync()
        self.sync(full=True)
        self.assert_same()
        self.assertEqual(len([s for s in self.d1.log if s.startswith('alter table')]), len(self.tables))


    def test_jurisdiction_writes_only_that_jurisdiction(self):
        """その自治体だけの warehouse から流しても、他の自治体の行（親で絞る表も）は消えない。"""
        def origin(key, code, title):
            self.duck.execute('insert into main."expenditure_origin" ("origin_id", "jurisdiction_code", "title") values (?, ?, ?)',
                              [key, code, title])

        def location(key, origin_id):
            self.duck.execute('insert into main."expenditure_location" ("line_id", "origin_id", "kind") values (?, ?, ?)',
                              [key, origin_id, 'pdf'])

        origin('a1', '000001', 'x')
        origin('b1', '000002', 'x')
        location('la', 'a1')
        location('lb', 'b1')
        self.sync()
        before = {name: self.d1.rows(name, spec['primary_key']) for name, spec in self.tables.items()}
        # 000002 だけを build し直した warehouse: 000001 の行は無く、000002 は1行変わり1行増え、位置が1行消える
        for name in self.tables:
            self.duck.execute(f'delete from main."{name}"')
        self.add('jurisdiction', ['000002'], value='changed')
        origin('b1', '000002', 'changed')
        origin('b2', '000002', 'x')
        location('lb2', 'b2')
        messages = self.sync(jurisdictions=['000002'])
        self.assertFalse([s for s in self.d1.log if s.startswith(('drop table "', 'alter table', 'create table'))], messages)
        self.assertEqual(self.d1.rows('expenditure_origin', 'origin_id')[0], before['expenditure_origin'][0])  # a1
        self.assertEqual([r[0] for r in self.d1.rows('expenditure_origin', 'origin_id')], ['a1', 'b1', 'b2'])
        self.assertEqual([r[0] for r in self.d1.rows('expenditure_location', 'line_id')], ['la', 'lb2'])
        self.assertEqual([r[0] for r in self.d1.rows('jurisdiction', 'jurisdiction_code')], ['000000', '000001', '000002'])
        self.assertEqual(self.d1.rows('project_year', 'project_year_id'), before['project_year'])

    def test_jurisdiction_stops_on_schema_change(self):
        self.sync()
        self.d1.con.execute('drop index "project_year_project_id"')
        messages = []
        self.assertEqual(sync_d1.run(self.d1, self.duck, self.tables, False, ['000001'], False, messages.append), 1)
        self.assertIn('project_year', messages[-1])


if __name__ == '__main__':
    unittest.main()
