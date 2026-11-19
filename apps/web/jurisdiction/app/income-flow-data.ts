// 「入る→使う」の数字の組み立て。自治体の頁（income-flow.tsx）とアシスタントの見せる tool（server/views/money-flow.ts）が同じものを使い、頁と会話で数字がずれないようにする
import type { Drill, RevenueDoc } from '../types'

export type Tone = 'in' | 'out' | 'rest'
export type Node = { id: string; label: string; yen: number; tone: Tone; base?: number; onClick?: () => void }

export type IncomeFlowData = {
  words: [string, string]
  /** 歳入の総額 */
  revenue: number
  /** 歳出の総額 */
  expenditure: number
  incoming: Node[]
  /** 使うは分野。決算で入ったお金が多い分は最後に「翌年度へ繰り越すお金など」 */
  outgoing: Node[]
  /** 入るの1人あたり（住民税（個人）か、まちの税で割る）。人口が無ければ null */
  perIn: { label: string; yen: number } | null
  /** 使うの1人あたり。人口が無ければ null */
  perOut: { label: string; yen: number } | null
}

/** 住民税（個人）の額。歳入の項「〇民税」（特別区民税・市町村民税など）の中に「個人」の目・節があればその和、無ければ項の額。項が無ければ null */
function residentTax(revenue: Drill[] | undefined): number | null {
  const kou = revenue?.flatMap((k) => k.kou).find((o) => /(区|市町村|市|町|村)民税$/.test(o.name) && !o.amountMissing)
  if (!kou) return null
  const personal = kou.moku.flatMap((m) => (m.name.includes('個人') ? [m.yen] : m.setsu.filter((x) => x.name.includes('個人') && !x.amountMissing).map((x) => x.yen)))
  return personal.length ? personal.reduce((a, v) => a + v, 0) : kou.yen
}

/** fields は歳出の分野（金額の多い順、その他は最後）。revenue は歳入の款・項・目・節（1人あたりの住民税に使う） */
export function incomeFlowOf({ doc, revenue, phase, expTotal, fields, pop }: {
  doc: RevenueDoc
  revenue?: Drill[]
  phase: 'initial' | 'settlement'
  expTotal: number
  fields: { id: string; name: string; yen: number }[]
  pop: number
}): IncomeFlowData {
  const words: [string, string] = phase === 'initial' ? ['入る', '使う'] : ['入った', '使った']
  const kan = doc.kan.filter((k): k is typeof k & { yen: number } => k.yen != null && k.yen > 0)
  // 入るは款（特別区税・交付金・国庫支出金など）で分ける。細かい款は名前が重なるので、多い順に7つまで出し、残りは「ほかの収入」にまとめる
  const sorted = [...kan].sort((a, b) => b.yen - a.yen)
  const shown = sorted.length > 8 ? sorted.slice(0, 7) : sorted
  const others = sorted.slice(shown.length).reduce((s, k) => s + k.yen, 0)
  const incoming: Node[] = [...shown.map((k) => ({ id: k.name, label: k.name, yen: k.yen, tone: 'in' as const, base: doc.total })), ...(others > 0 ? [{ id: 'others', label: 'ほかの収入', yen: others, tone: 'in' as const, base: doc.total }] : [])]
  const outgoing: Node[] = fields.filter((f) => f.yen > 0).map((f) => ({ id: f.id, label: f.name, yen: f.yen, tone: 'out' as const, base: expTotal }))
  // 決算は入ったお金が使ったお金より多い。差は翌年度へ繰り越すお金などなので、灰色で右に足して入ると使うの高さを揃える
  const rest = doc.total - expTotal
  if (rest > 0) outgoing.push({ id: 'rest', label: '翌年度へ繰り越すお金など', yen: rest, tone: 'rest' })
  // 入るの1人あたりは、歳入の総額でなく住民税（個人）で割る。住民税の項が引けないときは、まちの税（区分「まちの税」の款の和）で割る
  const resident = residentTax(revenue)
  const tax = kan.reduce((s, k) => s + (k.category === 'まちの税' ? k.yen : 0), 0)
  const perIn = !pop ? null : resident && resident > 0 ? { label: '1人あたりの住民税', yen: resident / pop } : tax > 0 ? { label: '1人あたりの税金', yen: tax / pop } : null
  return { words, revenue: doc.total, expenditure: expTotal, incoming, outgoing, perIn, perOut: pop ? { label: '1人あたり', yen: expTotal / pop } : null }
}
