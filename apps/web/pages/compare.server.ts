// 比べる（/compare?a=131091&ay=2024&b=131172&by=2024）。2つのまち（同じまちの別の年度でもよい）の一般会計の決算を分野で並べ、a に似たまちを候補に出す。
// a が無ければ見本（品川区）で開き、画面が住んでいるまちがあればそのまちで開き直す。b が無ければ a と使い方が一番近いまちにする。並びは良し悪しの順位にしない
import { defineHandler, defineHead } from 'void'
import { jurisdictionPath } from '../jurisdiction/path'
import { catalog } from '../server/jurisdiction-routes'
import { shownSettlementYears } from '../server/jurisdiction'
import { closestByPopulation, closestByUse, fieldTotalsOf } from '../server/compare'
import type { Env } from '../server/env'
import { siteKey } from '../server/site-key'

/** 比べる片方。year はこのまちの決算の年度、years はこのまちで選べる年度（新しい順） */
export type CompareTown = { code: string; name: string; path: string; pop: number; year: number; years: number[]; total: number; fields: Record<string, number> }
export type TownRef = { code: string; name: string; pop: number }
export type Props = {
  a: CompareTown | null
  b: CompareTown | null
  byUse: TownRef[]
  byPopulation: TownRef[]
  /** 選べるまち（一般会計の決算があるまち） */
  options: { code: string; name: string }[]
  failed: boolean
  /** アシスタントの Turnstile の site key */
  sitekey: string
  /** a の指定が無いので、見本の組み合わせを出している（画面は住んでいるまちがあればそのまちで開き直す） */
  sample: boolean
}

const SIMILAR = 5
// a の指定が無いときの見本: 品川区と、使い方が一番近いまち
const SAMPLE = '131091'
const isPrefecture = (code: string) => code.slice(2, 5) === '000'

export const loader = defineHandler<Props>(async (c) => {
  const env = c.env as unknown as Env
  const none: Props = { a: null, b: null, byUse: [], byPopulation: [], options: [], failed: false, sample: false, sitekey: siteKey(c) }
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
    const yearsDesc = (code: string) => [...yearsOf.get(code)!].sort((x, y) => y - x)
    const aYears = yearsDesc(a.code)
    const askedA = Number(c.req.query('ay'))
    const aYear = aYears.includes(askedA) ? askedA : aYears[0]!
    // 似たまちは a の年度で探す。都道府県は都道府県どうし、市区町村は市区町村どうしで探す
    const totals = await fieldTotalsOf(env, aYear)
    const peers = entries.filter((e) => e.code !== a.code && isPrefecture(e.code) === isPrefecture(a.code))
    const popOf = (code: string) => find(code)?.population?.people ?? 0
    const mine = totals.get(a.code)
    // 似たまちは1人あたりの分野の金額で探す。a の人口が無ければ探さない
    const byUse = mine && popOf(a.code) ? closestByUse({ ...mine, base: popOf(a.code) }, peers.flatMap((e) => (totals.has(e.code) ? [[e.code, { ...totals.get(e.code)!, base: popOf(e.code) }] as [string, typeof mine & { base: number }]] : [])), SIMILAR + 1).map(ref) : []
    const myPop = a.population?.people ?? 0
    const byPopulation = myPop ? closestByPopulation(myPop, peers.flatMap((e) => (e.population?.people ? [[e.code, e.population.people] as [string, number]] : [])), SIMILAR + 1).map(ref) : []
    const b = find(c.req.query('b')) ?? find(byUse[0]?.code) ?? find(byPopulation[0]?.code) ?? peers[0]
    // b の年度: 指定が無ければ a と同じ年度。同じまちどうしなら1つ前の年度。どちらも無ければ b の最新
    const bYears = b ? yearsDesc(b.code) : []
    const askedB = Number(c.req.query('by'))
    const bDefault = b?.code === a.code ? (bYears.find((y) => y < aYear) ?? aYear) : bYears.includes(aYear) ? aYear : bYears[0]
    const bYear = bYears.includes(askedB) ? askedB : bDefault
    const town = async (code: string, year: number, years: number[]): Promise<CompareTown> => {
      const t = (await fieldTotalsOf(env, year)).get(code) ?? { total: 0, fields: {} }
      return { ...ref(code), path: jurisdictionPath(code), year, years, ...t }
    }
    const [ta, tb] = await Promise.all([town(a.code, aYear, aYears), b && bYear ? town(b.code, bYear, bYears) : null])
    return { sample, sitekey: siteKey(c), a: ta, b: tb, byUse, byPopulation, options, failed: false }
  } catch {
    return { ...none, failed: true }
  }
})

export const head = defineHead(() => ({ title: 'まち比べ — 風土記', meta: [{ name: 'robots', content: 'noindex' }] }))
