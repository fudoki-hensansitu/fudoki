// まち比べ（/compare?a=131091&ay=2024&ak=settlement&b=131172&by=2024&bk=settlement）。2つのまちの一般会計を分野で並べ、a に似たまちを候補に出す。
// 左右それぞれで年度と資料（決算・当初予算）を選べるので、同じまちの年度どうしや、予算と決算も比べられる。
// a が無ければ見本（品川区）で開き、画面が住んでいるまちがあればそのまちで開き直す。b が無ければ a と使い方が一番近いまちにする。並びは良し悪しの順位にしない
import { defineHandler, defineHead } from 'void'
import { jurisdictionPath } from '../jurisdiction/path'
import { catalog } from '../server/jurisdiction-routes'
import { shownSettlementYears, type CatalogEntry } from '../server/jurisdiction'
import { closestByPopulation, closestByUse, fieldTotalsOf, type DocKind } from '../server/compare'
import type { Env } from '../server/env'
import { siteKey } from '../server/site-key'

/** 比べる資料。year 年度の kind（決算・当初予算） */
export type Version = { year: number; kind: DocKind }
/** 比べる片方。version は選んでいる資料、versions はこのまちで選べる資料（新しい順） */
export type CompareTown = { code: string; name: string; path: string; pop: number; version: Version; versions: Version[]; total: number; fields: Record<string, number> }
export type TownRef = { code: string; name: string; pop: number }
export type Props = {
  a: CompareTown | null
  b: CompareTown | null
  byUse: TownRef[]
  byPopulation: TownRef[]
  /** 選べるまち（一般会計の決算か当初予算があるまち） */
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
const same = (x: Version, y: Version) => x.year === y.year && x.kind === y.kind

/** まちで選べる資料。年度の新しい順、同じ年度は決算を先に */
function versionsOf(e: CatalogEntry): Version[] {
  const v = [...shownSettlementYears(e.settlementYears).map((year) => ({ year, kind: 'settlement' as const })), ...shownSettlementYears(e.initialYears).map((year) => ({ year, kind: 'initial' as const }))]
  return v.sort((x, y) => y.year - x.year || (x.kind === 'settlement' ? -1 : 1))
}

export const loader = defineHandler<Props>(async (c) => {
  const env = c.env as unknown as Env
  const none: Props = { a: null, b: null, byUse: [], byPopulation: [], options: [], failed: false, sample: false, sitekey: siteKey(c) }
  try {
    const cat = await catalog(env)
    const versions = new Map(cat.map((e) => [e.code, versionsOf(e)]))
    const entries = cat.filter((e) => versions.get(e.code)?.length)
    const options = entries.map((e) => ({ code: e.code, name: e.name }))
    const find = (code?: string) => entries.find((e) => e.code === code)
    const picked = find(c.req.query('a'))
    const sample = !picked
    const a = picked ?? find(SAMPLE) ?? entries[0]
    if (!a) return { ...none, options }
    const popOf = (code: string) => find(code)?.population?.people ?? 0
    const ref = (code: string): TownRef => ({ code, name: find(code)?.name ?? code, pop: popOf(code) })
    const asked = (side: 'a' | 'b'): Version => ({ year: Number(c.req.query(`${side}y`)), kind: c.req.query(`${side}k`) === 'initial' ? 'initial' : 'settlement' })
    const aVersions = versions.get(a.code)!
    // 指定が無ければ最新の決算（無ければ最新の資料）
    const aVersion = aVersions.find((v) => same(v, asked('a'))) ?? aVersions.find((v) => v.kind === 'settlement') ?? aVersions[0]!
    // 似たまちは a の資料で探す。都道府県は都道府県どうし、市区町村は市区町村どうしで探す
    const totals = await fieldTotalsOf(env, aVersion.year, aVersion.kind)
    const peers = entries.filter((e) => e.code !== a.code && isPrefecture(e.code) === isPrefecture(a.code))
    const mine = totals.get(a.code)
    // 似たまちは1人あたりの分野の金額で探す。a の人口が無ければ探さない
    const byUse = mine && popOf(a.code) ? closestByUse({ ...mine, base: popOf(a.code) }, peers.flatMap((e) => (totals.has(e.code) ? [[e.code, { ...totals.get(e.code)!, base: popOf(e.code) }] as [string, typeof mine & { base: number }]] : [])), SIMILAR + 1).map(ref) : []
    const myPop = popOf(a.code)
    const byPopulation = myPop ? closestByPopulation(myPop, peers.flatMap((e) => (popOf(e.code) ? [[e.code, popOf(e.code)] as [string, number]] : [])), SIMILAR + 1).map(ref) : []
    const b = find(c.req.query('b')) ?? find(byUse[0]?.code) ?? find(byPopulation[0]?.code) ?? peers[0]
    // b の資料: 指定が無ければ a と同じ資料。同じまちどうしなら、同じ年度の当初予算、無ければ1つ前の年度の同じ資料
    const bVersions = b ? versions.get(b.code)! : []
    const bDefault =
      b?.code === a.code
        ? (bVersions.find((v) => v.year === aVersion.year && v.kind !== aVersion.kind) ?? bVersions.find((v) => v.kind === aVersion.kind && v.year < aVersion.year) ?? aVersion)
        : (bVersions.find((v) => same(v, aVersion)) ?? bVersions[0])
    const bVersion = bVersions.find((v) => same(v, asked('b'))) ?? bDefault
    const town = async (code: string, version: Version, vs: Version[]): Promise<CompareTown> => {
      const t = (await fieldTotalsOf(env, version.year, version.kind)).get(code) ?? { total: 0, fields: {} }
      return { ...ref(code), path: jurisdictionPath(code), version, versions: vs, ...t }
    }
    const [ta, tb] = await Promise.all([town(a.code, aVersion, aVersions), b && bVersion ? town(b.code, bVersion, bVersions) : null])
    return { sample, sitekey: siteKey(c), a: ta, b: tb, byUse, byPopulation, options, failed: false }
  } catch {
    return { ...none, failed: true }
  }
})

export const head = defineHead(() => ({ title: 'まち比べ — 風土記', meta: [{ name: 'robots', content: 'noindex' }] }))
