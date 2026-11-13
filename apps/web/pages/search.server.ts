// 事業を検索（/search?q=給食&code=131091）。言葉で、収録しているまちの決算の内訳（事業・節など）を引く。code があればそのまちだけ。
// まちは自治体コードの順に並べ、金額で順位を付けない。内訳は入れ子なので足さない
import { defineHandler, defineHead } from 'void'
import { jurisdictionPath } from '../jurisdiction/path'
import { catalog } from '../server/jurisdiction-routes'
import type { Env } from '../server/env'
import { apiCall, type WebOpInput, type WebOpOutput } from '../server/fudoki-api'

type DetailPage = WebOpOutput<'search_expenditure_details'>

/** next_page_token が無くなるまで読む（頁数に上限を置く） */
async function searchAll(env: Env, body: WebOpInput<'search_expenditure_details'>, maxPages: number): Promise<DetailPage[]> {
  const out: DetailPage[] = []
  let token: string | undefined
  do {
    const r = await apiCall(env)('search_expenditure_details', { ...body, ...(token ? { page_token: token } : {}) })
    out.push(r)
    token = r.next_page_token ?? undefined
  } while (token && out.length < maxPages)
  return out
}

const YEARS = [2025, 2024]
/** 1年度で読む頁の上限（1頁1000行） */
const MAX_PAGES = 5
/** api の contains は前後の * を含めて GLOB 50 バイトまで。* ? [ は escape で3バイトになる */
const MAX_QUERY_BYTES = 48

function clip(q: string) {
  let out = ''
  let bytes = 0
  for (const ch of q) {
    const n = /[*?[]/.test(ch) ? 3 : new TextEncoder().encode(ch).length
    if (bytes + n > MAX_QUERY_BYTES) break
    out += ch
    bytes += n
  }
  return out
}

export type Hit = { name: string; yen: number | null; where: string }
export type TownHits = { code: string; name: string; path: string; year: number; count: number; hits: Hit[] }
/** capped: 広い言葉で、金額の大きい順に上限まで読んだところで止めた */
export type Props = { q: string; code: string | null; townName: string | null; towns: TownHits[]; capped: boolean; failed: boolean; tooLong?: boolean }

export const loader = defineHandler<Props>(async (c) => {
  const env = c.env as unknown as Env
  const raw = (c.req.query('q') ?? '').trim()
  const q = clip(raw)
  const asked = c.req.query('code') ?? ''
  const code = /^\d{6}$/.test(asked) ? asked : null
  const cat = await catalog(env).catch(() => [])
  const names = new Map(cat.map((e) => [e.code, e.name]))
  const townName = code ? (names.get(code) ?? null) : null
  if (!q) return { q, code, townName, towns: [], capped: false, failed: false }
  // api の上限を超える言葉は、縮めて別の言葉で引かずに、長すぎると返す
  if (q !== raw) return { q: raw, code, townName, towns: [], capped: false, failed: false, tooLong: true }
  const perTown = code ? 30 : 6
  try {
    const byYear = await Promise.all(
      YEARS.map((y) =>
        searchAll(env, {
          document_kind: 'settlement',
          fiscal_year: { min: y, max: y },
          where: { name: { contains: q }, account_name: { eq: ['一般会計'] }, ...(code ? { jurisdiction_code: { eq: [code] } } : {}) },
          order_by: [{ column: 'amount_yen', desc: true }],
          page_size: 1000,
        }, MAX_PAGES),
      ),
    )
    // まちごとに、決算がある最新の年度の内訳だけを出す
    const towns = new Map<string, TownHits>()
    const capped = byYear.some((pages) => !!pages.at(-1)?.next_page_token)
    for (const [i, pages] of byYear.entries()) {
      const year = YEARS[i]!
      const rows = pages.flatMap((r) => r.details)
      for (const d of rows) {
        const t = towns.get(d.jurisdiction_code)
        if (t && t.year !== year) continue
        const cur: TownHits = t ?? { code: d.jurisdiction_code, name: names.get(d.jurisdiction_code) ?? d.jurisdiction_code, path: jurisdictionPath(d.jurisdiction_code), year, count: 0, hits: [] }
        cur.count++
        if (cur.hits.length < perTown) cur.hits.push({ name: d.name, yen: d.amount_yen, where: [d.kan_name, d.moku_name].filter(Boolean).join(' › ') })
        towns.set(d.jurisdiction_code, cur)
      }
    }
    return { q, code, townName, towns: [...towns.values()].sort((a, b) => a.code.localeCompare(b.code)), capped, failed: false }
  } catch {
    return { q, code, townName, towns: [], capped: false, failed: true }
  }
})

export const head = defineHead(() => ({ title: '事業を検索 — 風土記', meta: [{ name: 'robots', content: 'noindex' }] }))
