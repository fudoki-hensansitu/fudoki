// 自治体の一般会計の歳入（款と区分）。apps/api の get_revenue を内部の RPC で読む。
// 読めないときは空で返し、頁は予算・決算タブの入る→使うを出さずに描く（頁全体は止めない）
import type { RevenueDoc } from '../jurisdiction/types'
import type { Env } from './env'
import { apiCall } from './fudoki-api'
import { logError } from './log'

export async function loadRevenue(env: Env, code: string): Promise<RevenueDoc[]> {
  try {
    const { revenues } = await apiCall(env)('get_revenue', { jurisdiction_code: code, account_kind: '一般会計' })
    return revenues.map((r) => {
      // 頁は款が印字された冊のもの。分冊では origins の先頭と冊が違うことがあるので、頁と同じ冊を引く
      const at = r.kan.find((k) => k.page != null)
      const page = at?.page ?? null
      const origin = r.origins.find((o) => o.origin_id === at?.origin_id) ?? r.origins[0]
      return {
        year: r.fiscal_year,
        kind: r.document_kind,
        total: r.total_yen,
        kan: r.kan.map((k) => ({ name: k.name, yen: k.amount_yen, category: k.category, page: k.page })),
        origin: origin ? { title: origin.title, url: page && origin.origin_id === at?.origin_id ? `${origin.url}#page=${page}` : origin.url } : null,
      }
    })
  } catch (e) {
    logError(e)
    return []
  }
}
