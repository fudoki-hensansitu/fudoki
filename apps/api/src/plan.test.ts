import { describe, expect, test } from 'bun:test'
import { DETAIL_TABLE, PROJECT_VIEW, PROJECT_YEAR_TABLE, SUBJECT_TABLE } from './columns'
import { buildWhere } from './shared/search'
import { testDb } from './testing'

// 年を IN に展開すると、複合 index の後続の列（document_kind・jurisdiction_code）が使われる。
const t = SUBJECT_TABLE
const { sqlite } = testDb()

function plan(fy: { min: number; max: number }, where: Parameters<typeof buildWhere>[3]) {
  const w = buildWhere(t, 'settlement', fy, where)
  const sql = `SELECT ${t.selectList} FROM ${t.table} WHERE ${w.sql} ORDER BY "subject_id" LIMIT ? OFFSET ?`
  const rows = sqlite.query(`EXPLAIN QUERY PLAN ${sql}`).all(...([...w.params, 101, 0] as never[])) as { detail: string }[]
  return rows.map((r) => r.detail).join('\n')
}

describe('EXPLAIN QUERY PLAN', () => {
  // 科目は自治体・年度を持たないので（ADR 0047）、根を (fiscal_year, document_kind, jurisdiction_code) で引き、根の ID と段で科目を引く
  test('COFOG の絞り込みは、年度・資料区分で根を引いてから根の下の科目を引く', () => {
    const p = plan({ min: 2021, max: 2025 }, { cofog_code: { prefix: '10.4' }, level: { eq: ['目'] } })
    expect(p).toMatch(/SEARCH e USING INDEX expenditure_fiscal_year_document_kind_jurisdiction_code \(fiscal_year=\? AND document_kind=\?\)/)
    expect(p).toMatch(/SEARCH x USING INDEX expenditure_subject_expenditure_id_level \(expenditure_id=\? AND level=\?\)/)
  })

  test('jurisdiction_code と level の等値が、根の index と (expenditure_id, level) の index に乗る', () => {
    const p = plan({ min: 2021, max: 2025 }, { jurisdiction_code: { eq: ['132039'] }, level: { eq: ['目'] } })
    expect(p).toMatch(/SEARCH e USING INDEX expenditure_fiscal_year_document_kind_jurisdiction_code \(fiscal_year=\? AND document_kind=\? AND jurisdiction_code=\?\)/)
    expect(p).toMatch(/SEARCH x USING INDEX expenditure_subject_expenditure_id_level \(expenditure_id=\? AND level=\?\)/)
  })

  test('所属の款・項と末端の判定は主キーと parent index で引く（表を走査しない）', () => {
    const p = plan({ min: 2025, max: 2025 }, { kan_name: { eq: ['総務費'] }, is_leaf: { eq: true } })
    expect(p).not.toMatch(/SCAN/)
    expect(p).toMatch(/SEARCH c USING COVERING INDEX expenditure_subject_parent_subject_id \(parent_subject_id=\?\)/)
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

  // 事業の名前・款項目は内訳の科目と根から求める。内訳の検索の副問い合わせを JOIN すると内訳の全行を作るので、表を直に引く
  test('事業と事業の年度は、指した内訳を主キーで引き、内訳の全行を作らない', () => {
    for (const table of [PROJECT_YEAR_TABLE.table, PROJECT_VIEW]) {
      const rows = sqlite.query(`EXPLAIN QUERY PLAN SELECT * FROM ${table} WHERE project_id = ?`).all('x') as { detail: string }[]
      const p = rows.map((r) => r.detail).join('\n')
      expect(p).not.toMatch(/MATERIALIZE|SCAN|AUTOMATIC/)
      expect(p).toMatch(/SEARCH i USING INDEX sqlite_autoindex_expenditure_detail_1 \(detail_id=\?\)/)
    }
  })
})
