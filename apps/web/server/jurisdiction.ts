// 自治体の個別ページのデータ。apps/api（Service Binding）の歳出の検索から、決算の款・事業・お金の流れを組む。
// 金額は API が返した円をそのまま持つ。足すのは「同じ年度・会計・軸の款（兄弟）の和」だけで、api の sum_rules に従う
import type { Drill, Kou, Line, Moku, PageData, Project, YearTotal } from '../jurisdiction/types'
import { apiFetch, type Env } from './env'

const API_ORIGIN = 'https://api.fudoki.dev'
const ACCOUNT = '一般会計'
/** 推移に出す最大の年数。API の fiscal_year の幅は 5 年以内 */
const MAX_YEARS = 5
const PROJECT_COUNT = 5
const SETSU_COUNT = 3
/** 目を金額で並べるときに先に取る件数。事業でない款（積立・公債・予備費）を除いても足りるようにする */
const CANDIDATES = 40
const NOT_PROJECT_KAN = new Set(['諸支出金', '公債費', '予備費'])

interface ApiNode {
  node_id: string
  node_kind: string
  name: string
  amount_yen: number | null
  fiscal_year: number
  kan_name: string | null
  kou_name: string | null
  amount_source_page: number | null
  source_page: number | null
  origin_id: string
}
interface SearchResponse {
  nodes: ApiNode[]
  origins?: { origin_id: string; title: string }[]
}
interface NodeResponse {
  node: ApiNode
  children: Record<string, ApiNode[]>
}
export interface CatalogEntry {
  code: string
  name: string
  prefecture: string
  /** 一般会計の決算がある年度（西暦、古い順） */
  settlementYears: number[]
}

async function call<T>(env: Env, path: string, body?: unknown): Promise<T> {
  const res = await apiFetch(env)(`${API_ORIGIN}${path}`, body === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`風土記の API が応答しませんでした（${path} ${res.status}）`)
  return (await res.json()) as T
}

const line = (n: ApiNode): Line => ({ id: n.node_id, name: n.name, yen: n.amount_yen ?? 0, page: n.amount_source_page ?? n.source_page })

/** 自治体と、一般会計の決算がある年度。収録が無い自治体は settlementYears が空 */
export async function loadCatalog(env: Env): Promise<CatalogEntry[]> {
  const out: CatalogEntry[] = []
  let token: string | undefined
  do {
    const r = await call<{
      jurisdictions: { jurisdiction_code: string; name: string; prefecture_name: string; coverage: { fiscal_year: number; document_kind: string; accounts: { account_name: string }[] }[] }[]
      next_page_token?: string | null
    }>(env, `/v1/jurisdictions${token ? `?page_token=${encodeURIComponent(token)}` : ''}`)
    for (const j of r.jurisdictions)
      out.push({
        code: j.jurisdiction_code,
        name: j.name,
        prefecture: j.prefecture_name,
        settlementYears: j.coverage.filter((c) => c.document_kind === 'settlement' && c.accounts.some((a) => a.account_name === ACCOUNT)).map((c) => c.fiscal_year).sort((a, b) => a - b),
      })
    token = r.next_page_token ?? undefined
  } while (token)
  return out
}

const search = (env: Env, code: string, years: { min: number; max: number }, nodeKind: string, extra: Record<string, unknown> = {}, pageSize = 200) =>
  call<SearchResponse>(env, '/v1/expenditure/nodes:search', {
    document_kind: 'settlement',
    fiscal_year: years,
    where: { jurisdiction_code: { eq: [code] }, account_name: { eq: [ACCOUNT] }, axis: { eq: ['科目'] }, node_kind: { eq: [nodeKind] }, ...extra },
    order_by: [{ column: 'amount_yen', desc: true }],
    page_size: pageSize,
  })

const children = async (env: Env, id: string) => (await call<NodeResponse>(env, `/v1/expenditure/nodes/settlement/${id}`)).children

/** 目の内訳。節があれば節、無ければ備考（事業の一覧）を上位だけ返す */
export async function loadSetsu(env: Env, mokuId: string) {
  const c = await children(env, mokuId)
  return (c['節'] ?? c['備考'] ?? []).filter((n) => (n.amount_yen ?? 0) > 0).sort((a, b) => (b.amount_yen ?? 0) - (a.amount_yen ?? 0)).slice(0, SETSU_COUNT).map((n) => ({ name: n.name, yen: n.amount_yen ?? 0 }))
}

/** 款の流れ。項は全部、一番大きい項だけ目（上位2つ）と節まで引く */
export async function loadDrillById(env: Env, kanId: string): Promise<Drill> {
  const r = await call<NodeResponse>(env, `/v1/expenditure/nodes/settlement/${kanId}`)
  if (r.node.node_kind !== '款') throw new Error('款ではありません')
  return loadDrill(env, line(r.node))
}

export async function loadDrill(env: Env, kan: Line): Promise<Drill> {
  const kouNodes = ((await children(env, kan.id))['科目'] ?? []).filter((n) => n.node_kind === '項').sort((a, b) => (b.amount_yen ?? 0) - (a.amount_yen ?? 0))
  const kou: Kou[] = kouNodes.map((n) => ({ ...line(n), moku: [] }))
  const top = kouNodes[0]
  if (top) {
    const mokuNodes = ((await children(env, top.node_id))['科目'] ?? []).filter((n) => n.node_kind === '目').sort((a, b) => (b.amount_yen ?? 0) - (a.amount_yen ?? 0)).slice(0, 2)
    kou[0]!.moku = await Promise.all(mokuNodes.map(async (n): Promise<Moku> => ({ ...line(n), setsu: await loadSetsu(env, n.node_id) })))
  }
  return { kan, kou }
}

export async function loadPage(env: Env, entry: CatalogEntry): Promise<PageData | null> {
  const years = entry.settlementYears.slice(-MAX_YEARS)
  const latest = years.at(-1)
  if (latest === undefined) return null
  const range = { min: years[0]!, max: latest }
  const [kanRes, mokuRes] = await Promise.all([search(env, entry.code, range, '款'), search(env, entry.code, { min: latest, max: latest }, '目', {}, CANDIDATES)])
  // 積立・公債・予備費の款は「事業」ではないので、力を入れている事業の候補から外す
  const picked = mokuRes.nodes.filter((n) => !NOT_PROJECT_KAN.has(n.kan_name ?? '')).slice(0, PROJECT_COUNT)
  const prevRes =
    years.length > 1 && picked.length > 0
      ? await search(env, entry.code, { min: latest - 1, max: latest - 1 }, '目', { name: { eq: [...new Set(picked.map((n) => n.name))] } }, 200)
      : { nodes: [] as ApiNode[] }
  const totals: YearTotal[] = years.map((year) => {
    const kan = kanRes.nodes.filter((n) => n.fiscal_year === year).map(line)
    return { year, yen: kan.reduce((s, k) => s + k.yen, 0), kan }
  })
  const topKan = totals.at(-1)!.kan[0]
  if (!topKan) return null
  const projects: Project[] = picked.map((n) => ({
    ...line(n),
    kanName: n.kan_name ?? '',
    kouName: n.kou_name,
    prevYen: prevRes.nodes.find((p) => p.name === n.name && p.kan_name === n.kan_name && p.kou_name === n.kou_name)?.amount_yen ?? null,
  }))
  return {
    code: entry.code,
    name: entry.name,
    prefecture: entry.prefecture,
    originTitle: kanRes.origins?.find((o) => o.origin_id === kanRes.nodes.find((n) => n.fiscal_year === latest)?.origin_id)?.title ?? null,
    years: totals,
    flow: await loadDrill(env, topKan),
    projects,
  }
}

