// 試作: 始めた・やめた事業（/prototype/fresh?year=2026）。全部のまちを横断して、その年度に始めた事業と前の年度でやめた事業を並べる。
// 始めた・やめたは事業の DB の判断（first_year_kind・last_year_kind が confirmed）だけを使い、頁で金額を比べて決めない
import { defineHandler, defineHead } from 'void'
import { jurisdictionPath } from '../../jurisdiction/path'
import { catalog, memo } from '../../server/jurisdiction-routes'
import type { Env } from '../../server/env'
import { apiPostAll, type MeasureRow, type ProjectRow, type ProjectYearRow } from '../../server/prototype-api'

const YEARS = [2026, 2025]
const PER_TOWN = 8

export type Item = { name: string; yen: number | null; where: string }
export type TownFresh = { code: string; name: string; path: string; started: Item[]; startedCount: number; ended: Item[]; endedCount: number; announced: Item[] }
export type Props = { year: number; years: number[]; towns: TownFresh[]; failed: boolean }

type Page = { project_years: ProjectYearRow[]; projects: ProjectRow[]; next_page_token?: string | null }

const yearsOf = (env: Env, y: number) =>
  memo<Page[]>(`proto-fresh-${y}`, () => apiPostAll<Page>(env, '/v1/projects:search', { fiscal_year: { min: y, max: y }, where: { account_name: { eq: ['一般会計'] } }, page_size: 1000 }, 8))

export const loader = defineHandler<Props>(async (c) => {
  const env = c.env as unknown as Env
  const asked = Number(c.req.query('year'))
  const year = YEARS.includes(asked) ? asked : YEARS[0]!
  try {
    const [cat, now, before, measures] = await Promise.all([
      catalog(env),
      yearsOf(env, year),
      yearsOf(env, year - 1),
      apiPostAll<{ measures: MeasureRow[]; next_page_token?: string | null }>(env, '/v1/budget-proposals/measures:search', { fiscal_year: { min: year, max: year }, where: { is_new: { eq: true } }, page_size: 1000 }, 3),
    ])
    const names = new Map(cat.map((e) => [e.code, e.name]))
    const towns = new Map<string, TownFresh>()
    const town = (code: string) => {
      const t = towns.get(code) ?? { code, name: names.get(code) ?? code, path: jurisdictionPath(code), started: [], startedCount: 0, ended: [], endedCount: 0, announced: [] }
      towns.set(code, t)
      return t
    }
    const pick = (pages: Page[], keep: (p: ProjectRow) => boolean) => {
      const span = new Map(pages.flatMap((p) => p.projects).map((p) => [p.project_id, p]))
      return pages.flatMap((p) => p.project_years).filter((py) => keep(span.get(py.project_id)!))
    }
    const item = (py: ProjectYearRow): Item => ({ name: py.name, yen: py.budget_yen ?? py.settled_yen, where: [py.kan_name, py.moku_name].filter(Boolean).join(' › ') })
    const byYen = (a: Item, b: Item) => (b.yen ?? 0) - (a.yen ?? 0)
    for (const py of pick(now, (p) => p?.first_year_kind === 'confirmed' && p.first_year === year)) town(py.jurisdiction_code).started.push(item(py))
    for (const py of pick(before, (p) => p?.last_year_kind === 'confirmed' && p.last_year === year - 1)) town(py.jurisdiction_code).ended.push(item(py))
    for (const m of measures.flatMap((r) => r.measures)) town(m.jurisdiction_code).announced.push({ name: m.title, yen: m.budget_yen, where: '' })
    for (const t of towns.values()) {
      t.startedCount = t.started.length
      t.endedCount = t.ended.length
      t.started = t.started.sort(byYen).slice(0, PER_TOWN)
      t.ended = t.ended.sort(byYen).slice(0, PER_TOWN)
      t.announced = t.announced.sort(byYen).slice(0, PER_TOWN)
    }
    return { year, years: YEARS, towns: [...towns.values()].sort((a, b) => a.code.localeCompare(b.code)), failed: false }
  } catch {
    return { year, years: YEARS, towns: [], failed: true }
  }
})

export const head = defineHead(() => ({ title: '始めた・やめた事業（試作） — 風土記', meta: [{ name: 'robots', content: 'noindex' }] }))
