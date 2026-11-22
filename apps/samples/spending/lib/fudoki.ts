// 風土記（fudoki.dev）から読むデータの形と、レシートに使う見え方。
// データは fudoki.dev の /api/jurisdictions/:code（自治体の頁と同じ1年度の款項目を分野ごとに足したもの）をそのまま使い、ここでは並べ替えと名前付けだけをする。
// 分野の並び・名前・仕事の例は packages/fiscal/domains.ts を web と共有する
import { DOMAIN_FRAMES, OTHER_FRAME } from '@fudoki/fiscal/domains'

export type Kind = 'initial' | 'settlement'

/** fudoki.dev の /api/jurisdictions/:code の応答のうち、レシートが使う部分 */
export type Snapshot = {
  code: string
  name: string
  /** 住民基本台帳人口。無い自治体は 0 */
  pop: number
  year: number
  /** 頁で選べる年度ごとの資料の種類 */
  kinds: Record<string, Kind>
  years: Record<string, { kind: Kind; total: number; fields: Record<string, number>; kan: Kan[]; looseMoku: Moku[] }>
}

/** 目（分野つき）。款・項の木の末端 */
export type Moku = { id: string; name: string; yen: number; field: string }
export type Kan = { name: string; yen: number; kou: { name: string; yen: number; moku: Moku[] }[] }

/** 自治体の検索（/api/jurisdictions?name=）の1件 */
export type TownEntry = { code: string; name: string; prefecture: string; kind: string; path: string }

/** 分野の並び（市民の関心の高い順）と名前・仕事の例は web と共有する（packages/fiscal/domains.ts）。その他は常に最後 */
const FRAMES = [...DOMAIN_FRAMES, OTHER_FRAME]

/** items は分野に入る目（金額の多い順）。目の無い項は分野の額には入るが items には出ない */
export type Field = { id: string; name: string; examples: string; yen: number; items: { id: string; name: string; yen: number }[] }

/** 1年度の見え方。分野は金額の多い順で、その他は常に最後 */
export function yearView(d: Snapshot) {
  const y = d.years[String(d.year)]!
  const moku = [...y.kan.flatMap((k) => k.kou.flatMap((o) => o.moku)), ...y.looseMoku]
  const itemsOf = (field: string) => moku.filter((m) => m.field === field && m.yen > 0).sort((a, b) => b.yen - a.yen).map((m) => ({ id: m.id, name: m.name, yen: m.yen }))
  const fields: Field[] = FRAMES.map(({ id, name, examples }) => ({ id, name, examples, yen: y.fields[id] ?? 0, items: itemsOf(id) }))
    .filter((f) => f.yen > 0)
    .sort((a, b) => Number(a.id === 'other') - Number(b.id === 'other') || b.yen - a.yen)
  return { year: d.year, total: y.total, fields, word: y.kind === 'settlement' ? ('決算' as const) : ('予算' as const) }
}
export type YearView = ReturnType<typeof yearView>

/** 頁で選べる年度（古い順） */
export const yearsOf = (d: Snapshot) => Object.keys(d.kinds).map(Number).sort((a, b) => a - b)

/** sum（整数）を weights の比で整数に割る。床で取り、大きい端数から1円ずつ足して和を sum に合わせる */
export function apportion(weights: number[], sum: number) {
  const whole = weights.reduce((a, b) => a + b, 0)
  const raw = weights.map((w) => (whole > 0 ? (w / whole) * sum : 0))
  const parts = raw.map(Math.floor)
  const rest = sum - parts.reduce((a, b) => a + b, 0)
  raw
    .map((r, i) => [r - Math.floor(r), i] as const)
    .sort((a, b) => b[0] - a[0])
    .slice(0, Math.max(0, rest))
    .forEach(([, i]) => parts[i]!++)
  return parts
}

/** 分野ごとの1人あたり（円）。和が合計（total を人口で割って丸めた額）に合うよう割る */
export function perHeadParts(fields: { yen: number }[], total: number, pop: number) {
  const sum = Math.round(total / pop)
  return { sum, parts: apportion(fields.map((f) => f.yen), sum) }
}

/** 額を兆・億・万の単位で区切った文字（9,606億8,000万円 の「円」の前まで）。0 の区切りは出さない。端数は丸めない */
export function withUnits(yen: number): string {
  const units = ['', '万', '億', '兆']
  let n = Math.max(0, Math.floor(yen))
  const parts: string[] = []
  for (let i = 0; n > 0 && i < units.length; i++) {
    const g = i === units.length - 1 ? n : n % 10000
    if (g) parts.unshift(`${g.toLocaleString('ja-JP')}${units[i]}`)
    n = i === units.length - 1 ? 0 : Math.floor(n / 10000)
  }
  return parts.join('') || '0'
}

/** 今の会計年度（4月始まり、日本時間） */
const currentFiscalYear = (now: Date) => {
  const jst = new Date(now.getTime() + 9 * 3600_000)
  return jst.getUTCMonth() < 3 ? jst.getUTCFullYear() - 1 : jst.getUTCFullYear()
}

/** 西暦の会計年度を令和の R 表記にする（2025 → R7年度）。2019年より前は西暦のまま */
export const reiwa = (year: number) => (year >= 2019 ? `R${year - 2018}年度` : `${year}年度`)

/** 今年度・昨年度・一昨年度・来年度。それより前は R 表記 */
export function yearName(year: number, now = new Date()): string {
  const diff = currentFiscalYear(now) - year
  return diff === 0 ? '今年度' : diff === 1 ? '昨年度' : diff === 2 ? '一昨年度' : diff === -1 ? '来年度' : reiwa(year)
}

/** 5桁の市区町村コードに検査数字を足して6桁にする（全国地方公共団体コード） */
export const withCheckDigit = (five: string) => {
  const r = [...five].reduce((s, d, i) => s + Number(d) * (6 - i), 0) % 11
  return `${five}${r === 0 ? 1 : (11 - r) % 10}`
}

/** まちのレシートの頁の題（head と、年度を替えたときの document.title） */
export const pageTitle = (name: string, year: number) => `${name}の1人あたりのレシート（${reiwa(year)}）｜風土記`

/** 風土記の本体。分野の続き・「詳細」・紋章はそこへ繋ぐ */
export const FUDOKI_ORIGIN = 'https://fudoki.dev'
/** このサイトの origin。風土記の本体（fudoki.dev）の Worker が BASE の下をこのサイトの Worker へ渡す。シェアのリンクと OG 画像の絶対 URL に使う */
export const SITE_ORIGIN = FUDOKI_ORIGIN
/** このサイトの頁を置く path（pages/spending/ と同じ。本体の apps/web の middleware が中継する path とも揃える） */
export const BASE = '/spending'
