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
/** 科目の表・内訳の表の1行（server の列のうち View が使うもの） */
interface RowBase {
  document_kind: string
  jurisdiction_code: string
  fiscal_year: number
  account_name: string
  code: string | null
  name: string
  amount_yen: number | null
  kan_name: string
  kou_name: string | null
  moku_name: string | null
  is_leaf: boolean
  origin_id: string
}
export interface SubjectRow extends RowBase {
  subject_id: string
  parent_subject_id: string | null
  level: string
}
export interface DetailRow extends RowBase {
  detail_id: string
  parent_detail_id: string | null
  subject_id: string
  breakdown: string
  node_kind: string
}
type Location = PdfLocation & { row_id: string }

/**
 * View の中で扱う1行。科目と内訳を同じ形にし、開くときの tool と引数を持たせる。
 * axis は内訳の分け方（科目の行は「科目」）、node_kind は段（款・項・目）か内訳の区分。
 */
export interface TreeNode extends PdfLocation {
  id: string
  parent_id: string | null
  is_subject: boolean
  open: { tool: 'get_expenditure_subject' | 'get_expenditure_detail'; args: Json }
  document_kind: string
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
  moku_name: string | null
  origin_id: string
}
export type ViewData = {
  origins?: Origin[]
  next_page_token?: string | null
} & (
  | { nodes: TreeNode[] }
  | { node: TreeNode; children: Record<string, TreeNode[]> }
)

export function toolFor(data: Json): string | undefined {
  if (Array.isArray(data.subjects)) return 'search_expenditure_subjects'
  if (Array.isArray(data.details)) return 'search_expenditure_details'
  if (data.subject && data.children) return 'get_expenditure_subject'
  if (data.detail && data.children) return 'get_expenditure_detail'
}

const NO_LOCATION: PdfLocation = {
  source_page: null, source_x0: null, source_y0: null, source_x1: null, source_y1: null,
  amount_source_page: null, amount_source_x0: null, amount_source_y0: null, amount_source_x1: null, amount_source_y1: null,
}
const base = (r: RowBase, at: Map<string, Location>, id: string) => {
  const { row_id: _, ...location } = at.get(id) ?? { row_id: id, ...NO_LOCATION }
  return {
    ...location,
    document_kind: r.document_kind, jurisdiction_code: r.jurisdiction_code, fiscal_year: r.fiscal_year, account_name: r.account_name,
    code: r.code, name: r.name, amount_yen: r.amount_yen, kan_name: r.kan_name, kou_name: r.kou_name, moku_name: r.moku_name, origin_id: r.origin_id,
  }
}
const fromSubject = (r: SubjectRow, at: Map<string, Location>): TreeNode => ({
  ...base(r, at, r.subject_id), id: r.subject_id, parent_id: r.parent_subject_id, is_subject: true,
  open: { tool: 'get_expenditure_subject', args: { subject_id: r.subject_id } }, axis: '科目', node_kind: r.level,
})
/** 直下の内訳（depth 1）の親は科目にする。同じ科目の同じ分け方の内訳が兄弟になる */
const fromDetail = (r: DetailRow, at: Map<string, Location>): TreeNode => ({
  ...base(r, at, r.detail_id), id: r.detail_id, parent_id: r.parent_detail_id ?? r.subject_id, is_subject: false,
  open: { tool: 'get_expenditure_detail', args: { detail_id: r.detail_id } }, axis: r.breakdown, node_kind: r.node_kind,
})

/** server の結果（科目・内訳の検索と取得）を View の形にそろえる。印字の位置は行に重ねる */
export function toView(data: Json): ViewData {
  const at = new Map(((data.locations ?? []) as Location[]).map((l) => [l.row_id, l]))
  const common = { origins: data.origins as Origin[] | undefined, next_page_token: data.next_page_token as string | null | undefined }
  if (Array.isArray(data.subjects)) return { ...common, nodes: (data.subjects as SubjectRow[]).map((r) => fromSubject(r, at)) }
  if (Array.isArray(data.details)) return { ...common, nodes: (data.details as DetailRow[]).map((r) => fromDetail(r, at)) }
  if (data.subject) {
    const children: Record<string, TreeNode[]> = {}
    const subjects = (data.children as SubjectRow[]).map((r) => fromSubject(r, at))
    if (subjects.length) children['科目'] = subjects
    for (const [breakdown, rows] of Object.entries(data.details as Record<string, DetailRow[]>)) children[breakdown] = rows.map((r) => fromDetail(r, at))
    return { ...common, node: fromSubject(data.subject as SubjectRow, at), children }
  }
  const detail = fromDetail(data.detail as DetailRow, at)
  const kids = (data.children as DetailRow[]).map((r) => fromDetail(r, at))
  return { ...common, node: detail, children: kids.length ? { [detail.axis]: kids } : {} }
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
