// 比べる（/compare?a=131091&b=131172&year=2024）。2つのまちを、同じ年度の一般会計の決算の分野で並べ、a に似たまちを候補に出す。
// a が無ければ見本（品川区）で開き、画面が住んでいるまちがあればそのまちで開き直す。b が無ければ a と使い方が一番近いまちにする。並びは良し悪しの順位にしない
import { defineHandler, defineHead } from 'void'
import { jurisdictionPath } from '../jurisdiction/path'
import { catalog } from '../server/jurisdiction-routes'
import { shownSettlementYears } from '../server/jurisdiction'
import { closestByPopulation, closestByUse, fieldTotalsOf } from '../server/compare'
import type { Env } from '../server/env'

export type CompareTown = { code: string; name: string; path: string; pop: number; total: number; fields: Record<string, number> }
export type TownRef = { code: string; name: string; pop: number }
export type Props = {
  year: number | null
  years: number[]
  a: CompareTown | null
  b: CompareTown | null
  byUse: TownRef[]
  byPopulation: TownRef[]
  /** 選べるまち（一般会計の決算があるまち） */
  options: { code: string; name: string }[]
  failed: boolean
  /** a の指定が無いので、見本の組み合わせを出している（画面は住んでいるまちがあればそのまちで開き直す） */
  sample: boolean
}

const SIMILAR = 5
// a の指定が無いときの見本: 品川区と、使い方が一番近いまち
const SAMPLE = '131091'
const isPrefecture = (code: string) => code.slice(2, 5) === '000'

export const loader = defineHandler<Props>(async (c) => {
  const env = c.env as unknown as Env
  const none: Props = { year: null, years: [], a: null, b: null, byUse: [], byPopulation: [], options: [], failed: false, sample: false }
  try {
    const cat = await catalog(env)
    const yearsOf = new Map(cat.map((e) => [e.code, shownSettlementYears(e.settlementYears)]))
    const entries = cat.filter((e) => yearsOf.get(e.code)?.length)
    const options = entries.map((e) => ({ code: e.code, name: e.name }))
    const find = (code?: string) => entries.find((e) => e.code === code)
    const picked = find(c.req.query('a'))
    const sample = !picked
    const a = picked ?? find(SAMPLE) ?? entries[0]
    if (!a) return { ...none, options }
    const ref = (code: string): TownRef => ({ code, name: find(code)?.name ?? code, pop: find(code)?.population?.people ?? 0 })
    const aYears = [...yearsOf.get(a.code)!].sort((x, y) => y - x)
    const asked = Number(c.req.query('year'))
    // 似たまちは、指定の年度（無ければ a の最新の決算）で探す。都道府県は都道府県どうし、市区町村は市区町村どうしで探す
    const baseYear = aYears.includes(asked) ? asked : aYears[0]!
    const totals = await fieldTotalsOf(env, baseYear)
    const peers = entries.filter((e) => e.code !== a.code && isPrefecture(e.code) === isPrefecture(a.code))
    const mine = totals.get(a.code)
    const byUse = mine ? closestByUse(mine, peers.flatMap((e) => (totals.has(e.code) ? [[e.code, totals.get(e.code)!] as [string, typeof mine]] : [])), SIMILAR).map(ref) : []
    const myPop = a.population?.people ?? 0
    const byPopulation = myPop ? closestByPopulation(myPop, peers.flatMap((e) => (e.population?.people ? [[e.code, e.population.people] as [string, number]] : [])), SIMILAR).map(ref) : []
    const b = find(c.req.query('b')) ?? find(byUse[0]?.code)
    const years = b ? aYears.filter((y) => yearsOf.get(b.code)!.includes(y)) : []
    const year = years.includes(asked) ? asked : (years[0] ?? null)
    const town = async (code: string): Promise<CompareTown | null> => {
      const t = (await fieldTotalsOf(env, year!)).get(code)
      return t ? { ...ref(code), path: jurisdictionPath(code), ...t } : null
    }
    const [ta, tb] = year && b ? await Promise.all([town(a.code), town(b.code)]) : [null, null]
    return { sample, year, years, a: ta ?? { ...ref(a.code), path: jurisdictionPath(a.code), total: 0, fields: {} }, b: tb, byUse, byPopulation, options, failed: false }
  } catch {
    return { ...none, failed: true }
  }
})

export const head = defineHead(() => ({ title: '比べる — 風土記', meta: [{ name: 'robots', content: 'noindex' }] }))
