import { Database } from 'bun:sqlite'
import { readdirSync, readFileSync } from 'node:fs'
import columnsJson from './columns.json'
import type { Db, Statement } from './db'

// テスト用: bun:sqlite を D1 の prepare / bind / all / first / batch に被せる。
class SqliteStatement implements Statement {
  constructor(
    private readonly db: Database,
    readonly sql: string,
    private readonly params: unknown[] = []
  ) {}
  bind(...values: unknown[]) {
    return new SqliteStatement(this.db, this.sql, values)
  }
  async all<T>() {
    return { results: this.db.query(this.sql).all(...(this.params as never[])) as T[] }
  }
  async first<T>() {
    return (this.db.query(this.sql).get(...(this.params as never[])) as T | null) ?? null
  }
}

interface TableJson {
  primary_key: string
  indexes: string[][]
  columns: { name: string; type: string; nullable?: boolean }[]
}
const TABLES = (columnsJson as unknown as { tables: Record<string, TableJson> }).tables

/** columns.json の主キーと index で表を作る（D1 と同じ形）。 */
function createTables(sqlite: Database) {
  for (const [table, t] of Object.entries(TABLES)) {
    const cols = t.columns.map((c) => `"${c.name}" ${c.type === 'string' ? 'text' : c.type === 'number' ? 'real' : 'integer'}`)
    sqlite.exec(`CREATE TABLE ${table} (${cols.join(', ')}, PRIMARY KEY (${t.primary_key}))`)
    for (const index of t.indexes) sqlite.exec(`CREATE INDEX ${table}_${index.join('_')} ON ${table} (${index.join(', ')})`)
  }
}

export function testDb(): { db: Db; sqlite: Database } {
  const sqlite = new Database(':memory:')
  const migrations = new URL('../migrations/', import.meta.url)
  for (const file of readdirSync(migrations).filter((f) => f.endsWith('.sql')).sort()) sqlite.exec(readFileSync(new URL(file, migrations), 'utf8'))
  createTables(sqlite)
  const db: Db = {
    prepare: (sql) => new SqliteStatement(sqlite, sql),
    async batch(statements) {
      return Promise.all(statements.map((s) => s.all())) as never
    },
  }
  return { db, sqlite }
}

function insertRow(sqlite: Database, table: string, defaults: Record<string, unknown>, row: Record<string, unknown>) {
  // 非 NULL の列は、指定が無ければ型ごとの既定値で埋める（MCP の outputSchema の検査に通る行にする）
  const required = Object.fromEntries(TABLES[table]!.columns.filter((c) => c.nullable === false).map((c) => [c.name, c.type === 'string' ? 'x' : 1]))
  const full = { ...required, ...defaults, ...row }
  const keys = Object.keys(full)
  sqlite.query(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...(Object.values(full) as never[]))
}

const PHASE: Record<string, string> = { settlement: 'executed', initial: 'approved' }
const docDefaults = (row: Record<string, unknown>) => {
  const kind = (row.document_kind as string | undefined) ?? 'settlement'
  return { jurisdiction_code: '132039', fiscal_year: 2024, account_name: '一般会計', account_kind: '一般会計', document_kind: kind, amount_phase: PHASE[kind] }
}

/** marts と同じく、科目・内訳の1行ごとに印字の位置の行を置く（出典はここから引く）。 */
function insertOwnLocation(sqlite: Database, rowId: unknown, originId: unknown) {
  if (originId !== undefined && originId !== null) insertLocation(sqlite, { line_id: rowId as string, origin_id: originId as string })
}

/** 科目の表の1行。subject_id を省くと node_key と同じにする。origin_id があれば印字の位置の行も置く。 */
export function insertSubject(sqlite: Database, row: Record<string, string | number | null>) {
  const id = row.subject_id ?? row.node_key ?? crypto.randomUUID()
  insertRow(sqlite, 'expenditure_subject', { ...docDefaults(row), subject_id: id, node_key: id, level: '目', is_leaf: row.level && row.level !== '目' ? 0 : 1 }, row)
  insertOwnLocation(sqlite, id, row.origin_id)
}

/** 内訳の表の1行。origin_id があれば印字の位置の行も置く。 */
export function insertDetail(sqlite: Database, row: Record<string, string | number | null>) {
  const id = row.detail_id ?? row.node_key ?? crypto.randomUUID()
  insertRow(sqlite, 'expenditure_detail', { ...docDefaults(row), detail_id: id, node_key: id, breakdown: '事業', source_heading: '備考', node_kind: '内訳1', depth: 1, is_leaf: 1, is_subject_remainder: 0 }, row)
  insertOwnLocation(sqlite, id, row.origin_id)
}

/** 印字の位置の1行。 */
export function insertLocation(sqlite: Database, row: Record<string, string | number | null>) {
  insertRow(sqlite, 'expenditure_location', { kind: 'pdf' }, row)
}

/** origin の列は columns.json にあるものだけ入れる。 */
export function insertOrigin(sqlite: Database, row: Record<string, string | number | null>) {
  const names = new Set(TABLES.expenditure_origin!.columns.map((c) => c.name))
  const full = Object.entries({ jurisdiction_code: '132039', fiscal_year: 2024, document_kind: 'settlement', format: 'pdf', ...row }).filter(([k]) => names.has(k))
  sqlite
    .query(`INSERT INTO expenditure_origin (${full.map(([k]) => k).join(',')}) VALUES (${full.map(() => '?').join(',')})`)
    .run(...(full.map(([, v]) => v) as never[]))
}

/** 自治体マスタの1行。 */
export function insertJurisdiction(sqlite: Database, row: { jurisdiction_code: string; name: string; prefecture_name?: string; official_url?: string }) {
  const prefecture_code = row.jurisdiction_code.slice(0, 2)
  sqlite
    .query('INSERT INTO jurisdiction (jurisdiction_code, name, prefecture_code, prefecture_name, ocd_id, official_url) VALUES (?, ?, ?, ?, ?, ?)')
    .run(row.jurisdiction_code, row.name, prefecture_code, row.prefecture_name ?? '東京都', `ocd-division/country:jp/prefecture:${prefecture_code}/city:${row.jurisdiction_code}`, row.official_url ?? null)
}

/** 歳出の根の1行と、出典との組。ID は行の中身から作る（一意であればよい）。 */
export function insertCoverage(
  sqlite: Database,
  row: { jurisdiction_code: string; fiscal_year: number; document_kind: string; account_name: string; account_kind?: string; origin_id: string; amounts?: Record<string, number> }
) {
  const { amounts = {}, ...full } = { account_kind: row.account_name, ...row }
  const id = JSON.stringify([full.jurisdiction_code, full.fiscal_year, full.document_kind, full.account_name])
  const columns = ['expenditure_id', 'jurisdiction_code', 'fiscal_year', 'document_kind', 'account_name', 'account_kind', ...Object.keys(amounts)]
  sqlite
    .query(`INSERT OR IGNORE INTO expenditure (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`)
    .run(id, full.jurisdiction_code, full.fiscal_year, full.document_kind, full.account_name, full.account_kind, ...Object.values(amounts))
  sqlite
    .query('INSERT INTO expenditure_origin_link (link_id, expenditure_id, origin_id) VALUES (?, ?, ?)')
    .run(JSON.stringify([id, full.origin_id]), id, full.origin_id)
}
