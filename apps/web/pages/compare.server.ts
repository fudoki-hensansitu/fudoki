// まち比べ（/compare?a=131091&ay=2024&ak=settlement&b=131172&by=2024&bk=settlement）。2つのまちの一般会計を分野で並べ、a に似たまちを候補に出す。
// 左右それぞれで年度と資料（決算・当初予算）を選べるので、同じまちの年度どうしや、予算と決算も比べられる。
// a が無ければ見本（品川区）で開き、画面が住んでいるまちがあればそのまちで開き直す。b が無ければ a と分野の割合が一番近いまちにする。並びは良し悪しの順位にしない
import { defineHandler, defineHead } from 'void'
import { jurisdictionPath } from '../jurisdiction/path'
import { loadCatalogEntry, shownSettlementYears, type CatalogEntry, type DocumentKind } from '../server/jurisdiction'
import { loadFieldTotals, similarTowns, type FieldTotals, type TownRef } from '../server/compare'
import type { Env } from '../server/env'
import { siteKey } from '../server/site-key'

/** 比べる資料。year 年度の kind（決算・当初予算） */
export type Version = { year: number; kind: DocumentKind }
/** 比べる片方。version は選んでいる資料、versions はこのまちで選べる資料（新しい順） */
export type CompareTown = { code: string; name: string; path: string; pop: number; version: Version; versions: Version[]; total: number; fields: Record<string, number> }
export type { TownRef }
export type Props = {
  a: CompareTown | null
  b: CompareTown | null
  byUse: TownRef[]
  byPopulation: TownRef[]
  failed: boolean
  /** アシスタントの Turnstile の site key */
  sitekey: string
  /** a の指定が無いので、見本の組み合わせを出している（画面は住んでいるまちがあればそのまちで開き直す） */
  sample: boolean
}

const SIMILAR = 5
// a の指定が無いときの見本: 品川区と、使い方が一番近いまち
const SAMPLE = '131091'
const same = (x: Version, y: Version) => x.year === y.year && x.kind === y.kind

/** まちで選べる資料。年度の新しい順、同じ年度は決算を先に */
function versionsOf(e: CatalogEntry): Version[] {
  const v = [...shownSettlementYears(e.settlementYears).map((year) => ({ year, kind: 'settlement' as const })), ...shownSettlementYears(e.initialYears).map((year) => ({ year, kind: 'initial' as const }))]
  return v.sort((x, y) => y.year - x.year || (x.kind === 'settlement' ? -1 : 1))
}

const CODE = /^\d{6}$/
const entryOf = async (env: Env, code?: string) => (code && CODE.test(code) ? loadCatalogEntry(env, code) : null)

export const loader = defineHandler<Props>(async (c) => {
  const env = c.env as unknown as Env
  const none: Props = { a: null, b: null, byUse: [], byPopulation: [], failed: false, sample: false, sitekey: siteKey(c) }
  try {
    // 比べる2つのまちは、一覧を読まずにコードで1件ずつ引く
    const [picked, askedB] = await Promise.all([entryOf(env, c.req.query('a')), entryOf(env, c.req.query('b'))])
    const sample = !picked || !versionsOf(picked).length
    const a = sample ? await entryOf(env, SAMPLE) : picked
    if (!a || !versionsOf(a).length) return none
    const asked = (side: 'a' | 'b'): Version => ({ year: Number(c.req.query(`${side}y`)), kind: c.req.query(`${side}k`) === 'initial' ? 'initial' : 'settlement' })
    const aVersions = versionsOf(a)
    // 指定が無ければ最新の決算（無ければ最新の資料）
    const aVersion = aVersions.find((v) => same(v, asked('a'))) ?? aVersions.find((v) => v.kind === 'settlement') ?? aVersions[0]!
    const { byUse, byPopulation } = await similarTowns(env, { code: a.code, pop: a.population?.people ?? 0 }, aVersion.year, aVersion.kind, SIMILAR + 1)
    // b の指定が無ければ、分野の割合が一番近いまち（無ければ人口が一番近いまち）
    const fallback = askedB && versionsOf(askedB).length ? null : await entryOf(env, (byUse[0] ?? byPopulation[0])?.code)
    const b = askedB && versionsOf(askedB).length ? askedB : fallback
    // b の資料: 指定が無ければ a と同じ資料。同じまちどうしなら、同じ年度の当初予算、無ければ1つ前の年度の同じ資料
    const bVersions = b ? versionsOf(b) : []
    const bDefault =
      b?.code === a.code
        ? (bVersions.find((v) => v.year === aVersion.year && v.kind !== aVersion.kind) ?? bVersions.find((v) => v.kind === aVersion.kind && v.year < aVersion.year) ?? aVersion)
        : (bVersions.find((v) => same(v, aVersion)) ?? bVersions[0])
    const bVersion = bVersions.find((v) => same(v, asked('b'))) ?? bDefault
    // 分野の額は比べる2つの資料の歳出の根だけを引く（科目の表は読まない）
    const totalsOf = await loadFieldTotals(env, [{ code: a.code, ...aVersion }, ...(b && bVersion ? [{ code: b.code, ...bVersion }] : [])]).catch(() => () => undefined)
    const empty: FieldTotals = { total: 0, fields: {} }
    const town = (e: CatalogEntry, v: Version, vs: Version[]): CompareTown => ({ code: e.code, name: e.name, pop: e.population?.people ?? 0, path: jurisdictionPath(e.code), version: v, versions: vs, ...(totalsOf({ code: e.code, ...v }) ?? empty) })
    const ta = town(a, aVersion, aVersions)
    const tb = b && bVersion ? town(b, bVersion, bVersions) : null
    return { sample, sitekey: siteKey(c), a: ta, b: tb, byUse, byPopulation, failed: false }
  } catch {
    // 読めなかった頁は CDN に残さない（直ったあとも1時間エラーが出続けるため）
    c.header('x-revalidate', '0')
    return { ...none, failed: true }
  }
})

export const head = defineHead(() => ({ title: 'まち比べ — 風土記', meta: [{ name: 'robots', content: 'noindex' }] }))
