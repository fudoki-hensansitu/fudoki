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

const NODE_TABLE = { settlement: 'settlement_expenditure_node', initial: 'initial_expenditure_node' } as const

/** document_kind は表の選択に使い、列には入れない。 */
export function insertNode(
  sqlite: Database,
  row: Record<string, string | number | null> & { document_kind: keyof typeof NODE_TABLE }
) {
  const { document_kind, ...rest } = row
  // 非 NULL の列は、指定が無ければ型ごとの既定値で埋める（MCP の outputSchema の検査に通る行にする）
  const required = Object.fromEntries(
    TABLES[NODE_TABLE[document_kind]]!.columns.filter((c) => c.nullable === false).map((c) => [c.name, c.type === 'string' ? 'x' : 1])
  )
  const full = { ...required, jurisdiction_code: '132039', fiscal_year: 2024, account_name: '一般会計', ...rest }
  const keys = Object.keys(full)
  sqlite
    .query(`INSERT INTO ${NODE_TABLE[document_kind]} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`)
    .run(...(Object.values(full) as never[]))
}

/** origin の列は columns.json にあるものだけ入れる。 */
export function insertOrigin(sqlite: Database, row: Record<string, string | number | null>) {
  const names = new Set(TABLES.origin!.columns.map((c) => c.name))
  const full = Object.entries({ jurisdiction_code: '132039', fiscal_year: 2024, document_kind: 'settlement', format: 'pdf', ...row }).filter(([k]) => names.has(k))
  sqlite
    .query(`INSERT INTO origin (${full.map(([k]) => k).join(',')}) VALUES (${full.map(() => '?').join(',')})`)
    .run(...(full.map(([, v]) => v) as never[]))
}

/** 自治体マスタの1行。 */
export function insertJurisdiction(sqlite: Database, row: { jurisdiction_code: string; name: string; prefecture_name?: string }) {
  const prefecture_code = row.jurisdiction_code.slice(0, 2)
  sqlite
    .query('INSERT INTO jurisdiction_master (jurisdiction_code, name, prefecture_code, prefecture_name, ocd_id) VALUES (?, ?, ?, ?, ?)')
    .run(row.jurisdiction_code, row.name, prefecture_code, row.prefecture_name ?? '東京都', `ocd-division/country:jp/prefecture:${prefecture_code}/city:${row.jurisdiction_code}`)
}

/** 収録範囲の1行。coverage_id は行の中身から作る（一意であればよい）。 */
export function insertCoverage(
  sqlite: Database,
  row: { jurisdiction_code: string; fiscal_year: number; document_kind: string; account_name: string; account_kind?: string; origin_id: string }
) {
  const full = { account_kind: row.account_name, ...row }
  sqlite
    .query('INSERT INTO expenditure_coverage (coverage_id, jurisdiction_code, fiscal_year, document_kind, account_name, account_kind, origin_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(JSON.stringify(full), full.jurisdiction_code, full.fiscal_year, full.document_kind, full.account_name, full.account_kind, full.origin_id)
}
