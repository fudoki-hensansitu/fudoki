// 自治体の個別ページ（/:都道府県/:名称）のデータの型と、金額・年度の表記。server（SSR・API）と画面（島）で同じものを使う
import type { Profile } from './profiles'

/** 款・項・目・節など、出典の1行。金額は API が返した円（画面で足し引きしない） */
export interface Line {
  /** apps/api の subject_id（科目の表の行）。子を引くときに使う */
  id: string
  name: string
  yen: number
  /** 出典に金額の印字がない。yen の 0 は表示に使わない */
  amountMissing?: true
}

export interface Setsu {
  name: string
  yen: number
  /** 出典に金額の印字がない。yen の 0 は表示に使わない */
  amountMissing?: true
}

export interface Moku extends Line {
  setsu: Setsu[]
  /** 自治体の科目の款・項の名前。分野で分けた図でも、目から事業を引くのに使う */
  path?: [string | null, string | null]
}

export interface Kou extends Line {
  /** 選択した表示階層までの目 */
  moku: Moku[]
}

/** 一つの款からの流れ（款 → 項 → 目 → 節） */
export interface Drill {
  kan: Line
  kou: Kou[]
}

export type FlowDepth = 'kou' | 'moku' | 'setsu'
/** お金の流れの分け方。cofog は分野（COFOG の大分類）→ 中分類、kan は自治体の科目（款 → 項） */
export type FlowView = 'cofog' | 'kan'

export interface Project extends Line {
  kanName: string
  kouName: string | null
  /** COFOG の大分類で決まる分野の名前（domains.ts）。COFOG の付かない目は「その他」 */
  domain: string
  /** 前の年度の同じ目（款・項・名前が一致したもの）。無ければ null */
  prevYen: number | null
}

export interface YearTotal {
  year: number
  /** 一般会計の款の支出済額の和（api の sum_rules: 同じ軸・同じ段の兄弟の和） */
  yen: number
  /** この年度の款ごとの金額（款の名前で引く） */
  kan: Line[]
}

/** 決算がまだ無い年度の一般会計の当初予算。目の和と、目の COFOG の大分類ごとの和（id は cofogFlow の kan.id と同じ cofog-XX / cofog-none） */
export interface BudgetTotal {
  year: number
  yen: number
  amountMissing?: true
  /** 款ごとの当初予算（大きい順） */
  kan: Line[]
  divisions: { id: string; yen: number; amountMissing?: true }[]
  /** 当初予算の大きい事業（目）。前年度との比較は持たない */
  projects: Project[]
}

/** 住民基本台帳人口。asOf は基準日（YYYY-MM-DD） */
export interface Population {
  people: number
  asOf: string
}

/**
 * 年度の金額と比べる人口。N 年度には N+1 年1月1日（年度末に近い基準日）の値を当て、まだ無ければいちばん新しい基準日の値で代える。
 * 代えたかどうかは asOf を見れば分かる
 */
export function populationForYear(list: Population[], fiscalYear: number): Population | null {
  return list.find((p) => p.asOf === `${fiscalYear + 1}-01-01`) ?? list.at(-1) ?? null
}

/** 1人あたりの金額。万円の小数1桁まで（52.3万円）。1万円未満は円で出す */
export function formatPerCapita(yen: number): string {
  if (yen < 1e4) return `${Math.round(yen).toLocaleString('ja-JP')}円`
  return `${(yen / 1e4).toLocaleString('ja-JP', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}万円`
}

/** 人口。1万人以上は万人の小数1桁（41.6万人）、それ未満は人単位（303人） */
export const formatPeople = (people: number) => (people >= 1e4 ? `${(people / 1e4).toFixed(1)}万人` : `${people.toLocaleString('ja-JP')}人`)

/** 基準日（2026-01-01）を「2026年1月1日」に */
export const formatAsOf = (asOf: string) => asOf.replace(/^(\d+)-0?(\d+)-0?(\d+)$/, '$1年$2月$3日')

export interface PageData {
  code: string
  name: string
  prefecture: string
  /** 都道府県自体の頁（/tokyo）。header の都道府県名から移る */
  prefecturePath: string
  /** 同じ都道府県で収録のある近くの自治体（自身と都道府県自体を除き、近い順に数件）。最後の節から回遊させる */
  neighbors: { code: string; name: string; path: string; /** 紋章の URL（emblems.ts に紋章がある自治体だけ） */ logo?: string }[]
  officialUrl: string | null
  population: Population | null
  originTitle: string | null
  /** 西暦、古い順 */
  years: YearTotal[]
  /** 最新年度の全款から全項への流れ */
  flow: Drill[]
  /** 最新年度の COFOG の流れ。Drill の kan に大分類、kou に中分類が入る */
  cofogFlow: Drill[]
  /** 最新の決算より後の年度の当初予算（古い順）。決算の無い年度の概要に使う */
  budgets: BudgetTotal[]
  projects: Project[]
  /** 方針・政策領域・事業の入れ替え（jurisdiction/profiles.ts）。手で起こした自治体だけにある */
  profile?: Profile | null
}

/** 頁で選べる年度（新しい順）。事業の振り返り（profile）と決算の年度を合わせる。先頭が頁の既定の年度 */
export const pageYears = (d: { years: { year: number }[]; profile?: { years: Record<string, unknown> } | null }) =>
  [...new Set([...Object.keys(d.profile?.years ?? {}).map(Number), ...d.years.map((y) => y.year)])].sort((a, b) => b - a)

/** 自治体の頁で選べる年度（新しい順に3年）。決算の年度と、決算より後の当初予算の年度 */
export const appPageYears = (d: { years: { year: number }[]; budgets: { year: number }[] }) =>
  [...new Set([...d.years.map((y) => y.year), ...d.budgets.map((b) => b.year)])].sort((a, b) => b - a).slice(0, 3)

/** 年度ごとの頁の path。既定の年度は自治体の頁そのもの（/tokyo/shinagawa）、ほかは1段下げる（/tokyo/shinagawa/2024） */
export const yearPath = (base: string, year: number, latest: number) => (year === latest ? base : `${base}/${year}`)

/** 今日を含む会計年度（4月始まり） */
export const currentFiscalYear = (now = new Date()) => (now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1)

/** 今年度からの近さで呼ぶ。今年度・昨年度・一昨年度・来年度のほかは和暦の年度 */
export function yearName(year: number, now = new Date()): string {
  const diff = currentFiscalYear(now) - year
  return diff === 0 ? '今年度' : diff === 1 ? '昨年度' : diff === 2 ? '一昨年度' : diff === -1 ? '来年度' : reiwa(year)
}

/** 西暦の会計年度を令和の R 表記にする（2025 → R7年度）。2019年より前は西暦のまま */
export const reiwa = (year: number) => (year >= 2019 ? `R${year - 2018}年度` : `${year}年度`)

/** 1億円以上は億円、それ未満は万円。3桁ごとに区切る。円の細かい数字は出典の頁で確かめてもらう */
export function formatYen(yen: number): string {
  if (yen === 0) return '0円'
  if (yen >= 1e8) return `${(yen / 1e8).toLocaleString('ja-JP', { maximumFractionDigits: yen >= 1e10 ? 0 : 1 })}億円`
  return `${Math.round(yen / 1e4).toLocaleString('ja-JP')}万円`
}

/** 前の年度との増減（%）。前が 0 や無いときは null */
export const changePct = (now: number, prev: number | null | undefined) => (prev ? ((now - prev) / prev) * 100 : null)

/** 前年度の金額がある款だけを比べる。未収録の年度を飛び越えて比較しない。 */
export function kanChanges(years: YearTotal[]): { name: string; pct: number }[] {
  const latest = years.at(-1)
  if (!latest) return []
  const previous = years.find((year) => year.year === latest.year - 1)
  if (!previous) return []
  return latest.kan.flatMap((kan) => {
    const pct = changePct(kan.yen, previous.kan.find((p) => p.name === kan.name)?.yen)
    return pct === null ? [] : [{ name: kan.name, pct: Math.round(pct * 10) / 10 }]
  })
}

/** 自治体の一覧。個別ページの path は server 側の path.ts が作る */
export const INDEX_PATH = '/jurisdictions'

/** 全体に占める割合（%）の表記。サンキー図のラベルに使い、金額はツールチップで見せる。基準が無い・金額未記載のときは null */
export function formatShare(yen: number, base: number, missing?: boolean): string | null {
  if (missing || !(base > 0)) return null
  const pct = (Math.max(0, yen) / base) * 100
  if (pct === 0) return '0%'
  if (pct < 0.1) return '<0.1%'
  if (pct < 1) return `${pct.toFixed(1)}%`
  return `${Math.round(pct)}%`
}

/** 一覧での自治体の種類。名称の末尾で分ける（自治体マスタに種類の列が無いため） */
export type JurisdictionKind = '都道府県' | '区' | '市' | '町村'

/** 一覧の1自治体。決算を収録している自治体だけを載せる */
export interface IndexEntry {
  code: string
  name: string
  prefecture: string
  kind: JurisdictionKind
  /** 個別ページの path（/tokyo/shinagawa） */
  path: string
  /** 最新の決算の年度と、一般会計の歳出の総額（款の和） */
  year: number
  yen: number
  /** 最新の決算の年度と比べる人口（populationForYear）。無ければ null */
  population: Population | null
  /** 歳出の総額を population で割った1人あたりの金額 */
  perCapita: number | null
  /** 出典に金額の印字が無い款があり、yen はそれを除いた款の和 */
  amountMissing?: true
}

/** 名称の末尾から種類を決める。都道府県は自治体コードの5桁目までが 0（130001 → 13000） */
export function jurisdictionKind(code: string, name: string): JurisdictionKind {
  if (code.slice(2, 5) === '000') return '都道府県'
  if (name.endsWith('区')) return '区'
  if (name.endsWith('市')) return '市'
  return '町村'
}
