// 検索の表を構造化した入力で引き、結果の行が指す出典を同じ batch（トランザクション）で読む。
import { toRow, type FiscalTable } from '../columns'
import type { Ctx } from './context'
import { decodeToken, nextToken } from './paging'
import { buildWhere, canonicalJson, type SearchInput } from './search'

/** 出典の表（origin_id が主キー）。行の origin_id から引く */
export interface OriginSource {
  table: string
  selectList: string
}

export async function searchRows(t: FiscalTable, origin: OriginSource, ctx: Ctx, input: SearchInput) {
  const { db } = ctx
  const where = buildWhere(t, input.document_kind, input.fiscal_year, input.where as never)
  const order = [...(input.order_by ?? [])]
  if (!order.some((k) => k.column === t.primaryKey)) order.push({ column: t.primaryKey })
  const orderSql = order.map((k) => `"${k.column}"${k.desc ? ' DESC' : ''}`).join(', ')
  const { page_size: limit, page_token: token, ...query } = input
  const fp = [`search_${t.kind}`, canonicalJson(query)]
  const offset = await decodeToken(token, fp)
  const [page, origins] = await db.batch([
    db
      .prepare(`SELECT ${t.selectList} FROM ${t.table} WHERE ${where.sql} ORDER BY ${orderSql} LIMIT ? OFFSET ?`)
      .bind(...where.params, limit + 1, offset),
    db
      .prepare(
        `SELECT ${origin.selectList} FROM ${origin.table} WHERE origin_id IN ` +
          `(SELECT origin_id FROM ${t.table} WHERE ${where.sql} ORDER BY ${orderSql} LIMIT ? OFFSET ?) ORDER BY origin_id`
      )
      .bind(...where.params, limit, offset),
  ])
  const more = page!.results.length > limit
  return {
    rows: page!.results.slice(0, limit).map((r) => toRow(t.columns, r)),
    next_page_token: more ? await nextToken(offset + limit, fp) : null,
    origins: origins!.results,
  }
}
