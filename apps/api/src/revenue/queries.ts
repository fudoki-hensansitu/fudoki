// 歳入の集約の問い合わせ。根・款・出典は1つの batch（トランザクション）で読み、同期の入れ替えをまたいで食い違わないようにする。
import { ORIGIN_SELECT_LIST, ORIGIN_TABLE } from '../columns'
import type { Ctx } from '../shared/context'
import type { RevenueInput, RevenueOutput } from './model'

const ROOT_COLUMNS = ['revenue_id', 'jurisdiction_code', 'fiscal_year', 'document_kind', 'amendment_number', 'account_name', 'account_kind', 'total_yen']

type Root = Omit<RevenueOutput['revenues'][number], 'kan' | 'origins'>
type Kan = RevenueOutput['revenues'][number]['kan'][number] & { revenue_id: string }
type OriginRow = RevenueOutput['revenues'][number]['origins'][number] & { revenue_id: string } & Record<string, unknown>

/** 根を選ぶ条件と、その値。款・出典も同じ条件の根で絞る */
function rootFilter(input: RevenueInput): { where: string; params: unknown[] } {
  const conds = ['r."jurisdiction_code" = ?']
  const params: unknown[] = [input.jurisdiction_code]
  if (input.fiscal_year !== undefined) conds.push('r."fiscal_year" = ?'), params.push(input.fiscal_year)
  if (input.document_kind !== undefined) conds.push('r."document_kind" = ?'), params.push(input.document_kind)
  if (input.account_kind !== undefined) conds.push('r."account_kind" = ?'), params.push(input.account_kind)
  return { where: conds.join(' AND '), params }
}

/** 自治体の歳入の根と、根ごとの款（区分と印字の頁つき）・出典 */
export async function getRevenue(ctx: Ctx, input: RevenueInput): Promise<RevenueOutput> {
  const { db } = ctx
  const { where, params } = rootFilter(input)
  const originColumns = ORIGIN_SELECT_LIST.split(', ').map((c) => `o.${c}`).join(', ')
  const [roots, kan, origins] = await db.batch([
    db.prepare(
      `SELECT ${ROOT_COLUMNS.map((c) => `r."${c}"`).join(', ')} FROM revenue r WHERE ${where} ` +
        `ORDER BY r."fiscal_year" DESC, r."document_kind", r."account_kind" <> '一般会計', r."account_name", r."revenue_id"`
    ).bind(...params),
    db.prepare(
      `SELECT s."revenue_id", s."subject_id", s."code", s."name", s."amount_yen", c."category", l."source_page" AS "page" ` +
        `FROM revenue_subject s JOIN revenue r ON r."revenue_id" = s."revenue_id" ` +
        `LEFT JOIN fiscal_revenue_category c ON c."kan_name" = s."name" LEFT JOIN revenue_location l ON l."line_id" = s."subject_id" ` +
        `WHERE s."level" = '款' AND ${where} ORDER BY s."revenue_id", CAST(s."code" AS INTEGER), s."code", s."subject_id"`
    ).bind(...params),
    db.prepare(
      `SELECT k."revenue_id", ${originColumns} FROM revenue_origin_link k JOIN revenue r ON r."revenue_id" = k."revenue_id" ` +
        `JOIN ${ORIGIN_TABLE} o ON o."origin_id" = k."origin_id" WHERE ${where} ORDER BY k."revenue_id", o."origin_id"`
    ).bind(...params),
  ])
  const kanOf = new Map<string, Kan[]>()
  for (const k of kan!.results as Kan[]) (kanOf.get(k.revenue_id) ?? kanOf.set(k.revenue_id, []).get(k.revenue_id)!).push(k)
  const originsOf = new Map<string, OriginRow[]>()
  for (const o of origins!.results as OriginRow[]) (originsOf.get(o.revenue_id) ?? originsOf.set(o.revenue_id, []).get(o.revenue_id)!).push(o)
  return {
    revenues: (roots!.results as Root[]).map((root) => ({
      ...root,
      kan: (kanOf.get(root.revenue_id) ?? []).map(({ revenue_id: _, ...k }) => k),
      origins: (originsOf.get(root.revenue_id) ?? []).map(({ origin_id, title, url, sha256, format }) => ({ origin_id, title, url, sha256, format })),
    })),
  }
}
