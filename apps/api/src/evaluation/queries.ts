// 事業評価の集約の問い合わせ。根・シート・出典は1つの batch（トランザクション）で読み、同期の入れ替えをまたいで食い違わないようにする。
import {
  EVALUATION_INDICATOR_TABLE,
  EVALUATION_INDICATOR_VALUE_TABLE,
  EVALUATION_ORIGIN_TABLE,
  EVALUATION_SHEET_TABLE,
  EVALUATION_TABLE,
  columnsOf,
  selectListOf,
  toRow,
} from '../columns'
import { ApiError } from '../errors'
import type { Ctx } from '../shared/context'
import { decodeToken, nextToken } from '../shared/paging'
import { searchRows } from '../shared/query'
import { DEFAULT_PAGE_SIZE, type SearchInput } from '../shared/search'
import { outlookOf, type EvaluationOutput, type SheetOutput, type SheetSearchOutput } from './model'

const ORIGIN = { table: EVALUATION_ORIGIN_TABLE, selectList: selectListOf(EVALUATION_ORIGIN_TABLE) }
const S = EVALUATION_SHEET_TABLE
const rows = (table: string, results: Record<string, unknown>[]) => results.map((r) => toRow(columnsOf(table), r))
/** シートの行に、方向性の区分から組み立てた outlook を足す */
const withOutlook = <T extends Record<string, unknown>>(row: T) => ({ ...row, outlook: outlookOf((row.direction_code as string | null) ?? null) })

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
  const [root, sheets, origins] = await db.batch([
    db.prepare(`SELECT ${selectListOf(EVALUATION_TABLE)} FROM ${EVALUATION_TABLE} WHERE "evaluation_id" = ?`).bind(id),
    db.prepare(`SELECT ${S.selectList} FROM ${S.table} WHERE "evaluation_id" = ? ORDER BY "origin_id", "page", "sheet_id" LIMIT ? OFFSET ?`).bind(id, limit + 1, offset),
    db.prepare(`SELECT ${ORIGIN.selectList} FROM ${ORIGIN.table} WHERE "evaluation_id" = ? ORDER BY "origin_id"`).bind(id),
  ])
  const r = root!.results[0]
  if (!r) throw new ApiError(404, 'NOT_FOUND', `事業評価が見つかりません: ${id}`)
  const more = sheets!.results.length > limit
  return {
    evaluation: toRow(columnsOf(EVALUATION_TABLE), r),
    sheets: rows(S.table, sheets!.results.slice(0, limit)).map(withOutlook),
    next_page_token: more ? await nextToken(offset + limit, fp) : null,
    origins: rows(ORIGIN.table, origins!.results),
  } as EvaluationOutput
}

/** 評価シート1枚と、その指標・年度ごとの値・出典 */
export async function getSheet(ctx: Ctx, input: { sheet_id: string }): Promise<SheetOutput> {
  const { db } = ctx
  const id = input.sheet_id
  const I = EVALUATION_INDICATOR_TABLE
  const V = EVALUATION_INDICATOR_VALUE_TABLE
  const valueList = columnsOf(V).map((c) => `v."${c.name}"`).join(', ')
  const [sheet, indicators, values, origins] = await db.batch([
    db.prepare(`SELECT ${S.selectList} FROM ${S.table} WHERE "sheet_id" = ?`).bind(id),
    db.prepare(`SELECT ${selectListOf(I)} FROM ${I} WHERE "sheet_id" = ? ORDER BY "position", "indicator_id"`).bind(id),
    db
      .prepare(`SELECT ${valueList} FROM ${V} v JOIN ${I} i ON i."indicator_id" = v."indicator_id" WHERE i."sheet_id" = ? ORDER BY i."position", v."fiscal_year", v."value_id"`)
      .bind(id),
    db.prepare(`SELECT ${ORIGIN.selectList} FROM ${ORIGIN.table} WHERE "origin_id" IN (SELECT "origin_id" FROM ${S.table} WHERE "sheet_id" = ?)`).bind(id),
  ])
  const r = sheet!.results[0]
  if (!r) throw new ApiError(404, 'NOT_FOUND', `評価シートが見つかりません: ${id}`)
  return {
    sheet: withOutlook(toRow(S.columns, r)),
    indicators: rows(I, indicators!.results),
    indicator_values: rows(V, values!.results),
    origins: rows(ORIGIN.table, origins!.results),
  } as SheetOutput
}

export async function searchSheets(ctx: Ctx, input: SearchInput): Promise<SheetSearchOutput> {
  const { rows: sheets, ...rest } = await searchRows(S, ORIGIN, ctx, input)
  return { sheets: sheets.map(withOutlook), ...rest } as SheetSearchOutput
}
