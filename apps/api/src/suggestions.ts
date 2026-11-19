import { validSuggestions, type Suggestion } from '../../../packages/fiscal/suggestions'
import { JURISDICTION_TABLE } from './columns'
import type { Ctx } from './shared/context'

interface Node {
  name: string
  jurisdiction_code: string
  account_name: string
  fiscal_year: number
  document_kind: string
  amount_yen: number | null
  is_leaf: boolean
}

const KIND_LABEL: Record<string, string> = { settlement: '決算', initial: '当初予算' }
const LABEL_NAME_CHARS = 14

const yearOf = (n: Node) => `${n.fiscal_year}年度${KIND_LABEL[n.document_kind] ?? n.document_kind}（${n.account_name}）`
const short = (name: string) => (name.length > LABEL_NAME_CHARS ? `${name.slice(0, LABEL_NAME_CHARS)}…` : name)
const biggest = (nodes: Node[]) => nodes.reduce<Node | undefined>((top, n) => (n.amount_yen !== null && n.amount_yen > (top?.amount_yen ?? -1) ? n : top), undefined)

/**
 * 結果から決定的に作る次の質問の候補。AI には作らせない。
 * 内訳は金額が最大の「子を持つ」行、比較は注目するノード（詳細ならそのノード、検索なら金額が最大のもの）について出す。
 */
export function suggestionsFor(tool: string, out: unknown, jurisdictionNames: Record<string, string>): Suggestion[] {
  let focus: Node | undefined
  let drill: Node | undefined
  if (tool === 'get_expenditure_line') {
    const o = out as { line: Node; child_subjects: Node[]; details: Record<string, Node[]> }
    focus = o.line
    drill = biggest([...o.child_subjects, ...Object.values(o.details).flat()].filter((n) => !n.is_leaf))
  } else if (tool === 'search_expenditure_subjects' || tool === 'search_expenditure_details') {
    const rows = (out as { subjects?: Node[]; details?: Node[] })
    const nodes = rows.subjects ?? rows.details ?? []
    focus = biggest(nodes)
    drill = biggest(nodes.filter((n) => !n.is_leaf))
  }
  if (!focus) return []

  const scope = (n: Node) => `${jurisdictionNames[n.jurisdiction_code] ?? '同じ自治体'}の${yearOf(n)}`
  const out3: Suggestion[] = []
  if (drill) out3.push({ label: `「${short(drill.name)}」の内訳を見る`, prompt: `${scope(drill)}の「${drill.name}」の内訳を見せて` })
  out3.push({ label: `「${short(focus.name)}」を他の年度と比べる`, prompt: `${scope(focus)}の「${focus.name}」を他の年度と比べて` })
  out3.push({ label: `「${short(focus.name)}」を他の自治体と比べる`, prompt: `${scope(focus)}の「${focus.name}」を他の自治体と比べて` })
  // 名前が長くて上限を超えた候補は、読み手に黙って捨てられる前にここで外す
  return validSuggestions(out3)
}

/** 結果に出てくる自治体コードの名前。次の質問の候補と、MCP の View が自治体コードの代わりに出す名前（_meta）に使う */
export async function jurisdictionNames(ctx: Ctx, out: unknown): Promise<Record<string, string>> {
  type Coded = { jurisdiction_code: string }
  const o = out as { subjects?: Coded[]; details?: Coded[] | Record<string, Coded[]>; line?: Coded; child_subjects?: Coded[] }
  const details = Array.isArray(o.details) ? o.details : Object.values(o.details ?? {}).flat()
  const codes = [...new Set([...(o.subjects ?? []), ...details, ...(o.line ? [o.line] : []), ...(o.child_subjects ?? [])].map((n) => n.jurisdiction_code))]
  if (!codes.length) return {}
  // D1 は1文の bind を100個までに制限するので、100件ずつに分けて1つの batch で読む
  const chunks = Array.from({ length: Math.ceil(codes.length / 100) }, (_, i) => codes.slice(i * 100, i * 100 + 100))
  const pages = await ctx.db.batch<{ jurisdiction_code: string; name: string }>(
    chunks.map((c) =>
      ctx.db.prepare(`SELECT "jurisdiction_code", "name" FROM ${JURISDICTION_TABLE} WHERE "jurisdiction_code" IN (${c.map(() => '?').join(', ')})`).bind(...c)
    )
  )
  return Object.fromEntries(pages.flatMap((p) => p.results).map((r) => [r.jurisdiction_code, r.name]))
}
