// 検索の表を構造化した入力で引き、結果の行が指す出典を同じ batch（トランザクション）で読む。
import { toRow, type FiscalTable } from '../columns'
import type { Ctx } from './context'
import { decodeToken, MAX_TOTAL_SIZE, nextToken } from './paging'
import { buildWhere, canonicalJson, type SearchInput } from './search'

/** 出典の表（origin_id が主キー）。行の origin_id から引く */
export interface OriginSource {
  table: string
  selectList: string
}

/** origin が null の表（事業の年度など、行が出典を指さない表）は出典を読まない。count のときは条件に当たる行の数も返す */
export async function searchRows(t: FiscalTable, origin: OriginSource | null, ctx: Ctx, input: SearchInput, opts: { count?: boolean } = {}) {
  const { db } = ctx
  const where = buildWhere(t, input.document_kind, input.fiscal_year, input.where as never)
  const order = [...(input.order_by ?? [])]
  if (!order.some((k) => k.column === t.primaryKey)) order.push({ column: t.primaryKey })
  const orderSql = order.map((k) => `"${k.column}"${k.desc ? ' DESC' : ''}`).join(', ')
  const { page_size: limit, page_token: token, ...query } = input
  const fp = [`search_${t.kind}`, canonicalJson(query)]
  const offset = await decodeToken(token, fp)
  const results = await db.batch([
    db
      .prepare(`SELECT ${t.selectList} FROM ${t.table} WHERE ${where.sql} ORDER BY ${orderSql} LIMIT ? OFFSET ?`)
      .bind(...where.params, limit + 1, offset),
    ...(opts.count ? [db.prepare(`SELECT COUNT(*) AS n FROM (SELECT 1 FROM ${t.table} WHERE ${where.sql} LIMIT ?)`).bind(...where.params, MAX_TOTAL_SIZE + 1)] : []),
    ...(origin
      ? [
          db
            .prepare(
              `SELECT ${origin.selectList} FROM ${origin.table} WHERE origin_id IN ` +
                `(SELECT origin_id FROM ${t.table} WHERE ${where.sql} ORDER BY ${orderSql} LIMIT ? OFFSET ?) ORDER BY origin_id`
            )
            .bind(...where.params, limit, offset),
        ]
      : []),
  ])
  const page = results[0]!
  const counted = opts.count ? results[1] : undefined
  const origins = results[opts.count ? 2 : 1]
  const more = page.results.length > limit
  const n = Number((counted?.results[0] as { n: number } | undefined)?.n ?? 0)
  return {
    ...(opts.count ? { total_size: Math.min(n, MAX_TOTAL_SIZE), total_size_capped: n > MAX_TOTAL_SIZE } : {}),
    rows: page.results.slice(0, limit).map((r) => toRow(t.columns, r)),
    next_page_token: more ? await nextToken(offset + limit, fp) : null,
    origins: origins?.results ?? [],
  }
}
