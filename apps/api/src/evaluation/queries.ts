// 事業評価の集約の問い合わせ。根・シート・出典は1つの batch（トランザクション）で読み、同期の入れ替えをまたいで食い違わないようにする。
import {
  EVALUATION_INDICATOR_TABLE,
  EVALUATION_INDICATOR_VALUE_TABLE,
  EVALUATION_ORIGIN_TABLE,
  EVALUATION_SHEET_PROJECT_TABLE,
  EVALUATION_SHEET_SEARCH,
  EVALUATION_SHEET_TABLE,
  EVALUATION_TABLE,
  columnsOf,
  selectListOf,
  toRow,
} from '../columns'
import { ApiError } from '../errors'
import type { Ctx } from '../shared/context'
import { decodeToken, nextToken } from '../shared/paging'
import { searchRows, withExtra, type Condition } from '../shared/query'
import { DEFAULT_PAGE_SIZE, buildWhere, type SearchInput } from '../shared/search'
import { outlookOf, type EvaluationOutput, type SheetCountOutput, type SheetOutput, type SheetSearchOutput } from './model'

const ORIGIN = { table: EVALUATION_ORIGIN_TABLE, selectList: selectListOf(EVALUATION_ORIGIN_TABLE) }
const S = EVALUATION_SHEET_TABLE
const rows = (table: string, results: Record<string, unknown>[]) => results.map((r) => toRow(columnsOf(table), r))
const L = EVALUATION_SHEET_PROJECT_TABLE
/** シートの行に、方向性の区分から組み立てた outlook と、つないだ事業を足す */
const withDerived =
  (projects: Map<string, string[]>) =>
  <T extends Record<string, unknown>>(row: T) => ({
    ...row,
    outlook: outlookOf((row.direction_code as string | null) ?? null),
    project_ids: projects.get(row.sheet_id as string) ?? [],
  })

/** シートの ID の並び（JSON 1つを bind する。bind の数の上限に掛からない）からつないだ事業を引く文 */
const LINKS_OF_SHEETS = `SELECT "sheet_id", "project_id" FROM ${L} WHERE "sheet_id" IN (SELECT value FROM json_each(?)) ORDER BY "sheet_id", "project_id"`
const projectsOf = (results: Record<string, unknown>[]) => {
  const out = new Map<string, string[]>()
  for (const r of results) out.set(r.sheet_id as string, [...(out.get(r.sheet_id as string) ?? []), r.project_id as string])
  return out
}
const readProjects = async (ctx: Ctx, sheetIds: string[]) =>
  sheetIds.length ? projectsOf((await ctx.db.prepare(LINKS_OF_SHEETS).bind(JSON.stringify(sheetIds)).all()).results) : new Map<string, string[]>()

/** project_ids の入力を、つないだ事業で絞る条件にする */
const byProjects = (projectIds: string[] | undefined): Condition | undefined =>
  projectIds ? { sql: `"sheet_id" IN (SELECT "sheet_id" FROM ${L} WHERE "project_id" IN (SELECT value FROM json_each(?)))`, params: [JSON.stringify(projectIds)] } : undefined

export interface EvaluationInput {
  evaluation_id: string
  page_size?: number
  page_token?: string
}

/** 事業評価の根と、その年度の出典・評価シート（ページ） */
export async function getEvaluation(ctx: Ctx, input: EvaluationInput): Promise<EvaluationOutput> {
  const { db } = ctx
  const id = input.evaluation_id
  const limit = input.page_size ?? DEFAULT_PAGE_SIZE
  const fp = ['get_evaluation', id]
  const offset = await decodeToken(input.page_token, fp)
  const page = `SELECT "sheet_id" FROM ${S.table} WHERE "evaluation_id" = ? ORDER BY "origin_id", "page", "sheet_id" LIMIT ? OFFSET ?`
  const [root, sheets, origins, links] = await db.batch([
    db.prepare(`SELECT ${selectListOf(EVALUATION_TABLE)} FROM ${EVALUATION_TABLE} WHERE "evaluation_id" = ?`).bind(id),
    db.prepare(`SELECT ${S.selectList} FROM ${S.table} WHERE "evaluation_id" = ? ORDER BY "origin_id", "page", "sheet_id" LIMIT ? OFFSET ?`).bind(id, limit + 1, offset),
    db.prepare(`SELECT ${ORIGIN.selectList} FROM ${ORIGIN.table} WHERE "evaluation_id" = ? ORDER BY "origin_id"`).bind(id),
    db.prepare(`SELECT "sheet_id", "project_id" FROM ${L} WHERE "sheet_id" IN (${page}) ORDER BY "sheet_id", "project_id"`).bind(id, limit, offset),
  ])
  const r = root!.results[0]
  if (!r) throw new ApiError(404, 'NOT_FOUND', `事業評価が見つかりません: ${id}`)
  const more = sheets!.results.length > limit
  return {
    evaluation: toRow(columnsOf(EVALUATION_TABLE), r),
    sheets: rows(S.table, sheets!.results.slice(0, limit)).map(withDerived(projectsOf(links!.results))),
    next_page_token: more ? await nextToken(offset + limit, fp) : null,
    origins: rows(ORIGIN.table, origins!.results),
  } as unknown as EvaluationOutput
}

/** 評価シート1枚と、その指標・年度ごとの値・出典 */
export async function getSheet(ctx: Ctx, input: { sheet_id: string }): Promise<SheetOutput> {
  const { db } = ctx
  const id = input.sheet_id
  const I = EVALUATION_INDICATOR_TABLE
  const V = EVALUATION_INDICATOR_VALUE_TABLE
  const valueList = columnsOf(V).map((c) => `v."${c.name}"`).join(', ')
  const [sheet, indicators, values, origins, links] = await db.batch([
    db.prepare(`SELECT ${S.selectList} FROM ${S.table} WHERE "sheet_id" = ?`).bind(id),
    db.prepare(`SELECT ${selectListOf(I)} FROM ${I} WHERE "sheet_id" = ? ORDER BY "position", "indicator_id"`).bind(id),
    db
      .prepare(`SELECT ${valueList} FROM ${V} v JOIN ${I} i ON i."indicator_id" = v."indicator_id" WHERE i."sheet_id" = ? ORDER BY i."position", v."fiscal_year", v."value_id"`)
      .bind(id),
    db.prepare(`SELECT ${ORIGIN.selectList} FROM ${ORIGIN.table} WHERE "origin_id" IN (SELECT "origin_id" FROM ${S.table} WHERE "sheet_id" = ?)`).bind(id),
    db.prepare(`SELECT "sheet_id", "project_id" FROM ${L} WHERE "sheet_id" = ? ORDER BY "project_id"`).bind(id),
  ])
  const r = sheet!.results[0]
  if (!r) throw new ApiError(404, 'NOT_FOUND', `評価シートが見つかりません: ${id}`)
  return {
    sheet: withDerived(projectsOf(links!.results))(toRow(S.columns, r)),
    indicators: rows(I, indicators!.results),
    indicator_values: rows(V, values!.results),
    origins: rows(ORIGIN.table, origins!.results),
  } as unknown as SheetOutput
}

export type SheetSearch = SearchInput & { project_ids?: string[] }

export async function searchSheets(ctx: Ctx, input: SheetSearch): Promise<SheetSearchOutput> {
  const { rows: found, ...rest } = await searchRows(EVALUATION_SHEET_SEARCH, ORIGIN, ctx, input, { extra: byProjects(input.project_ids) })
  const sheets = found.map((r) => Object.fromEntries(S.columns.map((c) => [c.name, r[c.name] ?? null])))
  const projects = await readProjects(ctx, sheets.map((r) => r.sheet_id as string))
  return { sheets: sheets.map(withDerived(projects)), ...rest } as unknown as SheetSearchOutput
}

/** 条件に当たるシートの数を、方向性の区分ごとに数える（web の事業評価の A〜D の札。シートを全部は読まない）。並び・頁の入力は使わない */
export async function countSheets(ctx: Ctx, input: SheetSearch): Promise<SheetCountOutput> {
  const T = EVALUATION_SHEET_SEARCH
  const where = withExtra(buildWhere(T, undefined, input.fiscal_year, input.where as never), byProjects(input.project_ids))
  const r = await ctx.db
    .prepare(`SELECT "direction_code", COUNT(*) AS n FROM ${T.table} WHERE ${where.sql} GROUP BY "direction_code" ORDER BY "direction_code"`)
    .bind(...where.params)
    .all<{ direction_code: string | null; n: number }>()
  return { counts: r.results.map((c) => ({ outlook: outlookOf(c.direction_code), size: Number(c.n) })) } as SheetCountOutput
}
