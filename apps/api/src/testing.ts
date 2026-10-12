import { Database } from 'bun:sqlite'
import { readFileSync } from 'node:fs'
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
  columns: { name: string; type: string }[]
}
const TABLES = (columnsJson as unknown as { tables: Record<string, TableJson> }).tables

/** columns.json から表を作る。木の表の主キーは node_id、origin は origin_id（index は問い合わせの形の分だけ）。 */
function createTables(sqlite: Database) {
  for (const [table, t] of Object.entries(TABLES)) {
    const key = table === 'origin' ? 'origin_id' : 'node_id'
    const cols = t.columns.map((c) => `"${c.name}" ${c.type === 'string' ? 'text' : c.type === 'number' ? 'real' : 'integer'}`)
    sqlite.exec(`CREATE TABLE ${table} (${cols.join(', ')}, PRIMARY KEY (${key}))`)
    if (table !== 'origin') {
      sqlite.exec(`CREATE INDEX ${table}_scope ON ${table} (fiscal_year, jurisdiction_code, node_kind)`)
      sqlite.exec(`CREATE INDEX ${table}_cofog ON ${table} (fiscal_year, cofog_code)`)
      sqlite.exec(`CREATE INDEX ${table}_parent ON ${table} (parent_node_id)`)
    }
  }
}

export function testDb(): { db: Db; sqlite: Database } {
  const sqlite = new Database(':memory:')
  sqlite.exec(readFileSync(new URL('../migrations/0001_init.sql', import.meta.url), 'utf8'))
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
  const full = { jurisdiction_code: '132039', fiscal_year: 2024, account_name: '一般会計', ...rest }
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
