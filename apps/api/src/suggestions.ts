import { validSuggestions, type Suggestion } from '../../../packages/fiscal/suggestions'

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
 * 内訳は金額が最大の「子を持つ」ノード、比較は注目するノード（詳細ならそのノード、検索なら金額が最大のもの）について出す。
 */
export function suggestionsFor(tool: string, out: unknown, jurisdictionNames: Record<string, string>): Suggestion[] {
  let focus: Node | undefined
  let drill: Node | undefined
  if (tool === 'get_expenditure_node') {
    const o = out as { node: Node; children: Record<string, Node[]> }
    focus = o.node
    drill = biggest(Object.values(o.children).flat().filter((n) => !n.is_leaf))
  } else if (tool === 'search_expenditure_nodes') {
    const nodes = (out as { nodes: Node[] }).nodes
    focus = biggest(nodes)
    drill = biggest(nodes.filter((n) => !n.is_leaf))
  }
  if (!focus) return []

  const scope = (n: Node) => `${jurisdictionNames[n.jurisdiction_code] ?? '同じ自治体'}の${yearOf(n)}`
  const out3: Suggestion[] = []
  if (drill) out3.push({ label: `「${short(drill.name)}」の内訳を見る`, prompt: `${scope(drill)}の「${drill.name}」の内訳を見せて` })
  out3.push({ label: `「${short(focus.name)}」を他の年度と比べる`, prompt: `${scope(focus)}の「${focus.name}」を他の年度と比べて` })
  out3.push({ label: `「${short(focus.name)}」を他の自治体と比べる`, prompt: `${yearOf(focus)}の「${focus.name}」を他の自治体と比べて` })
  // 名前が長くて上限を超えた候補は、読み手に黙って捨てられる前にここで外す
  return validSuggestions(out3)
}
