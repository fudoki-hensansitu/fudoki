export interface PdfLocation {
  source_page: number | null
  source_x0: number | null
  source_y0: number | null
  source_x1: number | null
  source_y1: number | null
  amount_source_page: number | null
  amount_source_x0: number | null
  amount_source_y0: number | null
  amount_source_x1: number | null
  amount_source_y1: number | null
}

export type Json = Record<string, unknown>
export interface Origin {
  origin_id: string
  title: string
  url: string
  format: string
}
export interface TreeNode extends PdfLocation {
  document_kind: string
  node_id: string
  parent_node_id?: string | null
  is_subject?: boolean
  jurisdiction_code: string
  fiscal_year: number
  account_name: string
  axis: string
  node_kind: string
  code: string | null
  name: string
  amount_yen: number | null
  kan_name: string
  kou_name: string | null
  origin_id: string
}
export interface Jurisdiction {
  jurisdiction_code: string
  name: string
  prefecture_name: string
  coverage: {
    fiscal_year: number
    document_kind: string
    accounts: {
      account_name: string
      account_kind: string
      origins: Origin[]
    }[]
  }[]
}
export type ViewData = {
  origins?: Origin[]
  next_page_token?: string | null
} & (
  | { jurisdictions: Jurisdiction[] }
  | { nodes: TreeNode[] }
  | { node: TreeNode; children: Record<string, TreeNode[]> }
)

export function toolFor(data: Json): string | undefined {
  if (Array.isArray(data.jurisdictions)) return 'list_jurisdictions'
  if (Array.isArray(data.nodes)) return 'search_expenditure_nodes'
  if (data.node && data.children) return 'get_expenditure_node'
}
export const KIND_LABEL: Record<string, string> = {
  settlement: '決算',
  initial: '当初予算',
}
export const yen = (value: number | null) =>
  value === null ? '—' : `${value.toLocaleString('ja-JP')}円`
/** 桁数の大きい金額を兆・億・万で丸める。兆・億は小数第1位まで出す。正確な額は yen で title に置く。 */
export function shortYen(value: number | null) {
  if (value === null) return '—'
  const abs = Math.abs(value)
  const round = (v: number, unit: string) =>
    `${v.toLocaleString('ja-JP', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}${unit}円`
  if (abs >= 1e12) return round(value / 1e12, '兆')
  if (abs >= 1e8) return round(value / 1e8, '億')
  if (abs >= 1e4) return `${Math.round(value / 1e4).toLocaleString('ja-JP')}万円`
  return yen(value)
}
export const percent = (share: number) =>
  share > 0 && share < 0.001 ? '0.1%未満' : `${(share * 100).toFixed(share >= 0.1 ? 0 : 1)}%`

/** 棒の長さ（%）。割合を出すときは合計に対する比、出さないときは最大の行に対する比 */
export function barWidths(amounts: (number | null)[], share: boolean): number[] {
  const positive = amounts.map((v) => v ?? 0).filter((v) => v > 0)
  const base = share ? positive.reduce((sum, v) => sum + v, 0) : Math.max(0, ...positive)
  return amounts.map((v) => (v !== null && v > 0 && base > 0 ? (v / base) * 100 : 0))
}
