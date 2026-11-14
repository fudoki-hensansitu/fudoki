// 自治体の個別ページのデータ。apps/api（Service Binding）の歳出の検索から、決算の款・事業・お金の流れを組む。
// 金額は API が返した円をそのまま持つ。足すのは「同じ年度・会計の款（兄弟）の和」だけで、api の sum_rules に従う
import { type Drill, type FlowDepth, type Line, type Moku, type PageData, type Population, type Project, type Setsu, type YearTotal, type BudgetTotal } from '../jurisdiction/types'
import { cofogFlowOf } from '../jurisdiction/cofog-flow'
import { frameOf, OTHER_FRAME } from '../jurisdiction/domains'
import type { Env } from './env'
import { apiCall, FudokiApiError, type WebOpInput, type WebOpOutput } from './fudoki-api'
import { jurisdictionPath } from '../jurisdiction/path'
import { loadPopulations } from './population'

export const ACCOUNT = '一般会計'
/** 推移に出す最大の年数。API の fiscal_year の幅は 5 年以内 */
const MAX_YEARS = 5
const PROJECT_COUNT = 5
/** 目を金額で並べるときに先に取る件数。事業でない款（積立・公債・予備費）を除いても足りるようにする */
const CANDIDATES = 40
const NOT_PROJECT_KAN = new Set(['諸支出金', '公債費', '予備費'])

/** apps/api の操作を内部の RPC で呼ぶ（server/fudoki-api.ts）。型は api の操作の schema（@fudoki/api/rpc）から来る */
type SearchBody = WebOpInput<'search_expenditure_subjects'>
type Where = NonNullable<SearchBody['where']>

const searchSubjects = (env: Env, json: SearchBody) => apiCall(env)('search_expenditure_subjects', json)
const searchDetails = (env: Env, json: SearchBody) => apiCall(env)('search_expenditure_details', json)

/** 科目の表（款・項・目）の1行 */
type ApiSubject = WebOpOutput<'search_expenditure_subjects'>['subjects'][number]
/** 内訳の表の1行。breakdown は分け方（事業・節・その他） */
type ApiDetail = WebOpOutput<'search_expenditure_details'>['details'][number]
export interface CatalogEntry {
  code: string
  name: string
  prefecture: string
  /** 一般会計の決算がある年度（西暦、古い順） */
  settlementYears: number[]
  /** 一般会計の当初予算がある年度（西暦、古い順） */
  initialYears: number[]
  /** 資料の種類・年度ごとに収録した会計の名前（一般会計と特別会計） */
  accounts?: Record<DocumentKind, Record<string, string[]>>
  /** 事業評価を収録した年度（評価した事業を行った年度、古い順） */
  evaluationYears: number[]
  officialUrl: string | null
  /** いちばん新しい基準日の住民基本台帳人口 */
  population: Population | null
  /** 住民基本台帳人口の全基準日（古い順） */
  populations: Population[]
}

const amount = (n: { amount_yen: number | null }) => ({ yen: n.amount_yen ?? 0, ...(n.amount_yen === null ? { amountMissing: true as const } : {}) })
const line = (n: ApiSubject): Line => ({ id: n.subject_id, name: n.name, ...amount(n) })

type ApiJurisdiction = WebOpOutput<'list_jurisdictions'>['jurisdictions'][number]
const listJurisdictions = (env: Env, token?: string) => apiCall(env)('list_jurisdictions', token ? { page_token: token } : {})

/** API の自治体の1件を、頁が使う形にする。人口は web の D1 から足す */
function toCatalogEntry(j: Pick<ApiJurisdiction, 'jurisdiction_code' | 'name' | 'prefecture_name' | 'official_url' | 'coverage' | 'evaluations'>, populations: Population[]): CatalogEntry {
  const general = (kind: DocumentKind) => [...new Set(j.coverage.filter((c) => c.document_kind === kind && c.accounts.some((a) => a.account_name === ACCOUNT)).map((c) => c.fiscal_year))].sort((a, b) => a - b)
  const accountsOf = (kind: DocumentKind) => Object.fromEntries(j.coverage.filter((c) => c.document_kind === kind).map((c) => [String(c.fiscal_year), c.accounts.map((a) => a.account_name)]))
  return {
    code: j.jurisdiction_code,
    name: j.name,
    prefecture: j.prefecture_name,
    settlementYears: general('settlement'),
    initialYears: general('initial'),
    accounts: { initial: accountsOf('initial'), settlement: accountsOf('settlement') },
    evaluationYears: j.evaluations.map((e) => e.fiscal_year).sort((a, b) => a - b),
    officialUrl: j.official_url,
    population: populations.at(-1) ?? null,
    populations,
  }
}

/** 全自治体と収録範囲（list jurisdictions）。一覧が要る頁（ホーム・都道府県・検索・sitemap）だけが使う */
export async function loadCatalog(env: Env): Promise<CatalogEntry[]> {
  const rows: ApiJurisdiction[] = []
  let token: string | undefined
  do {
    const r = await listJurisdictions(env, token)
    rows.push(...r.jurisdictions)
    token = r.next_page_token ?? undefined
  } while (token)
  const populations = await loadPopulations(env, rows.map((j) => j.jurisdiction_code))
  return rows.map((j) => toCatalogEntry(j, populations.get(j.jurisdiction_code) ?? []))
}

/** 1つの自治体と収録範囲（get jurisdiction）。収録の無いコードは null */
export async function loadCatalogEntry(env: Env, code: string): Promise<CatalogEntry | null> {
  const [j, populations] = await Promise.all([
    apiCall(env)('get_jurisdiction', { jurisdiction_code: code }).catch((e) => {
      if (e instanceof FudokiApiError && e.status === 404) return null
      throw e
    }),
    loadPopulations(env, [code]),
  ])
  if (!j) return null
  return toCatalogEntry(j, populations.get(code) ?? [])
}

const search = (env: Env, code: string, years: { min: number; max: number }, level: string | string[] | undefined, extra: Record<string, unknown> = {}, pageSize = 200, pageToken?: string) =>
  searchSubjects(env, {
    document_kind: 'settlement',
    fiscal_year: years,
    where: { jurisdiction_code: { eq: [code] }, account_name: { eq: [ACCOUNT] }, ...(level ? { level: { eq: Array.isArray(level) ? level : [level] } } : {}), ...extra } as Where,
    order_by: [{ column: 'amount_yen', desc: true }],
    page_size: pageSize,
    ...(pageToken ? { page_token: pageToken } : {}),
  })

/** 検索の続きを最後まで引く。科目の表と内訳の表のどちらにも使う */
/** 資料の種類。決算か当初予算か。決算の無い年度だけ当初予算を読む */
export type DocumentKind = 'settlement' | 'initial'

async function searchAll<K extends 'subjects' | 'details'>(env: Env, table: K, code: string, year: number, where: Record<string, unknown>, documentKind: DocumentKind = 'settlement', account: string = ACCOUNT): Promise<(K extends 'subjects' ? ApiSubject : ApiDetail)[]> {
  const out: (ApiSubject | ApiDetail)[] = []
  let token: string | undefined
  do {
    const body: SearchBody = {
      document_kind: documentKind,
      fiscal_year: { min: year, max: year },
      where: { jurisdiction_code: { eq: [code] }, account_name: { eq: [account] }, ...where } as Where,
      order_by: [{ column: 'amount_yen', desc: true }],
      page_size: 1000,
      ...(token ? { page_token: token } : {}),
    }
    const r = table === 'subjects' ? await searchSubjects(env, body) : await searchDetails(env, body)
    out.push(...('subjects' in r ? r.subjects : r.details))
    token = r.next_page_token ?? undefined
  } while (token)
  return out as (K extends 'subjects' ? ApiSubject : ApiDetail)[]
}

const byAmount = (a: { amount_yen: number | null }, b: { amount_yen: number | null }) => (b.amount_yen ?? 0) - (a.amount_yen ?? 0)

/** 目の内訳として出す分け方。節があれば節、無ければ事業（備考・説明の欄）。分け方の違う内訳は混ぜない */
const pickBreakdown = (byBreakdown: Record<string, ApiDetail[]>) => byBreakdown['節']?.length ? byBreakdown['節'] : (byBreakdown['事業'] ?? [])

/** 目の直下の内訳（節、無ければ事業）。目の id ごとに大きい順 */
async function loadSetsuByMoku(env: Env, code: string, year: number, mokuIds: string[], kind: DocumentKind = 'settlement', account: string = ACCOUNT): Promise<Map<string, Setsu[]>> {
  const setsuByMoku = new Map<string, Setsu[]>()
  // 年度・資料・自治体・会計・分け方・深さの条件と合わせても API の bind 上限（90）に収まる件数。区切った分は並べて読む
  const chunks = Array.from({ length: Math.ceil(mokuIds.length / 50) }, (_, i) => mokuIds.slice(i * 50, (i + 1) * 50))
  const pages = await Promise.all(chunks.map((ids) => searchAll(env, 'details', code, year, { depth: { eq: [1] }, breakdown: { eq: ['節', '事業'] }, subject_id: { eq: ids } }, kind, account)))
  for (const rows of pages) {
    const groups = new Map<string, Record<string, ApiDetail[]>>()
    for (const n of rows) {
      const byBreakdown = groups.get(n.subject_id) ?? {}
      ;(byBreakdown[n.breakdown] ??= []).push(n)
      groups.set(n.subject_id, byBreakdown)
    }
    for (const [moku, byBreakdown] of groups) setsuByMoku.set(moku, [...pickBreakdown(byBreakdown)].sort(byAmount).map((n) => ({ name: n.name, ...amount(n) })))
  }
  return setsuByMoku
}

/** すべての款を同じ深さで表示する。節は目の直下の内訳を取り、分け方の違う数字を混ぜない。 */
export async function loadFlow(env: Env, code: string, year: number, depth: FlowDepth = 'kou', kind: DocumentKind = 'settlement', account: string = ACCOUNT): Promise<Drill[]> {
  return (await loadFlowParts(env, code, year, depth, kind, account)).drills
}

/** 款 → 項 → 目 の流れと、木に入らない（親の項の行が無い）目。分野の図は両方から組む（jurisdiction/cofog-flow.ts の cofogFlowOfDrills） */
export async function loadFlowParts(env: Env, code: string, year: number, depth: FlowDepth = 'kou', kind: DocumentKind = 'settlement', account: string = ACCOUNT): Promise<{ drills: Drill[]; loose: Moku[] }> {
  const subjects = await searchAll(env, 'subjects', code, year, { level: { eq: depth === 'kou' ? ['款', '項'] : ['款', '項', '目'] } }, kind, account)
  const byParent = new Map<string, ApiSubject[]>()
  for (const n of subjects) {
    if (!n.parent_subject_id) continue
    const siblings = byParent.get(n.parent_subject_id) ?? []
    siblings.push(n)
    byParent.set(n.parent_subject_id, siblings)
  }
  const setsuByMoku = depth === 'setsu' ? await loadSetsuByMoku(env, code, year, subjects.filter((n) => n.level === '目').map((n) => n.subject_id), kind, account) : new Map<string, Setsu[]>()
  const placed = new Set<string>()
  const mokuOf = (m: ApiSubject, path: [string | null, string | null]): Moku => ({ ...line(m), setsu: setsuByMoku.get(m.subject_id) ?? [], path, cofog: m.cofog_code ?? null })
  const drills = subjects.filter((n) => n.level === '款').sort(byAmount).map((kan) => ({
    kan: line(kan),
    kou: (byParent.get(kan.subject_id) ?? []).filter((n) => n.level === '項').sort(byAmount).map((kou) => ({
      ...line(kou),
      moku: (byParent.get(kou.subject_id) ?? []).filter((n) => n.level === '目').sort(byAmount).map((moku) => (placed.add(moku.subject_id), mokuOf(moku, [kan.name, kou.name]))),
    })),
  }))
  const loose = subjects.filter((n) => n.level === '目' && !placed.has(n.subject_id)).sort(byAmount).map((m) => mokuOf(m, [m.kan_name ?? null, m.kou_name ?? null]))
  return { drills, loose }
}

const sumYen = (lines: { yen: number; amountMissing?: true }[]) => lines.reduce((s, l) => s + (l.amountMissing ? 0 : l.yen), 0)
/** 金額の印字が無い目を含む和は、印字された分だけの和であることを amountMissing で画面に伝える（一覧の総額と同じ扱い） */
const partial = (lines: { amountMissing?: true }[]) => (lines.some((l) => l.amountMissing) ? { amountMissing: true as const } : {})

/** 分野（COFOG の大分類）→ 中分類 → 目 の流れ（jurisdiction/cofog-flow.ts）。款・項は使わない。depth が kou なら目を返さない（全体図だけに使う） */
export async function loadCofogFlow(env: Env, code: string, year: number, depth: FlowDepth = 'kou', kind: DocumentKind = 'settlement', account: string = ACCOUNT): Promise<Drill[]> {
  const moku = await searchAll(env, 'subjects', code, year, { level: { eq: ['目'] } }, kind, account)
  const setsuByMoku = depth === 'setsu' ? await loadSetsuByMoku(env, code, year, moku.map((n) => n.subject_id), kind, account) : new Map<string, Setsu[]>()
  return cofogFlowOf(moku.map((m) => ({ ...line(m), setsu: setsuByMoku.get(m.subject_id) ?? [], path: [m.kan_name ?? null, m.kou_name ?? null], cofog: m.cofog_code ?? null })), depth !== 'kou')
}

/** 会計ごとの総額（款の和）。一般会計を先頭に、あとは金額の大きい順。印字の無い款を含む会計は amountMissing を付ける */
export async function loadAccountTotals(env: Env, code: string, year: number, kind: DocumentKind, accounts: string[]): Promise<{ name: string; yen: number; amountMissing?: true }[]> {
  const totals = await Promise.all(accounts.map(async (account) => {
    const kan = await searchAll(env, 'subjects', code, year, { level: { eq: ['款'] } }, kind, account)
    const lines = kan.map((n) => amount(n))
    return { name: account, yen: sumYen(lines), ...partial(lines) }
  }))
  return totals.filter((t) => t.yen > 0 || t.amountMissing).sort((a, b) => Number(b.name === ACCOUNT) - Number(a.name === ACCOUNT) || b.yen - a.yen)
}

/**
 * 決算がまだ無い年度の当初予算。総額と、目の COFOG の大分類ごとの和（loadCofogFlow の大分類と同じ分け方）。
 * 概要（区は何をしている？）で、決算の無い年度を選んだときに最新の決算の額ではなくその年度の予算を出すために使う
 */
async function loadBudget(env: Env, code: string, year: number): Promise<BudgetTotal> {
  const subjects = await searchAll(env, 'subjects', code, year, { level: { eq: ['款', '目'] } }, 'initial')
  const moku = subjects.filter((n) => n.level === '目')
  const byDivision = new Map<string, ApiSubject[]>()
  for (const n of moku) {
    const id = `cofog-${n.cofog_code?.split('.')[0] || 'none'}`
    byDivision.set(id, [...(byDivision.get(id) ?? []), n])
  }
  const lines = moku.map(line)
  // 大きな支出の節に出す事業。決算と同じく積立・公債・予備費の款は外す。前年度との比較は出さない（決算と予算を比べないため）
  const projects: Project[] = moku.filter((n) => !NOT_PROJECT_KAN.has(n.kan_name ?? '')).sort(byAmount).slice(0, PROJECT_COUNT).map((n) => ({
    ...line(n),
    kanName: n.kan_name ?? '',
    kouName: n.kou_name,
    domain: ((n.cofog_code ? frameOf(n.cofog_code) : undefined) ?? OTHER_FRAME).name,
    prevYen: null,
  }))
  return {
    year,
    yen: sumYen(lines),
    ...partial(lines),
    kan: subjects.filter((n) => n.level === '款').sort(byAmount).map(line),
    divisions: [...byDivision].map(([id, list]) => ({ id, yen: sumYen(list.map(line)), ...partial(list.map(line)) })),
    projects,
  }
}

/** 頁で見せる決算の年度（最新から MAX_YEARS 年）。sitemap も同じ年度だけを載せる */
export const shownSettlementYears = (settlementYears: number[]) => {
  const latest = settlementYears.at(-1)
  return latest === undefined ? [] : settlementYears.filter((year) => year >= latest - MAX_YEARS + 1)
}

/** 都道府県の頁へのリンク（prefecturePath）・同じ都道府県の自治体（neighbors）はカタログを見て route 側で決める */
export async function loadPage(env: Env, entry: CatalogEntry): Promise<Omit<PageData, 'prefecturePath' | 'prefectureLogo' | 'emblem' | 'neighbors'> | null> {
  const latest = entry.settlementYears.at(-1)
  if (latest === undefined) return null
  const years = shownSettlementYears(entry.settlementYears)
  const range = { min: years[0]!, max: latest }
  // 分野の流れ・予算は款・目と別に読めるので、先に並べて投げる（順に待つと API の往復が積み重なる）
  const rest = Promise.all([loadCofogFlow(env, entry.code, latest), Promise.all(entry.initialYears.filter((y) => y > latest).map((y) => loadBudget(env, entry.code, y)))])
  rest.catch(() => {})
  const [kanRes, mokuRes] = await Promise.all([search(env, entry.code, range, '款'), search(env, entry.code, { min: latest, max: latest }, '目', {}, CANDIDATES)])
  // 積立・公債・予備費の款は「事業」ではないので、力を入れている事業の候補から外す
  const picked = mokuRes.subjects.filter((n) => !NOT_PROJECT_KAN.has(n.kan_name ?? '')).slice(0, PROJECT_COUNT)
  const prevRes =
    years.includes(latest - 1) && picked.length > 0
      ? await search(env, entry.code, { min: latest - 1, max: latest - 1 }, '目', { name: { eq: [...new Set(picked.map((n) => n.name))] } }, 200)
      : { subjects: [] as ApiSubject[] }
  const [cofogFlow, budgets] = await rest
  const totals: YearTotal[] = years.map((year) => {
    const kan = kanRes.subjects.filter((n) => n.fiscal_year === year).map(line)
    return { year, yen: kan.reduce((s, k) => s + k.yen, 0), kan }
  })
  const topKan = totals.at(-1)!.kan[0]
  if (!topKan) throw new Error('収録済みの一般会計に款が見つかりません')
  const projects: Project[] = picked.map((n) => ({
    ...line(n),
    kanName: n.kan_name ?? '',
    kouName: n.kou_name,
    domain: ((n.cofog_code ? frameOf(n.cofog_code) : undefined) ?? OTHER_FRAME).name,
    prevYen: prevRes.subjects.find((p) => p.name === n.name && p.kan_name === n.kan_name && p.kou_name === n.kou_name)?.amount_yen ?? null,
  }))
  return {
    code: entry.code,
    name: entry.name,
    path: jurisdictionPath(entry.code),
    prefecture: entry.prefecture,
    officialUrl: entry.officialUrl,
    population: entry.population,
    originTitle: kanRes.origins?.find((o) => o.origin_id === kanRes.subjects.find((n) => n.fiscal_year === latest)?.origin_id)?.title ?? null,
    years: totals,
    cofogFlow,
    budgets,
    projects,
  }
}

