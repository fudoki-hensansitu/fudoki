// 試作: 事業をさがす（/prototype/search?q=給食）。言葉で、収録している全部のまちの決算の内訳（事業・節など）を引く。
// まちは自治体コードの順に並べ、金額で順位を付けない。内訳は入れ子なので足さない
import { defineHandler, defineHead } from 'void'
import { jurisdictionPath } from '../../jurisdiction/path'
import { catalog } from '../../server/jurisdiction-routes'
import type { Env } from '../../server/env'
import { apiPost, type DetailRow, type ProjectRow, type ProjectYearRow } from '../../server/prototype-api'

const YEARS = [2025, 2024]
const PER_TOWN = 6

export type Hit = { name: string; yen: number | null; where: string; department: string | null }
export type TownHits = { code: string; name: string; path: string; year: number; count: number; hits: Hit[] }
export type Trackable = { projectId: string; code: string; town: string; name: string; years: number[] }
export type Props = { q: string; towns: TownHits[]; trackable: Trackable[]; failed: boolean }

export const loader = defineHandler<Props>(async (c) => {
  const env = c.env as unknown as Env
  const q = (c.req.query('q') ?? '').trim().slice(0, 30)
  if (!q) return { q, towns: [], trackable: [], failed: false }
  try {
    const cat = await catalog(env)
    const names = new Map(cat.map((e) => [e.code, e.name]))
    const [byYear, projects] = await Promise.all([
      Promise.all(
        YEARS.map((y) =>
          apiPost<{ details: DetailRow[] }>(env, '/v1/expenditures/details:search', {
            document_kind: 'settlement',
            fiscal_year: { min: y, max: y },
            where: { name: { contains: q }, account_name: { eq: ['一般会計'] } },
            order_by: [{ column: 'amount_yen', desc: true }],
            page_size: 1000,
          }).then((r) => r.details),
        ),
      ),
      apiPost<{ project_years: ProjectYearRow[]; projects: ProjectRow[] }>(env, '/v1/projects:search', {
        fiscal_year: { min: 2024, max: 2026 },
        where: { name: { contains: q }, account_name: { eq: ['一般会計'] } },
        page_size: 300,
      }),
    ])
    // まちごとに、決算がある最新の年度の内訳だけを出す
    const towns = new Map<string, TownHits>()
    for (const [i, rows] of byYear.entries()) {
      const year = YEARS[i]!
      for (const d of rows) {
        const t = towns.get(d.jurisdiction_code)
        if (t && t.year !== year) continue
        const cur: TownHits = t ?? { code: d.jurisdiction_code, name: names.get(d.jurisdiction_code) ?? d.jurisdiction_code, path: jurisdictionPath(d.jurisdiction_code), year, count: 0, hits: [] }
        cur.count++
        if (cur.hits.length < PER_TOWN) cur.hits.push({ name: d.name, yen: d.amount_yen, where: [d.kan_name, d.moku_name].filter(Boolean).join(' › '), department: d.department })
        towns.set(d.jurisdiction_code, cur)
      }
    }
    const tracked = new Map<string, Trackable>()
    for (const py of projects.project_years) {
      const t = tracked.get(py.project_id) ?? { projectId: py.project_id, code: py.jurisdiction_code, town: names.get(py.jurisdiction_code) ?? '', name: py.name, years: [] }
      t.years.push(py.fiscal_year)
      if (py.fiscal_year === Math.max(...t.years)) t.name = py.name
      tracked.set(py.project_id, t)
    }
    return { q, towns: [...towns.values()].sort((a, b) => a.code.localeCompare(b.code)), trackable: [...tracked.values()].filter((t) => t.years.length > 1).slice(0, 8), failed: false }
  } catch {
    return { q, towns: [], trackable: [], failed: true }
  }
})

export const head = defineHead(() => ({ title: '事業をさがす（試作） — 風土記', meta: [{ name: 'robots', content: 'noindex' }] }))
