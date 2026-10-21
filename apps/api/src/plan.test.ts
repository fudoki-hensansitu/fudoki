import { describe, expect, test } from 'bun:test'
import { NODE_TABLES } from './columns'
import { buildWhere } from './search'
import { testDb } from './testing'

// 年を IN に展開すると、複合 index の後続の列（cofog_code・jurisdiction_code・node_kind）が使われる。
const t = NODE_TABLES.get('settlement')!
const { sqlite } = testDb()

function plan(fy: { min: number; max: number }, where: Parameters<typeof buildWhere>[2]) {
  const w = buildWhere(t, fy, where)
  const sql = `SELECT ${t.selectList} FROM ${t.table} WHERE ${w.sql} ORDER BY "node_id" LIMIT ? OFFSET ?`
  const rows = sqlite.query(`EXPLAIN QUERY PLAN ${sql}`).all(...([...w.params, 101, 0] as never[])) as { detail: string }[]
  return rows.map((r) => r.detail).join('\n')
}

describe('EXPLAIN QUERY PLAN', () => {
  test('cofog_code の prefix が (fiscal_year, cofog_code) の index に乗る', () => {
    const p = plan({ min: 2021, max: 2025 }, { cofog_code: { prefix: '10.4' }, node_kind: { eq: ['目'] } })
    expect(p).toMatch(/USING INDEX \w+_fiscal_year_cofog_code \(fiscal_year=\? AND cofog_code>\? AND cofog_code<\?\)/)
  })

  test('jurisdiction_code と node_kind の等値が (fiscal_year, jurisdiction_code, node_kind) の index に乗る', () => {
    const p = plan({ min: 2021, max: 2025 }, { jurisdiction_code: { eq: ['132039'] }, node_kind: { eq: ['目'] } })
    expect(p).toMatch(/USING INDEX \w+_fiscal_year_jurisdiction_code_node_kind \(fiscal_year=\? AND jurisdiction_code=\? AND node_kind=\?\)/)
  })

  test('年が1つでも同じ index に乗る', () => {
    const p = plan({ min: 2025, max: 2025 }, { jurisdiction_code: { eq: ['132039'] }, node_kind: { eq: ['目'] } })
    expect(p).toMatch(/_fiscal_year_jurisdiction_code_node_kind \(fiscal_year=\? AND jurisdiction_code=\? AND node_kind=\?\)/)
  })

  test('子を辿る問い合わせは parent index', () => {
    const rows = sqlite.query(`EXPLAIN QUERY PLAN SELECT * FROM ${t.table} WHERE parent_node_id = ? ORDER BY "axis", "node_id" LIMIT ? OFFSET ?`).all('x', 10, 0) as { detail: string }[]
    expect(rows.map((r) => r.detail).join('\n')).toMatch(/_parent_node_id \(parent_node_id=\?\)/)
  })

  test('自治体のページの収録範囲は jurisdiction_code の index で引く', () => {
    const rows = sqlite
      .query(`EXPLAIN QUERY PLAN SELECT * FROM expenditure_coverage WHERE jurisdiction_code IN (SELECT jurisdiction_code FROM jurisdiction_master ORDER BY jurisdiction_code LIMIT ? OFFSET ?)`)
      .all(10, 0) as { detail: string }[]
    expect(rows.map((r) => r.detail).join('\n')).toMatch(/expenditure_coverage USING INDEX expenditure_coverage_jurisdiction_code \(jurisdiction_code=\?\)/)
  })
})
