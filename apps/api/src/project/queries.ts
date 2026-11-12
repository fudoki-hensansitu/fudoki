// 事業の集約の問い合わせ。事業・年度・直下の事業は1つの batch（トランザクション）で読む。
// 評価シート・施策は別の集約なので返さない（事業の年度の expenditure_detail_id で、それぞれの検索から引く）。
import { columnsOf, PROJECT_TABLE, PROJECT_YEAR_SEARCH, PROJECT_YEAR_TABLE, selectListOf, toRow } from '../columns'
import { ApiError } from '../errors'
import type { Ctx } from '../shared/context'
import { searchRows } from '../shared/query'
import { MAX_BINDS, type SearchInput } from '../shared/search'
import { MAX_CHILDREN, type ProjectOutput, type ProjectSearchOutput } from './model'

const Y = PROJECT_YEAR_TABLE

/** 事業と、その年度・直下の事業 */
export async function getProject(ctx: Ctx, input: { project_id: string }): Promise<ProjectOutput> {
  const { db } = ctx
  const id = input.project_id
  const projectSelect = selectListOf(PROJECT_TABLE)
  const [root, years, children] = await db.batch([
    db.prepare(`SELECT ${projectSelect} FROM ${PROJECT_TABLE} WHERE "project_id" = ?`).bind(id),
    db.prepare(`SELECT ${Y.selectList} FROM ${Y.table} WHERE "project_id" = ? ORDER BY "fiscal_year"`).bind(id),
    db.prepare(`SELECT ${projectSelect} FROM ${PROJECT_TABLE} WHERE "parent_project_id" = ? ORDER BY "name", "project_id" LIMIT ?`).bind(id, MAX_CHILDREN),
  ])
  const r = root!.results[0]
  if (!r) throw new ApiError(404, 'NOT_FOUND', `事業が見つかりません: ${id}`)
  const projectColumns = columnsOf(PROJECT_TABLE)
  return {
    project: toRow(projectColumns, r),
    years: years!.results.map((y) => toRow(Y.columns, y)),
    children: children!.results.map((c) => toRow(projectColumns, c)),
  } as ProjectOutput
}

/** 事業の年度を探す。条件には事業の始め・終え・親も使える（検索の中で事業と JOIN する）。行の事業は projects で返す */
export async function searchProjects(ctx: Ctx, input: SearchInput): Promise<ProjectSearchOutput> {
  const { rows, next_page_token, total_size, total_size_capped } = await searchRows(PROJECT_YEAR_SEARCH, null, ctx, input, { count: true })
  const years = rows.map((r) => Object.fromEntries(Y.columns.map((c) => [c.name, r[c.name] ?? null])))
  const ids = [...new Set(years.map((r) => r.project_id as string))]
  const { db } = ctx
  const projectSelect = selectListOf(PROJECT_TABLE)
  const chunks = Array.from({ length: Math.ceil(ids.length / MAX_BINDS) }, (_, i) => ids.slice(i * MAX_BINDS, (i + 1) * MAX_BINDS))
  const found = chunks.length
    ? await db.batch(chunks.map((c) => db.prepare(`SELECT ${projectSelect} FROM ${PROJECT_TABLE} WHERE "project_id" IN (${c.map(() => '?').join(', ')}) ORDER BY "project_id"`).bind(...c)))
    : []
  const projectColumns = columnsOf(PROJECT_TABLE)
  const projects = found.flatMap((r) => r.results.map((p) => toRow(projectColumns, p as Record<string, unknown>)))
  return { project_years: years, projects, total_size, total_size_capped, next_page_token } as ProjectSearchOutput
}
