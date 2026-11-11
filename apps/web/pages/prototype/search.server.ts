// 試作: 事業を探す（/prototype/search?q=給食&code=131091）。言葉で、収録しているまちの決算の内訳（事業・節など）を引く。code があればそのまちだけ。
// まちは自治体コードの順に並べ、金額で順位を付けない。内訳は入れ子なので足さない
import { defineHandler, defineHead } from 'void'
import { jurisdictionPath } from '../../jurisdiction/path'
import { catalog } from '../../server/jurisdiction-routes'
import type { Env } from '../../server/env'
import { apiPost, type DetailRow } from '../../server/prototype-api'

const YEARS = [2025, 2024]

export type Hit = { name: string; yen: number | null; where: string }
export type TownHits = { code: string; name: string; path: string; year: number; count: number; hits: Hit[] }
export type Props = { q: string; code: string | null; townName: string | null; towns: TownHits[]; failed: boolean }

export const loader = defineHandler<Props>(async (c) => {
  const env = c.env as unknown as Env
  const q = (c.req.query('q') ?? '').trim().slice(0, 30)
  const asked = c.req.query('code') ?? ''
  const code = /^\d{6}$/.test(asked) ? asked : null
  const cat = await catalog(env).catch(() => [])
  const names = new Map(cat.map((e) => [e.code, e.name]))
  const townName = code ? (names.get(code) ?? null) : null
  if (!q) return { q, code, townName, towns: [], failed: false }
  const perTown = code ? 30 : 6
  try {
    const byYear = await Promise.all(
      YEARS.map((y) =>
        apiPost<{ details: DetailRow[] }>(env, '/v1/expenditures/details:search', {
          document_kind: 'settlement',
          fiscal_year: { min: y, max: y },
          where: { name: { contains: q }, account_name: { eq: ['一般会計'] }, ...(code ? { jurisdiction_code: { eq: [code] } } : {}) },
          order_by: [{ column: 'amount_yen', desc: true }],
          page_size: 1000,
        }).then((r) => r.details),
      ),
    )
    // まちごとに、決算がある最新の年度の内訳だけを出す
    const towns = new Map<string, TownHits>()
    for (const [i, rows] of byYear.entries()) {
      const year = YEARS[i]!
      for (const d of rows) {
        const t = towns.get(d.jurisdiction_code)
        if (t && t.year !== year) continue
        const cur: TownHits = t ?? { code: d.jurisdiction_code, name: names.get(d.jurisdiction_code) ?? d.jurisdiction_code, path: jurisdictionPath(d.jurisdiction_code), year, count: 0, hits: [] }
        cur.count++
        if (cur.hits.length < perTown) cur.hits.push({ name: d.name, yen: d.amount_yen, where: [d.kan_name, d.moku_name].filter(Boolean).join(' › ') })
        towns.set(d.jurisdiction_code, cur)
      }
    }
    return { q, code, townName, towns: [...towns.values()].sort((a, b) => a.code.localeCompare(b.code)), failed: false }
  } catch {
    return { q, code, townName, towns: [], failed: true }
  }
})

export const head = defineHead(() => ({ title: '事業を探す（試作） — 風土記', meta: [{ name: 'robots', content: 'noindex' }] }))
