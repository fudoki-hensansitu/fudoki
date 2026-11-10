// 歳出の集約の問い合わせ。行と出典は1つの batch（トランザクション）で読み、同期の入れ替えをまたいで食い違わないようにする。
import { DETAIL_TABLE, LOCATION_SELECT_LIST, LOCATION_TABLE, ORIGIN_SELECT_LIST, ORIGIN_TABLE, SUBJECT_TABLE, toRow, type Row } from '../columns'
import { ApiError } from '../errors'
import type { Ctx } from '../shared/context'
import { decodeToken, nextToken } from '../shared/paging'
import { searchRows } from '../shared/query'
import { DEFAULT_PAGE_SIZE, type SearchInput } from '../shared/search'
import type { DetailSearchOutput, LineOutput, SubjectSearchOutput } from './model'

const EXPENDITURE_ORIGIN = { table: ORIGIN_TABLE, selectList: ORIGIN_SELECT_LIST }

export async function searchSubjects(ctx: Ctx, input: SearchInput): Promise<SubjectSearchOutput> {
  const { rows, ...rest } = await searchRows(SUBJECT_TABLE, EXPENDITURE_ORIGIN, ctx, input)
  return { subjects: rows, ...rest } as SubjectSearchOutput
}

export async function searchDetails(ctx: Ctx, input: SearchInput): Promise<DetailSearchOutput> {
  const { rows, ...rest } = await searchRows(DETAIL_TABLE, EXPENDITURE_ORIGIN, ctx, input)
  return { details: rows, ...rest } as DetailSearchOutput
}

/** 印字の位置と出典を、取得した行の ID の集合から引く文（1つの batch に入れる）。 */
const locationsOf = (ctx: Ctx, ids: string) =>
  ctx.db.prepare(`SELECT ${LOCATION_SELECT_LIST} FROM ${LOCATION_TABLE} WHERE line_id IN (${ids}) ORDER BY line_id`)
const originsOf = (ctx: Ctx, ids: string) =>
  ctx.db.prepare(
    `SELECT ${ORIGIN_SELECT_LIST} FROM ${ORIGIN_TABLE} WHERE origin_id IN (SELECT origin_id FROM ${LOCATION_TABLE} WHERE line_id IN (${ids})) ORDER BY origin_id`
  )

/** 子の科目は少ない（款の下の項、項の下の目）のでページを切らずに返す。上限は D1 の走査を抑えるため */
const MAX_CHILD_SUBJECTS = 1000

const groupByBreakdown = (rows: Row[]) => {
  const out: Record<string, Row[]> = {}
  for (const r of rows) (out[String(r.breakdown)] ??= []).push(r)
  return out
}

export interface LineInput {
  line_id: string
  page_size?: number
  page_token?: string
}

/** 歳出の行を科目・内訳のどちらの表からも引く。科目なら子の科目と直下の内訳、内訳なら子の内訳（どちらも内訳はページ） */
export async function getLine(ctx: Ctx, input: LineInput): Promise<LineOutput> {
  const { db } = ctx
  const id = input.line_id
  const limit = input.page_size ?? DEFAULT_PAGE_SIZE
  const fp = ['get_expenditure_line', id]
  const offset = await decodeToken(input.page_token, fp)
  const s = SUBJECT_TABLE
  const d = DETAIL_TABLE
  // 子の内訳: 科目の直下（depth = 1）か、内訳の子。id はどちらかの表にしか無い
  const kidsWhere = `("parent_detail_id" = ? OR ("subject_id" = ? AND "depth" = 1))`
  const kidIds = `SELECT "detail_id" FROM ${d.table} WHERE ${kidsWhere} ORDER BY "breakdown", "detail_id" LIMIT ? OFFSET ?`
  const childIds = `SELECT "subject_id" FROM ${s.table} WHERE "parent_subject_id" = ? ORDER BY "code", "subject_id" LIMIT ?`
  const ids = `SELECT ? UNION ALL SELECT * FROM (${childIds}) UNION ALL SELECT * FROM (${kidIds})`
  const idParams = [id, id, MAX_CHILD_SUBJECTS, id, id, limit, offset]
  const [subject, detail, children, kids, locations, origins] = await db.batch([
    db.prepare(`SELECT ${s.selectList} FROM ${s.table} WHERE "subject_id" = ?`).bind(id),
    db.prepare(`SELECT ${d.selectList} FROM ${d.table} WHERE "detail_id" = ?`).bind(id),
    db.prepare(`SELECT ${s.selectList} FROM ${s.table} WHERE "parent_subject_id" = ? ORDER BY "code", "subject_id" LIMIT ?`).bind(id, MAX_CHILD_SUBJECTS),
    db.prepare(`SELECT ${d.selectList} FROM ${d.table} WHERE ${kidsWhere} ORDER BY "breakdown", "detail_id" LIMIT ? OFFSET ?`).bind(id, id, limit + 1, offset),
    locationsOf(ctx, ids).bind(...idParams),
    originsOf(ctx, ids).bind(...idParams),
  ])
  const subjectRow = subject!.results[0]
  const detailRow = detail!.results[0]
  if (!subjectRow && !detailRow) throw new ApiError(404, 'NOT_FOUND', `歳出の行が見つかりません: ${id}`)
  const line = subjectRow ? { kind: 'subject' as const, ...toRow(s.columns, subjectRow) } : { kind: 'detail' as const, ...toRow(d.columns, detailRow!) }
  const more = kids!.results.length > limit
  return {
    line,
    child_subjects: children!.results.map((r) => toRow(s.columns, r)),
    details: groupByBreakdown(kids!.results.slice(0, limit).map((r) => toRow(d.columns, r))),
    next_page_token: more ? await nextToken(offset + limit, fp) : null,
    locations: locations!.results,
    origins: origins!.results,
  } as LineOutput
}
