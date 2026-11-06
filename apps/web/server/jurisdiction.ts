// 自治体の個別ページのデータ。apps/api（Service Binding）の歳出の検索から、決算の款・事業・お金の流れを組む。
// 金額は API が返した円をそのまま持つ。足すのは「同じ年度・会計・軸の款（兄弟）の和」だけで、api の sum_rules に従う
import { jurisdictionKind, populationForYear, type Drill, type FlowDepth, type IndexEntry, type Kou, type Line, type Moku, type PageData, type Population, type Project, type Setsu, type YearTotal } from '../jurisdiction/types'
import { DOMAIN_FRAMES, frameOf, OTHER_FRAME } from '../jurisdiction/domains'
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
  parent_node_id: string | null
  node_kind: string
  is_subject: boolean
  axis: string
  name: string
  amount_yen: number | null
  fiscal_year: number
  kan_name: string | null
  kou_name: string | null
  amount_source_page: number | null
  source_page: number | null
  origin_id: string
  /** 目だけに付く。assigned・tentative のときだけコードがある */
  cofog_code?: string | null
}
interface SearchResponse {
  nodes: ApiNode[]
  next_page_token?: string | null
  origins?: { origin_id: string; title: string }[]
}
interface NodeResponse {
  node: ApiNode
  children: Record<string, ApiNode[]>
  next_page_token?: string | null
}
export interface CatalogEntry {
  code: string
  name: string
  prefecture: string
  /** 一般会計の決算がある年度（西暦、古い順） */
  settlementYears: number[]
  officialUrl: string | null
  /** いちばん新しい基準日の住民基本台帳人口 */
  population: Population | null
  /** 住民基本台帳人口の全基準日（古い順） */
  populations: Population[]
}

async function call<T>(env: Env, path: string, body?: unknown): Promise<T> {
  const res = await apiFetch(env)(`${API_ORIGIN}${path}`, body === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`風土記の API が応答しませんでした（${path} ${res.status}）`)
  return (await res.json()) as T
}

const line = (n: ApiNode): Line => ({ id: n.node_id, name: n.name, yen: n.amount_yen ?? 0, ...(n.amount_yen === null ? { amountMissing: true as const } : {}), page: n.amount_source_page ?? n.source_page })

/** 自治体と、一般会計の決算がある年度。収録が無い自治体は settlementYears が空 */
export async function loadCatalog(env: Env): Promise<CatalogEntry[]> {
  const out: CatalogEntry[] = []
  let token: string | undefined
  do {
    const r = await call<{
      jurisdictions: {
        jurisdiction_code: string
        name: string
        prefecture_name: string
        // 同期前の API は返さない
        official_url?: string | null
        population?: { reference_date: string; population: number }[]
        coverage: { fiscal_year: number; document_kind: string; accounts: { account_name: string }[] }[]
      }[]
      next_page_token?: string | null
    }>(env, `/v1/jurisdictions${token ? `?page_token=${encodeURIComponent(token)}` : ''}`)
    for (const j of r.jurisdictions) {
      const populations = (j.population ?? []).map((p) => ({ people: p.population, asOf: p.reference_date }))
      out.push({
        code: j.jurisdiction_code,
        name: j.name,
        prefecture: j.prefecture_name,
        settlementYears: j.coverage.filter((c) => c.document_kind === 'settlement' && c.accounts.some((a) => a.account_name === ACCOUNT)).map((c) => c.fiscal_year).sort((a, b) => a - b),
        officialUrl: j.official_url ?? null,
        population: populations.at(-1) ?? null,
        populations,
      })
    }
    token = r.next_page_token ?? undefined
  } while (token)
  return out
}

/** 一覧の1回の検索に載せる自治体の数。API は年と条件の値の bind を合わせて 90 個までにしている */
const INDEX_BATCH = 60

/**
 * 一覧（/jurisdictions）のデータ。収録している自治体の款を、自治体をまとめて検索して最新の決算ごとに足す。
 * 総額の足し方は個別ページ（loadPage の totals）と同じ「一般会計の款の和」
 */
export async function loadIndex(env: Env, entries: CatalogEntry[], pathOf: (code: string) => string): Promise<IndexEntry[]> {
  const have = entries.filter((e) => e.settlementYears.length > 0)
  const latest = new Map(have.map((e) => [e.code, e.settlementYears.at(-1)!]))
  const kan = new Map<string, { name: string; yen: number | null }[]>()
  // 最新の年度が同じ自治体ごとに引く（他の年度の款を取らない）
  for (const year of new Set(latest.values())) {
    const sameYear = have.filter((e) => latest.get(e.code) === year).map((e) => e.code)
    for (let i = 0; i < sameYear.length; i += INDEX_BATCH) {
      let token: string | undefined
      do {
        const r = await call<SearchResponse & { nodes: (ApiNode & { jurisdiction_code: string })[] }>(env, '/v1/expenditure/nodes:search', {
          document_kind: 'settlement',
          fiscal_year: { min: year, max: year },
          where: { jurisdiction_code: { eq: sameYear.slice(i, i + INDEX_BATCH) }, account_name: { eq: [ACCOUNT] }, is_subject: { eq: true }, node_kind: { eq: ['款'] } },
          page_size: 1000,
          ...(token ? { page_token: token } : {}),
        })
        for (const n of r.nodes) kan.set(n.jurisdiction_code, [...(kan.get(n.jurisdiction_code) ?? []), { name: n.name, yen: n.amount_yen }])
        token = r.next_page_token ?? undefined
      } while (token)
    }
  }
  return have.flatMap((e) => {
    const all = kan.get(e.code) ?? []
    // 印字の無い款は 0 円と数えず、総額が一部の款の和であることを amountMissing で画面に伝える
    const list = all.flatMap((k) => (k.yen === null ? [] : [{ name: k.name, yen: k.yen }])).sort((a, b) => b.yen - a.yen)
    // 収録範囲に年度があっても款が引けない自治体は、金額を 0 と出さずに一覧から外す
    if (list.length === 0) return []
    const yen = list.reduce((s, k) => s + k.yen, 0)
    const population = populationForYear(e.populations, latest.get(e.code)!)
    return [{
      code: e.code,
      name: e.name,
      prefecture: e.prefecture,
      kind: jurisdictionKind(e.code, e.name),
      path: pathOf(e.code),
      year: latest.get(e.code)!,
      yen,
      population,
      perCapita: population && population.people > 0 ? yen / population.people : null,
      ...(list.length < all.length ? { amountMissing: true as const } : {}),
    }]
  })
}

const search = (env: Env, code: string, years: { min: number; max: number }, nodeKind: string | string[] | undefined, extra: Record<string, unknown> = {}, pageSize = 200, pageToken?: string) =>
  call<SearchResponse>(env, '/v1/expenditure/nodes:search', {
    document_kind: 'settlement',
    fiscal_year: years,
    where: { jurisdiction_code: { eq: [code] }, account_name: { eq: [ACCOUNT] }, is_subject: { eq: true }, ...(nodeKind ? { node_kind: { eq: Array.isArray(nodeKind) ? nodeKind : [nodeKind] } } : {}), ...extra },
    order_by: [{ column: 'amount_yen', desc: true }],
    page_size: pageSize,
    ...(pageToken ? { page_token: pageToken } : {}),
  })

async function searchAll(env: Env, code: string, year: number, kinds: string[] | undefined, extra: Record<string, unknown> = {}): Promise<ApiNode[]> {
  const out: ApiNode[] = []
  let token: string | undefined
  do {
    const r = await search(env, code, { min: year, max: year }, kinds, extra, 1000, token)
    out.push(...r.nodes)
    token = r.next_page_token ?? undefined
  } while (token)
  return out
}

const byAmount = (a: ApiNode, b: ApiNode) => (b.amount_yen ?? 0) - (a.amount_yen ?? 0)

/** 目の直下の節（無ければ備考）。目の id ごとに大きい順 */
async function loadSetsuByMoku(env: Env, code: string, year: number, mokuIds: string[]): Promise<Map<string, Setsu[]>> {
  const setsuByMoku = new Map<string, Setsu[]>()
  // 年度・自治体・会計・軸の条件と合わせても API の bind 上限に収まる件数。
  for (let i = 0; i < mokuIds.length; i += 50) {
    const rows = await searchAll(env, code, year, undefined, { is_subject: { eq: false }, axis: { eq: ['節', '備考'] }, parent_node_id: { eq: mokuIds.slice(i, i + 50) } })
    const groups = new Map<string, ApiNode[]>()
    for (const n of rows) {
      if (!n.parent_node_id) continue
      const siblings = groups.get(n.parent_node_id) ?? []
      siblings.push(n)
      groups.set(n.parent_node_id, siblings)
    }
    for (const [parent, children] of groups) {
      const setsu = children.filter((n) => n.axis === '節')
      setsuByMoku.set(parent, (setsu.length ? setsu : children.filter((n) => n.axis === '備考')).sort(byAmount).map((n) => ({ name: n.name, yen: n.amount_yen ?? 0, ...(n.amount_yen === null ? { amountMissing: true as const } : {}) })))
    }
  }
  return setsuByMoku
}

/** すべての款を同じ深さで表示する。節は目の直下を取り、異なる軸の数字を混ぜない。 */
export async function loadFlow(env: Env, code: string, year: number, depth: FlowDepth = 'kou'): Promise<Drill[]> {
  const nodes = await searchAll(env, code, year, depth === 'kou' ? ['款', '項'] : ['款', '項', '目'])
  const byParent = new Map<string, ApiNode[]>()
  for (const n of nodes) {
    if (!n.parent_node_id) continue
    const siblings = byParent.get(n.parent_node_id) ?? []
    siblings.push(n)
    byParent.set(n.parent_node_id, siblings)
  }
  const setsuByMoku = depth === 'setsu' ? await loadSetsuByMoku(env, code, year, nodes.filter((n) => n.node_kind === '目').map((n) => n.node_id)) : new Map<string, Setsu[]>()
  return nodes.filter((n) => n.node_kind === '款').sort(byAmount).map((kan) => ({
    kan: line(kan),
    kou: (byParent.get(kan.node_id) ?? []).filter((n) => n.node_kind === '項').sort(byAmount).map((kou) => ({
      ...line(kou),
      moku: (byParent.get(kou.node_id) ?? []).filter((n) => n.node_kind === '目').sort(byAmount).map((moku) => ({ ...line(moku), setsu: setsuByMoku.get(moku.node_id) ?? [] })),
    })),
  }))
}

const sumYen = (lines: { yen: number; amountMissing?: true }[]) => lines.reduce((s, l) => s + (l.amountMissing ? 0 : l.yen), 0)

/**
 * 分野（jurisdiction/domains.ts の COFOG をまとめた枠）→ 款 → 目 の流れ。目に付いた COFOG のコードで枠を決め、
 * 枠の金額は目の和（api の sum_rules: COFOG は目を前方一致で集めて足す。分類できない目・対象外の目は「その他」に入れ、全枠の和が総額になる）。
 * 款は枠の中に入った目だけの和で、出典の款の金額ではない。並びは金額の順で「その他」を最後に置く。depth が kou なら目を返さない（全体図だけに使う）
 */
export async function loadCofogFlow(env: Env, code: string, year: number, depth: FlowDepth = 'kou'): Promise<Drill[]> {
  const nodes = await searchAll(env, code, year, ['款', '目'])
  const kanByName = new Map(nodes.filter((n) => n.node_kind === '款').map((n) => [n.name, n]))
  const moku = nodes.filter((n) => n.node_kind === '目')
  const setsuByMoku = depth === 'setsu' ? await loadSetsuByMoku(env, code, year, moku.map((n) => n.node_id)) : new Map<string, Setsu[]>()
  // 枠の id → 款の名前 → 目。目の親は項なので、款は kan_name で引く
  const frames = new Map<string, Map<string, ApiNode[]>>()
  for (const n of moku) {
    const frame = (n.cofog_code ? frameOf(n.cofog_code) : undefined) ?? OTHER_FRAME
    const kanName = n.kan_name ?? ''
    const byKan = frames.get(frame.id) ?? new Map<string, ApiNode[]>()
    byKan.set(kanName, [...(byKan.get(kanName) ?? []), n])
    frames.set(frame.id, byKan)
  }
  return [...DOMAIN_FRAMES, OTHER_FRAME].flatMap((frame) => {
    const byKan = frames.get(frame.id)
    if (!byKan) return []
    const kou = [...byKan].map(([kanName, list]) => {
      const mokuLines = list.sort(byAmount).map((m) => ({ ...line(m), setsu: setsuByMoku.get(m.node_id) ?? [] }))
      return { id: `${frame.id}-${kanByName.get(kanName)?.node_id ?? kanName}`, name: kanName, yen: sumYen(mokuLines), page: null, moku: depth === 'kou' ? [] : mokuLines }
    }).sort((a, b) => b.yen - a.yen)
    return [{ kan: { id: frame.id, name: frame.name, yen: sumYen(kou), page: null }, kou }]
  }).sort((a, b) => Number(a.kan.id === OTHER_FRAME.id) - Number(b.kan.id === OTHER_FRAME.id) || b.kan.yen - a.kan.yen)
}

async function children(env: Env, id: string): Promise<Record<string, ApiNode[]>> {
  const out: Record<string, ApiNode[]> = {}
  let token: string | undefined
  do {
    const r = await call<NodeResponse>(env, `/v1/expenditure/nodes/settlement/${id}${token ? `?page_token=${encodeURIComponent(token)}` : ''}`)
    for (const [axis, nodes] of Object.entries(r.children)) (out[axis] ??= []).push(...nodes)
    token = r.next_page_token ?? undefined
  } while (token)
  return out
}

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
  const kouNodes = Object.values(await children(env, kan.id)).flat().filter((n) => n.is_subject && n.node_kind === '項').sort((a, b) => (b.amount_yen ?? 0) - (a.amount_yen ?? 0))
  const kou: Kou[] = kouNodes.map((n) => ({ ...line(n), moku: [] }))
  const top = kouNodes[0]
  if (top) {
    const mokuNodes = Object.values(await children(env, top.node_id)).flat().filter((n) => n.is_subject && n.node_kind === '目').sort((a, b) => (b.amount_yen ?? 0) - (a.amount_yen ?? 0)).slice(0, 2)
    kou[0]!.moku = await Promise.all(mokuNodes.map(async (n): Promise<Moku> => ({ ...line(n), setsu: await loadSetsu(env, n.node_id) })))
  }
  return { kan, kou }
}

/** 都道府県の頁へのリンク（prefecturePath）はカタログを見て route 側で決める */
export async function loadPage(env: Env, entry: CatalogEntry): Promise<Omit<PageData, 'prefecturePath'> | null> {
  const latest = entry.settlementYears.at(-1)
  if (latest === undefined) return null
  const years = entry.settlementYears.filter((year) => year >= latest - MAX_YEARS + 1)
  const range = { min: years[0]!, max: latest }
  const [kanRes, mokuRes] = await Promise.all([search(env, entry.code, range, '款'), search(env, entry.code, { min: latest, max: latest }, '目', {}, CANDIDATES)])
  // 積立・公債・予備費の款は「事業」ではないので、力を入れている事業の候補から外す
  const picked = mokuRes.nodes.filter((n) => !NOT_PROJECT_KAN.has(n.kan_name ?? '')).slice(0, PROJECT_COUNT)
  const prevRes =
    years.includes(latest - 1) && picked.length > 0
      ? await search(env, entry.code, { min: latest - 1, max: latest - 1 }, '目', { name: { eq: [...new Set(picked.map((n) => n.name))] } }, 200)
      : { nodes: [] as ApiNode[] }
  const totals: YearTotal[] = years.map((year) => {
    const kan = kanRes.nodes.filter((n) => n.fiscal_year === year).map(line)
    return { year, yen: kan.reduce((s, k) => s + k.yen, 0), kan }
  })
  const topKan = totals.at(-1)!.kan[0]
  if (!topKan) throw new Error('収録済みの一般会計に款が見つかりません')
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
    officialUrl: entry.officialUrl,
    population: entry.population,
    originTitle: kanRes.origins?.find((o) => o.origin_id === kanRes.nodes.find((n) => n.fiscal_year === latest)?.origin_id)?.title ?? null,
    years: totals,
    flow: await loadFlow(env, entry.code, latest),
    cofogFlow: await loadCofogFlow(env, entry.code, latest),
    projects,
  }
}

