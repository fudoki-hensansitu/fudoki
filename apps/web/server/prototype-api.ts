// 試作: apps/api の検索を web の loader から呼ぶ小さな入口（本実装では Hono RPC の型つきに寄せる）
import { apiFetch, type Env } from './env'

const API_ORIGIN = 'https://api.fudoki.dev'

export async function apiPost<T>(env: Env, path: string, body: unknown): Promise<T> {
  const r = await apiFetch(env)(`${API_ORIGIN}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  if (!r.ok) throw new Error(`${path} ${r.status}`)
  return (await r.json()) as T
}

export async function apiGet<T>(env: Env, path: string): Promise<T> {
  const r = await apiFetch(env)(`${API_ORIGIN}${path}`)
  if (!r.ok) throw new Error(`${path} ${r.status}`)
  return (await r.json()) as T
}

/** next_page_token が無くなるまで読む（試作なので頁数に上限を置く） */
export async function apiPostAll<R extends { next_page_token?: string | null }>(env: Env, path: string, body: Record<string, unknown>, maxPages = 5): Promise<R[]> {
  const out: R[] = []
  let token: string | undefined
  do {
    const r: R = await apiPost<R>(env, path, { ...body, ...(token ? { page_token: token } : {}) })
    out.push(r)
    token = r.next_page_token ?? undefined
  } while (token && out.length < maxPages)
  return out
}

export type DetailRow = { detail_id: string; jurisdiction_code: string; fiscal_year: number; kan_name: string | null; kou_name: string | null; moku_name: string | null; name: string; department: string | null; amount_yen: number | null; depth: number }
export type ProjectRow = { project_id: string; jurisdiction_code: string; name: string; first_year: number; first_year_kind: 'confirmed' | 'before_coverage'; last_year: number | null; last_year_kind: 'confirmed' | 'latest' | 'unknown'; parent_project_id: string | null }
export type ProjectYearRow = { project_year_id: string; project_id: string; jurisdiction_code: string; fiscal_year: number; name: string; kan_name: string | null; moku_name: string | null; budget_yen: number | null; settled_yen: number | null }
export type MeasureRow = { measure_id: string; jurisdiction_code: string; fiscal_year: number; title: string; is_new: boolean | null; budget_yen: number | null; description: string | null }
