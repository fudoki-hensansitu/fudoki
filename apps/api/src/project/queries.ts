// 事業の集約の問い合わせ。事業・年度・直下の事業・評価シート・施策は1つの batch（トランザクション）で読む。
import { BUDGET_MEASURE_TABLE, columnsOf, EVALUATION_SHEET_TABLE, PROJECT_TABLE, PROJECT_YEAR_TABLE, selectListOf, toRow } from '../columns'
import { ApiError } from '../errors'
import type { Ctx } from '../shared/context'
import { searchRows } from '../shared/query'
import type { SearchInput } from '../shared/search'
import { MAX_CHILDREN, type ProjectOutput, type ProjectSearchOutput } from './model'

const Y = PROJECT_YEAR_TABLE
const S = EVALUATION_SHEET_TABLE
const M = BUDGET_MEASURE_TABLE

/** 事業と、その年度・直下の事業・評価シート・施策 */
export async function getProject(ctx: Ctx, input: { project_id: string }): Promise<ProjectOutput> {
  const { db } = ctx
  const id = input.project_id
  const projectSelect = selectListOf(PROJECT_TABLE)
  const [root, years, children, sheets, measures] = await db.batch([
    db.prepare(`SELECT ${projectSelect} FROM ${PROJECT_TABLE} WHERE "project_id" = ?`).bind(id),
    db.prepare(`SELECT ${Y.selectList} FROM ${Y.table} WHERE "project_id" = ? ORDER BY "fiscal_year"`).bind(id),
    db.prepare(`SELECT ${projectSelect} FROM ${PROJECT_TABLE} WHERE "parent_project_id" = ? ORDER BY "name", "project_id" LIMIT ?`).bind(id, MAX_CHILDREN),
    db
      .prepare(`SELECT ${S.selectList} FROM ${S.table} WHERE "detail_id" IN (SELECT "settlement_detail_id" FROM ${Y.table} WHERE "project_id" = ?) ORDER BY "fiscal_year", "sheet_id"`)
      .bind(id),
    db
      .prepare(`SELECT ${M.selectList} FROM ${M.table} WHERE "detail_id" IN (SELECT "budget_detail_id" FROM ${Y.table} WHERE "project_id" = ?) ORDER BY "fiscal_year", "measure_id"`)
      .bind(id),
  ])
  const r = root!.results[0]
  if (!r) throw new ApiError(404, 'NOT_FOUND', `事業が見つかりません: ${id}`)
  const projectColumns = columnsOf(PROJECT_TABLE)
  return {
    project: toRow(projectColumns, r),
    years: years!.results.map((y) => toRow(Y.columns, y)),
    children: children!.results.map((c) => toRow(projectColumns, c)),
    evaluation_sheets: sheets!.results.map((s) => toRow(S.columns, s)),
    budget_measures: measures!.results.map((m) => toRow(M.columns, m)),
  } as ProjectOutput
}

export async function searchProjects(ctx: Ctx, input: SearchInput): Promise<ProjectSearchOutput> {
  const { rows, next_page_token } = await searchRows(Y, null, ctx, input)
  return { project_years: rows, next_page_token } as ProjectSearchOutput
}
