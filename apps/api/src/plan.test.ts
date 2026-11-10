import { describe, expect, test } from 'bun:test'
import { DETAIL_TABLE, SUBJECT_TABLE } from './columns'
import { buildWhere } from './search'
import { testDb } from './testing'

// 年を IN に展開すると、複合 index の後続の列（document_kind・cofog_code・jurisdiction_code・level）が使われる。
const t = SUBJECT_TABLE
const { sqlite } = testDb()

function plan(fy: { min: number; max: number }, where: Parameters<typeof buildWhere>[3]) {
  const w = buildWhere(t, 'settlement', fy, where)
  const sql = `SELECT ${t.selectList} FROM ${t.table} WHERE ${w.sql} ORDER BY "subject_id" LIMIT ? OFFSET ?`
  const rows = sqlite.query(`EXPLAIN QUERY PLAN ${sql}`).all(...([...w.params, 101, 0] as never[])) as { detail: string }[]
  return rows.map((r) => r.detail).join('\n')
}

describe('EXPLAIN QUERY PLAN', () => {
  test('cofog_code の prefix が (fiscal_year, document_kind, cofog_code) の index に乗る', () => {
    const p = plan({ min: 2021, max: 2025 }, { cofog_code: { prefix: '10.4' }, level: { eq: ['目'] } })
    expect(p).toMatch(/USING INDEX \w+_fiscal_year_document_kind_cofog_code \(fiscal_year=\? AND document_kind=\? AND cofog_code>\? AND cofog_code<\?\)/)
  })

  test('jurisdiction_code と level の等値が (fiscal_year, document_kind, jurisdiction_code, level) の index に乗る', () => {
    const p = plan({ min: 2021, max: 2025 }, { jurisdiction_code: { eq: ['132039'] }, level: { eq: ['目'] } })
    expect(p).toMatch(/USING INDEX \w+_fiscal_year_document_kind_jurisdiction_code_level \(fiscal_year=\? AND document_kind=\? AND jurisdiction_code=\? AND level=\?\)/)
  })

  test('年が1つでも同じ index に乗る', () => {
    const p = plan({ min: 2025, max: 2025 }, { jurisdiction_code: { eq: ['132039'] }, level: { eq: ['目'] } })
    expect(p).toMatch(/_fiscal_year_document_kind_jurisdiction_code_level \(fiscal_year=\? AND document_kind=\? AND jurisdiction_code=\? AND level=\?\)/)
  })

  test('子の科目を辿る問い合わせは parent index', () => {
    const rows = sqlite.query(`EXPLAIN QUERY PLAN SELECT * FROM ${t.table} WHERE parent_subject_id = ? ORDER BY "code", "subject_id" LIMIT ?`).all('x', 10) as { detail: string }[]
    expect(rows.map((r) => r.detail).join('\n')).toMatch(/_parent_subject_id \(parent_subject_id=\?\)/)
  })

  test('科目の内訳は (subject_id, breakdown, depth) の index で引く', () => {
    const rows = sqlite
      .query(`EXPLAIN QUERY PLAN SELECT * FROM ${DETAIL_TABLE.table} WHERE subject_id = ? AND depth = 1 ORDER BY "breakdown", "detail_id" LIMIT ? OFFSET ?`)
      .all('x', 10, 0) as { detail: string }[]
    expect(rows.map((r) => r.detail).join('\n')).toMatch(/_subject_id_breakdown_depth \(subject_id=\?/)
  })

  test('自治体のページの収録範囲は jurisdiction_code の index で引く', () => {
    const rows = sqlite
      .query(`EXPLAIN QUERY PLAN SELECT * FROM expenditure WHERE jurisdiction_code IN (SELECT jurisdiction_code FROM jurisdiction ORDER BY jurisdiction_code LIMIT ? OFFSET ?)`)
      .all(10, 0) as { detail: string }[]
    expect(rows.map((r) => r.detail).join('\n')).toMatch(/expenditure USING INDEX expenditure_jurisdiction_code \(jurisdiction_code=\?\)/)
  })
})
