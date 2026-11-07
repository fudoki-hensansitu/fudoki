// 自治体の個別ページのデータ。apps/api（Service Binding）の歳出の検索から、決算の款・事業・お金の流れを組む。
// 金額は API が返した円をそのまま持つ。足すのは「同じ年度・会計の款（兄弟）の和」だけで、api の sum_rules に従う
import { jurisdictionKind, populationForYear, type Drill, type FlowDepth, type IndexEntry, type Kou, type Line, type Moku, type PageData, type Population, type Project, type Setsu, type YearTotal, type BudgetTotal } from '../jurisdiction/types'
import { COFOG_GROUPS } from '@fudoki/fiscal/cofog-master'
import { frameOf, OTHER_FRAME } from '../jurisdiction/domains'
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

/** 科目の表（款・項・目）の1行 */
interface ApiSubject {
  subject_id: string
  parent_subject_id: string | null
  jurisdiction_code: string
  level: string
  name: string
  amount_yen: number | null
  fiscal_year: number
  kan_name: string | null
  kou_name: string | null
  origin_id: string
  /** 目だけに付く。assigned・tentative のときだけコードがある */
  cofog_code?: string | null
}
/** 内訳の表の1行。breakdown は分け方（事業・節・その他） */
interface ApiDetail {
  detail_id: string
  subject_id: string
  breakdown: string
  name: string
  amount_yen: number | null
}
interface SearchResponse<T> {
  next_page_token?: string | null
  origins?: { origin_id: string; title: string }[]
  subjects?: T[]
  details?: T[]
}
interface SubjectResponse {
  subject: ApiSubject
  children: ApiSubject[]
  details: Record<string, ApiDetail[]>
  next_page_token?: string | null
}
const SUBJECTS = '/v1/fiscal/expenditure/subjects:search'
const DETAILS = '/v1/fiscal/expenditure/details:search'
export interface CatalogEntry {
  code: string
  name: string
  prefecture: string
  /** 一般会計の決算がある年度（西暦、古い順） */
  settlementYears: number[]
  /** 一般会計の当初予算がある年度（西暦、古い順） */
  initialYears: number[]
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

const amount = (n: { amount_yen: number | null }) => ({ yen: n.amount_yen ?? 0, ...(n.amount_yen === null ? { amountMissing: true as const } : {}) })
const line = (n: ApiSubject): Line => ({ id: n.subject_id, name: n.name, ...amount(n) })

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
        initialYears: [...new Set(j.coverage.filter((c) => c.document_kind === 'initial' && c.accounts.some((a) => a.account_name === ACCOUNT)).map((c) => c.fiscal_year))].sort((a, b) => a - b),
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
        const r = await call<SearchResponse<ApiSubject>>(env, SUBJECTS, {
          document_kind: 'settlement',
          fiscal_year: { min: year, max: year },
          where: { jurisdiction_code: { eq: sameYear.slice(i, i + INDEX_BATCH) }, account_name: { eq: [ACCOUNT] }, level: { eq: ['款'] } },
          page_size: 1000,
          ...(token ? { page_token: token } : {}),
        })
        for (const n of r.subjects ?? []) kan.set(n.jurisdiction_code, [...(kan.get(n.jurisdiction_code) ?? []), { name: n.name, yen: n.amount_yen }])
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

const search = (env: Env, code: string, years: { min: number; max: number }, level: string | string[] | undefined, extra: Record<string, unknown> = {}, pageSize = 200, pageToken?: string) =>
  call<SearchResponse<ApiSubject>>(env, SUBJECTS, {
    document_kind: 'settlement',
    fiscal_year: years,
    where: { jurisdiction_code: { eq: [code] }, account_name: { eq: [ACCOUNT] }, ...(level ? { level: { eq: Array.isArray(level) ? level : [level] } } : {}), ...extra },
    order_by: [{ column: 'amount_yen', desc: true }],
    page_size: pageSize,
    ...(pageToken ? { page_token: pageToken } : {}),
  }).then((r) => ({ ...r, subjects: r.subjects ?? [] }))

/** 検索の続きを最後まで引く。科目の表と内訳の表のどちらにも使う */
/** 資料の種類。決算か当初予算か。決算の無い年度だけ当初予算を読む */
export type DocumentKind = 'settlement' | 'initial'

async function searchAll<T>(env: Env, path: string, code: string, year: number, where: Record<string, unknown>, documentKind: DocumentKind = 'settlement'): Promise<T[]> {
  const out: T[] = []
  let token: string | undefined
  do {
    const r = await call<SearchResponse<T>>(env, path, {
      document_kind: documentKind,
      fiscal_year: { min: year, max: year },
      where: { jurisdiction_code: { eq: [code] }, account_name: { eq: [ACCOUNT] }, ...where },
      order_by: [{ column: 'amount_yen', desc: true }],
      page_size: 1000,
      ...(token ? { page_token: token } : {}),
    })
    out.push(...(r.subjects ?? r.details ?? []))
    token = r.next_page_token ?? undefined
  } while (token)
  return out
}

const byAmount = (a: { amount_yen: number | null }, b: { amount_yen: number | null }) => (b.amount_yen ?? 0) - (a.amount_yen ?? 0)

/** 目の内訳として出す分け方。節があれば節、無ければ事業（備考・説明の欄）。分け方の違う内訳は混ぜない */
const pickBreakdown = (byBreakdown: Record<string, ApiDetail[]>) => byBreakdown['節']?.length ? byBreakdown['節'] : (byBreakdown['事業'] ?? [])

/** 目の直下の内訳（節、無ければ事業）。目の id ごとに大きい順 */
async function loadSetsuByMoku(env: Env, code: string, year: number, mokuIds: string[], kind: DocumentKind = 'settlement'): Promise<Map<string, Setsu[]>> {
  const setsuByMoku = new Map<string, Setsu[]>()
  // 年度・資料・自治体・会計・分け方・深さの条件と合わせても API の bind 上限（90）に収まる件数。
  for (let i = 0; i < mokuIds.length; i += 50) {
    const rows = await searchAll<ApiDetail>(env, DETAILS, code, year, { depth: { eq: [1] }, breakdown: { eq: ['節', '事業'] }, subject_id: { eq: mokuIds.slice(i, i + 50) } }, kind)
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
export async function loadFlow(env: Env, code: string, year: number, depth: FlowDepth = 'kou', kind: DocumentKind = 'settlement'): Promise<Drill[]> {
  const subjects = await searchAll<ApiSubject>(env, SUBJECTS, code, year, { level: { eq: depth === 'kou' ? ['款', '項'] : ['款', '項', '目'] } }, kind)
  const byParent = new Map<string, ApiSubject[]>()
  for (const n of subjects) {
    if (!n.parent_subject_id) continue
    const siblings = byParent.get(n.parent_subject_id) ?? []
    siblings.push(n)
    byParent.set(n.parent_subject_id, siblings)
  }
  const setsuByMoku = depth === 'setsu' ? await loadSetsuByMoku(env, code, year, subjects.filter((n) => n.level === '目').map((n) => n.subject_id), kind) : new Map<string, Setsu[]>()
  return subjects.filter((n) => n.level === '款').sort(byAmount).map((kan) => ({
    kan: line(kan),
    kou: (byParent.get(kan.subject_id) ?? []).filter((n) => n.level === '項').sort(byAmount).map((kou) => ({
      ...line(kou),
      moku: (byParent.get(kou.subject_id) ?? []).filter((n) => n.level === '目').sort(byAmount).map((moku) => ({ ...line(moku), setsu: setsuByMoku.get(moku.subject_id) ?? [] })),
    })),
  }))
}

const sumYen = (lines: { yen: number; amountMissing?: true }[]) => lines.reduce((s, l) => s + (l.amountMissing ? 0 : l.yen), 0)
/** 金額の印字が無い目を含む和は、印字された分だけの和であることを amountMissing で画面に伝える（一覧の総額と同じ扱い） */
const partial = (lines: { amountMissing?: true }[]) => (lines.some((l) => l.amountMissing) ? { amountMissing: true as const } : {})

/**
 * 分野（COFOG の大分類）→ 中分類 → 目 の流れ。款・項は使わない。目に付いた COFOG のコードで大分類・中分類を決め、
 * 金額は目の和（api の sum_rules: COFOG は目を前方一致で集めて足す。分類できない目・対象外の目は「その他」に入れ、全分類の和が総額になる。印字の無い目を含む分類は amountMissing を付ける）。
 * 並びは金額の順で「その他」を最後に置く。depth が kou なら目を返さない（全体図だけに使う）
 */
export async function loadCofogFlow(env: Env, code: string, year: number, depth: FlowDepth = 'kou', kind: DocumentKind = 'settlement'): Promise<Drill[]> {
  const moku = await searchAll<ApiSubject>(env, SUBJECTS, code, year, { level: { eq: ['目'] } }, kind)
  const setsuByMoku = depth === 'setsu' ? await loadSetsuByMoku(env, code, year, moku.map((n) => n.subject_id), kind) : new Map<string, Setsu[]>()
  // COFOG の大分類 → 中分類 → 目。款・項は使わない（COFOG で分けた図に自治体の科目の階層を混ぜない）。コードの無い目は空文字
  const divisions = new Map<string, Map<string, ApiSubject[]>>()
  for (const n of moku) {
    const [division = '', group] = n.cofog_code?.split('.') ?? []
    const key = group ? `${division}.${group}` : division
    const byGroup = divisions.get(division) ?? new Map<string, ApiSubject[]>()
    byGroup.set(key, [...(byGroup.get(key) ?? []), n])
    divisions.set(division, byGroup)
  }
  return [...divisions].map(([division, byGroup]) => {
    const kou = [...byGroup].map(([group, list]) => {
      const mokuLines = list.sort(byAmount).map((m) => ({ ...line(m), setsu: setsuByMoku.get(m.subject_id) ?? [] }))
      return { id: `cofog-${group || 'none'}-g`, name: cofogGroupName(group), yen: sumYen(mokuLines), ...partial(mokuLines), page: null, moku: depth === 'kou' ? [] : mokuLines }
    }).sort((a, b) => b.yen - a.yen)
    const kan = { id: `cofog-${division || 'none'}`, name: (division ? frameOf(division) : OTHER_FRAME)?.name ?? `COFOG ${division}`, yen: kou.reduce((sum, k) => sum + k.yen, 0), ...partial(kou), page: null }
    return { kan, kou }
  }).sort((a, b) => Number(a.kan.id === 'cofog-none') - Number(b.kan.id === 'cofog-none') || b.kan.yen - a.kan.yen)
}

/** 中分類の名前。大分類までしか決めていない目・コードの無い目はそう書く */
function cofogGroupName(group: string) {
  if (!group) return '分類を決められない支出'
  if (!group.includes('.')) return '未分類'
  // 名前の表は規則が使うコードを全部持つ（cofog-master.ts）。漏れたときもページは落とさずコードを出す
  return COFOG_GROUPS[group] ?? `COFOG ${group}`
}

/** 科目の子の科目と、直下の内訳（分け方ごと）。内訳の続きは最後まで引く */
async function subjectOf(env: Env, id: string): Promise<{ subject: ApiSubject; children: ApiSubject[]; details: Record<string, ApiDetail[]> }> {
  const details: Record<string, ApiDetail[]> = {}
  let first: SubjectResponse | undefined
  let token: string | undefined
  do {
    const r = await call<SubjectResponse>(env, `/v1/fiscal/expenditure/subjects/${id}${token ? `?page_token=${encodeURIComponent(token)}` : ''}`)
    first ??= r
    for (const [breakdown, rows] of Object.entries(r.details)) (details[breakdown] ??= []).push(...rows)
    token = r.next_page_token ?? undefined
  } while (token)
  return { subject: first!.subject, children: first!.children, details }
}

/** 目の内訳。節があれば節、無ければ事業の一覧を上位だけ返す */
export async function loadSetsu(env: Env, mokuId: string) {
  const { details } = await subjectOf(env, mokuId)
  return pickBreakdown(details).filter((n) => (n.amount_yen ?? 0) > 0).sort(byAmount).slice(0, SETSU_COUNT).map((n) => ({ name: n.name, yen: n.amount_yen ?? 0 }))
}

/** 款の流れ。項は全部、一番大きい項だけ目（上位2つ）と節まで引く */
export async function loadDrillById(env: Env, kanId: string): Promise<Drill> {
  const { subject } = await subjectOf(env, kanId)
  if (subject.level !== '款') throw new Error('款ではありません')
  return loadDrill(env, line(subject))
}

export async function loadDrill(env: Env, kan: Line): Promise<Drill> {
  const kouSubjects = (await subjectOf(env, kan.id)).children.filter((n) => n.level === '項').sort(byAmount)
  const kou: Kou[] = kouSubjects.map((n) => ({ ...line(n), moku: [] }))
  const top = kouSubjects[0]
  if (top) {
    const mokuSubjects = (await subjectOf(env, top.subject_id)).children.filter((n) => n.level === '目').sort(byAmount).slice(0, 2)
    kou[0]!.moku = await Promise.all(mokuSubjects.map(async (n): Promise<Moku> => ({ ...line(n), setsu: await loadSetsu(env, n.subject_id) })))
  }
  return { kan, kou }
}

/**
 * 決算がまだ無い年度の当初予算。総額と、目の COFOG の大分類ごとの和（loadCofogFlow の大分類と同じ分け方）。
 * 概要（区は何をしている？）で、決算の無い年度を選んだときに最新の決算の額ではなくその年度の予算を出すために使う
 */
async function loadBudget(env: Env, code: string, year: number): Promise<BudgetTotal> {
  const subjects = await searchAll<ApiSubject>(env, SUBJECTS, code, year, { level: { eq: ['款', '目'] } }, 'initial')
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

/** 都道府県の頁へのリンク（prefecturePath）・同じ都道府県の自治体（neighbors）はカタログを見て route 側で決める */
export async function loadPage(env: Env, entry: CatalogEntry): Promise<Omit<PageData, 'prefecturePath' | 'neighbors'> | null> {
  const latest = entry.settlementYears.at(-1)
  if (latest === undefined) return null
  const years = entry.settlementYears.filter((year) => year >= latest - MAX_YEARS + 1)
  const range = { min: years[0]!, max: latest }
  const [kanRes, mokuRes] = await Promise.all([search(env, entry.code, range, '款'), search(env, entry.code, { min: latest, max: latest }, '目', {}, CANDIDATES)])
  // 積立・公債・予備費の款は「事業」ではないので、力を入れている事業の候補から外す
  const picked = mokuRes.subjects.filter((n) => !NOT_PROJECT_KAN.has(n.kan_name ?? '')).slice(0, PROJECT_COUNT)
  const prevRes =
    years.includes(latest - 1) && picked.length > 0
      ? await search(env, entry.code, { min: latest - 1, max: latest - 1 }, '目', { name: { eq: [...new Set(picked.map((n) => n.name))] } }, 200)
      : { subjects: [] as ApiSubject[] }
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
    prefecture: entry.prefecture,
    officialUrl: entry.officialUrl,
    population: entry.population,
    originTitle: kanRes.origins?.find((o) => o.origin_id === kanRes.subjects.find((n) => n.fiscal_year === latest)?.origin_id)?.title ?? null,
    years: totals,
    flow: await loadFlow(env, entry.code, latest),
    cofogFlow: await loadCofogFlow(env, entry.code, latest),
    budgets: await Promise.all(entry.initialYears.filter((y) => y > latest).map((y) => loadBudget(env, entry.code, y))),
    projects,
  }
}

