// 自治体の頁が事業を読む口。サーバーは api の内部の RPC（server/fudoki-api.ts の ApiCall）で事業の検索・事業を読み、ブラウザは web の /api（routes/api/projects）を通して同じものを読む。
// ブラウザは api.fudoki.dev を直接は呼ばない（ADR 0044）。一覧は頁ごとに読む（1頁目はサーバーが描き、続きは末尾が見えたときにブラウザが取る）。分野・目で絞るときは科目の ID で絞る
import type { ApiCall, WebOpInput, WebOpOutput } from '../../server/fudoki-api'
import type { DirectionCode, Sheet } from './data'
import type { Setsu } from '../types'

const ACCOUNT = '一般会計'
/** 一覧の1頁目の件数。続きは NEXT_PAGE ずつ */
export const FIRST_PAGE = 10
const NEXT_PAGE = 30

export type Kind = 'initial' | 'settlement'
type SearchBody = WebOpInput<'search_projects'>
type SearchResult = WebOpOutput<'search_projects'>
type YearRow = SearchResult['project_years'][number]

/** 一覧に出す事業の1年度 */
export type ProjRow = {
  id: string
  fy: number
  name: string
  dept: string | null
  path: (string | null)[]
  /** 金額の行が載る科目（目）。分野はこの ID から引く */
  subject: string | null
  yen: number | null
  /** 始めた年度（前の年度の資料に無かったと確かめられたときだけ） */
  started: number | null
  /** 終えた年度（次の年度の資料に無かったと確かめられたときだけ） */
  ended: number | null
  /** 当初予算・決算の事業の行 */
  details: string[]
}

/** 一覧の条件。filter が ended なら前の年度に終えた事業を、前の年度の額で並べる */
export type ListQuery = {
  code: string
  year: number
  /** 金額を読む資料（当初予算の無い年度は決算） */
  kind: Kind
  filter: 'all' | 'new' | 'ended'
  /** 前の年度の資料（ended のときに使う） */
  prevKind?: Kind
  /** 分野・目で絞るときの科目の ID */
  subjects?: string[]
  /** 科目の COFOG のコード（cofog_code）で絞る。分野で絞るときはその分野に入るコードを並べる */
  cofog?: string[]
  /** 事業名（所管課を含む）で絞る */
  q?: string
}
export type ListPage = { rows: ProjRow[]; total: number; capped: boolean; next: string | null }

export const listKey = (q: ListQuery) => JSON.stringify([q.code, q.year, q.kind, q.filter, q.prevKind ?? null, q.subjects ?? null, q.cofog ?? null, q.q?.trim() || null])

/** API の GLOB は前後の * と escape（* ? [ は3バイト）を含めて50バイトまで。長い検索語は収まるところまでで探す */
const GLOB_BYTES = 50
function fitSearch(q: string): string {
  const bytes = (t: string) => new TextEncoder().encode(`*${t.replace(/[*?[]/g, '[$&]')}*`).length
  let t = q
  while (t && bytes(t) > GLOB_BYTES) t = Array.from(t).slice(0, -1).join('')
  return t
}

/** 出典の事業名の最後の【】（後ろに人数などが続くこともある）と、末尾の []（中央区・八王子など。[1人分] のような注記は語尾で外す）は所管課。名前からは外して別に持つ */
const BRACKET_DEPT = /\[([^[\]0-9０-９]*(?:課|部|局|室|所|係|センター|委員会|館))\]\s*$/
const clean = (name: string) => name.replace(/【[^】]*】/g, '').replace(BRACKET_DEPT, '').trim()
const deptOf = (name: string) => name.match(/【([^】]+)】[^【】]*$/)?.[1] ?? name.match(BRACKET_DEPT)?.[1] ?? null

type ProjectOf = SearchResult['projects'][number]

/** 事業の年度の行と、その事業（始め・終えは事業の列） */
function toRow(y: YearRow, kind: Kind, p: ProjectOf | undefined): ProjRow {
  return {
    id: y.project_id,
    fy: y.fiscal_year,
    name: clean(y.name),
    dept: deptOf(y.name),
    path: [y.kan_name, y.kou_name, y.moku_name],
    subject: (kind === 'initial' ? y.initial_expenditure_subject_id : y.settlement_expenditure_subject_id) ?? y.initial_expenditure_subject_id ?? y.settlement_expenditure_subject_id,
    yen: kind === 'initial' ? y.budget_yen : y.settled_yen,
    started: p?.first_year_kind === 'confirmed' ? p.first_year : null,
    ended: p?.last_year_kind === 'confirmed' ? p.last_year : null,
    details: [y.initial_expenditure_detail_id, y.settlement_expenditure_detail_id].filter((x): x is string => !!x),
  }
}

const searchYears = (call: ApiCall, json: SearchBody) => call('search_projects', json)

/** 検索の応答の行を、行の事業と合わせて組む */
const rowsOf = (r: SearchResult, kind: Kind) => {
  const projects = new Map(r.projects.map((p) => [p.project_id, p]))
  return r.project_years.map((y) => toRow(y, kind, projects.get(y.project_id)))
}

function bodyOf(q: ListQuery, pageSize: number, token?: string): { body: SearchBody; kind: Kind } {
  const ended = q.filter === 'ended'
  const fy = ended ? q.year - 1 : q.year
  const kind = ended ? (q.prevKind ?? 'settlement') : q.kind
  const amount = kind === 'initial' ? 'budget_yen' : 'settled_yen'
  const where: Record<string, unknown> = {
    jurisdiction_code: { eq: [q.code] },
    account_name: { eq: [ACCOUNT] },
    parent_project_id: { is_null: true },
    ...(ended ? { last_year: { eq: [fy] }, last_year_kind: { eq: ['confirmed'] } } : { [amount]: { is_null: false } }),
    ...(q.filter === 'new' ? { first_year: { eq: [q.year] }, first_year_kind: { eq: ['confirmed'] } } : {}),
    ...(q.subjects ? { [`${kind}_expenditure_subject_id`]: { eq: q.subjects } } : {}),
    ...(q.cofog ? { [`${kind}_cofog_code`]: { eq: q.cofog } } : {}),
    ...(q.q?.trim() ? { name: { contains: fitSearch(q.q.trim()) } } : {}),
  }
  return {
    kind,
    body: { fiscal_year: { min: fy, max: fy }, where, order_by: [{ column: amount, desc: true }], page_size: pageSize, ...(token ? { page_token: token } : {}) } as SearchBody,
  }
}

/** 一覧の1頁（サーバー）。分野・目の科目が無ければ空 */
export async function readListPage(call: ApiCall, q: ListQuery, token?: string): Promise<ListPage> {
  if (q.subjects && !q.subjects.length) return { rows: [], total: 0, capped: false, next: null }
  const { body, kind } = bodyOf(q, token ? NEXT_PAGE : FIRST_PAGE, token)
  const r = await searchYears(call, body)
  return { rows: rowsOf(r, kind), total: r.total_size, capped: r.total_size_capped, next: r.next_page_token ?? null }
}

// ---------- 評価シート ----------
// 評価シートも一覧は頁ごとに読み、A〜D の札は api が数えた数を出す（シートを全部は手元に取らない）

type SheetBody = WebOpInput<'search_evaluation_sheets'>
type SheetResult = WebOpOutput<'search_evaluation_sheets'>

/** 評価シートの一覧の条件。評価した事業を行った年度（year）の、一般会計のシート */
export type SheetQuery = {
  code: string
  year: number
  /** 頁が見せている資料。分野の科目はこの資料の目 */
  kind: Kind
  /** 分野で絞るときの科目（kind の資料の目）の ID */
  subjects?: string[]
  /** kind の資料の科目の COFOG のコード（cofog_code）で絞る */
  cofog?: string[]
  /** 事業名で絞る */
  q?: string
  /** 方向性の区分で絞る（A〜D の札は、数えた区分の中からその札の区分を渡す） */
  codes?: DirectionCode[]
}
/** 件数は持たない（A〜D の札の数は readSheetCounts） */
export type SheetPage = { rows: Sheet[]; next: string | null }
/** 方向性の区分ごとのシートの数。区分の当たらないシートは code が null の1行 */
export type SheetCount = { code: DirectionCode | null; label: string | null; grade: Sheet['grade']; n: number }

export const sheetKey = (q: SheetQuery) => JSON.stringify(['sheets', q.code, q.year, q.kind, q.subjects ?? null, q.cofog ?? null, q.q?.trim() || null, q.codes ?? null])
export const sheetCountKey = (q: SheetQuery) => JSON.stringify(['sheet-counts', q.code, q.year, q.kind, q.subjects ?? null, q.cofog ?? null, q.q?.trim() || null])

const sheetWhere = (q: SheetQuery): Record<string, unknown> => ({
  jurisdiction_code: { eq: [q.code] },
  account_name: { eq: [ACCOUNT] },
  ...(q.subjects ? { [`${q.kind}_expenditure_subject_id`]: { eq: q.subjects } } : {}),
  ...(q.cofog ? { [`${q.kind}_cofog_code`]: { eq: q.cofog } } : {}),
  ...(q.q?.trim() ? { name: { contains: fitSearch(q.q.trim()) } } : {}),
  ...(q.codes ? { direction_code: { eq: q.codes } } : {}),
})

export const toSheet = (s: SheetResult['sheets'][number], origins: SheetResult['origins']): Sheet => ({
  id: s.sheet_id,
  fy: s.fiscal_year,
  name: s.name,
  grade: s.outlook?.grade ?? null,
  dir: s.direction,
  dc: s.outlook?.code ?? null,
  dl: s.outlook?.label ?? null,
  div: s.division,
  acct: s.account_name ?? '',
  b: s.budget_yen,
  s: s.settled_yen,
  projects: s.project_ids,
  url: origins.find((o) => o.origin_id === s.origin_id)?.url ?? '',
  origin: s.origin_id,
  page: s.page,
})

const searchSheets = async (call: ApiCall, year: number | { min: number; max: number }, where: Record<string, unknown>, pageSize: number, token?: string, projectIds?: string[]) => {
  const r = await call('search_evaluation_sheets', { fiscal_year: typeof year === 'number' ? { min: year, max: year } : year, where, order_by: [{ column: 'settled_yen', desc: true }], page_size: pageSize, ...(projectIds ? { project_ids: projectIds } : {}), ...(token ? { page_token: token } : {}) } as SheetBody)
  return { rows: r.sheets.map((s) => toSheet(s, r.origins)), next: r.next_page_token ?? null }
}

/** 評価シートの一覧の1頁（サーバー）。決算の額の多い順。絞る科目・区分が空なら空 */
export async function readSheetPage(call: ApiCall, q: SheetQuery, token?: string): Promise<SheetPage> {
  if ((q.subjects && !q.subjects.length) || (q.codes && !q.codes.length)) return { rows: [], next: null }
  return searchSheets(call, q.year, sheetWhere(q), token ? NEXT_PAGE : FIRST_PAGE, token)
}

/** 条件に当たる評価シートの、方向性の区分ごとの数（サーバー）。区分では絞らない */
export async function readSheetCounts(call: ApiCall, q: SheetQuery): Promise<SheetCount[]> {
  if (q.subjects && !q.subjects.length) return []
  const r = await call('count_evaluation_sheets', { fiscal_year: { min: q.year, max: q.year }, where: sheetWhere({ ...q, codes: undefined }) } as WebOpInput<'count_evaluation_sheets'>)
  return r.counts.map((c) => ({ code: c.outlook?.code ?? null, label: c.outlook?.label ?? null, grade: c.outlook?.grade ?? null, n: c.size }))
}

/** 評価シートの検索で一度に指せる年度の数（API の上限） */
const MAX_SHEET_YEARS = 5
/** 事業を ID で引くときの1回の数（API の project_ids の上限） */
const PROJECT_CHUNK = 200

/** 事業と中の事業につないだ評価シート（サーバー） */
async function readSheetsOfProjects(call: ApiCall, years: { min: number; max: number }, projectIds: string[]): Promise<Sheet[]> {
  const chunks = Array.from({ length: Math.ceil(projectIds.length / PROJECT_CHUNK) }, (_, i) => projectIds.slice(i * PROJECT_CHUNK, (i + 1) * PROJECT_CHUNK))
  const pages = await Promise.all(chunks.map((c) => searchSheets(call, years, { account_name: { eq: [ACCOUNT] } }, 1000, undefined, c)))
  const seen = new Set<string>()
  return pages.flatMap((p) => p.rows).filter((s) => !seen.has(s.id) && seen.add(s.id))
}

/** 事業の詳細: 年度ごとの額と、開いた年度の中の事業 */
export type ProjectFull = {
  id: string
  name: string
  dept: string | null
  path: (string | null)[]
  started: number | null
  ended: number | null
  /** 年度ごとの当初予算（b）と決算（s） */
  y: Record<string, { b: number | null; s: number | null }>
  /** 開いた年度の中の事業（名前・金額）。金額の多い順 */
  kids: { name: string; yen: number | null; /** 事業の頁（年度を指さずに読んだとき）は、内訳の事業の ID と、額の年度・資料（その事業の最新の年度） */ id?: string; fy?: number; kind?: Kind }[]
  /** 分野を引く科目（開いた年度、無ければ最新の年度の行） */
  subject: string | null
  /** この事業と中の事業につないだ評価シート（年度を指して読めばその年度、指さなければ事業の年度すべて） */
  sheets: Sheet[]
  /** 開いた年度と資料（年度を指さずに読むと事業の最新の年度） */
  year?: number
  kind?: Kind
  /** 分野を引く科目の COFOG のコード（年度を指さずに読んだときだけ持つ。科目が無い・分類が無ければ null） */
  cofog?: string | null
}

/** 事業の詳細（サーバー） */
/** 事業の詳細（サーバー）。at を指さなければ事業の最新の年度（決算があれば決算）で、中の事業・評価シート・分野の COFOG を引く（事業の頁） */
export async function readProjectFull(call: ApiCall, id: string, at?: { year: number; kind: Kind }): Promise<ProjectFull> {
  const p = await call('get_project', { project_id: id })
  const latest = p.years.at(-1)
  const year = at?.year ?? latest?.fiscal_year ?? new Date().getFullYear()
  const kind: Kind = at?.kind ?? (latest?.settled_yen != null ? 'settlement' : 'initial')
  // 事業の頁（at なし）は年度をまたいで内訳の事業を引く。検索は5年度までなので、新しい方から5年度
  const first = p.years[0]?.fiscal_year ?? year
  const span = at ? { min: year, max: year } : { min: Math.max(first, year - (MAX_SHEET_YEARS - 1)), max: year }
  const kids = await searchYears(call, { fiscal_year: span, where: { parent_project_id: { eq: [id] } }, order_by: [{ column: kind === 'initial' ? 'budget_yen' : 'settled_yen', desc: true }], page_size: 1000 } as SearchBody)
  // 事業の頁（at なし）は、事業の年度すべての評価シートを引く（評価は評価した事業を行った年度に付くので、最新の年度には無いことが多い）。
  // 検索は5年度までなので、新しい方から5年度
  const sheets = await readSheetsOfProjects(call, span, [id, ...kids.project_years.map((k) => k.project_id)])
  const here = p.years.find((y) => y.fiscal_year === year) ?? latest
  const subject = here ? (kind === 'initial' ? here.initial_expenditure_subject_id : here.settlement_expenditure_subject_id) ?? here.initial_expenditure_subject_id ?? here.settlement_expenditure_subject_id : null
  // 事業の頁は開いた頁の年度の科目の表を持たないので、分野は科目の COFOG を引いて決める
  const cofog = at ? undefined : subject ? await subjectCofog(call, subject, here!, year) : null
  return {
    id,
    name: clean(p.project.name),
    dept: deptOf(latest?.name ?? p.project.name),
    path: latest ? [latest.kan_name, latest.kou_name, latest.moku_name] : [],
    started: p.project.first_year_kind === 'confirmed' ? p.project.first_year : null,
    ended: p.project.last_year_kind === 'confirmed' ? p.project.last_year : null,
    y: Object.fromEntries(p.years.map((y) => [String(y.fiscal_year), { b: y.budget_yen, s: y.settled_yen }])),
    kids: at ? kids.project_years.map((k) => ({ name: clean(k.name), yen: kind === 'initial' ? k.budget_yen : k.settled_yen })) : latestKids(kids.project_years),
    subject,
    sheets,
    ...(at ? {} : { year, kind, cofog }),
  }
}

/** 内訳の事業ごとに、その事業の最新の年度の行（決算があれば決算の額）。額の多い順 */
function latestKids(rows: SearchResult['project_years']): ProjectFull['kids'] {
  const last = new Map<string, SearchResult['project_years'][number]>()
  for (const y of rows) if ((last.get(y.project_id)?.fiscal_year ?? 0) < y.fiscal_year) last.set(y.project_id, y)
  return [...last.values()]
    .map((y) => {
      const kind: Kind = y.settled_yen != null ? 'settlement' : 'initial'
      return { id: y.project_id, name: clean(y.name), yen: kind === 'settlement' ? y.settled_yen : y.budget_yen, fy: y.fiscal_year, kind }
    })
    .sort((a, b) => (b.yen ?? -1) - (a.yen ?? -1))
}

/** 科目の COFOG のコード。科目は当初予算・決算のどちらかの資料にある */
async function subjectCofog(call: ApiCall, subject: string, y: { initial_expenditure_subject_id: string | null; jurisdiction_code: string; fiscal_year: number }, year: number): Promise<string | null> {
  const r = await call('search_expenditure_subjects', {
    document_kind: subject === y.initial_expenditure_subject_id ? 'initial' : 'settlement',
    fiscal_year: { min: year, max: year },
    where: { jurisdiction_code: { eq: [y.jurisdiction_code] }, subject_id: { eq: [subject] } },
    page_size: 1,
  } as WebOpInput<'search_expenditure_subjects'>)
  return r.subjects[0]?.cofog_code ?? null
}

/** 評価シートをつないだ事業の、その年度の行（サーバー） */
export async function readProjectOfId(call: ApiCall, id: string, year: number, kind: Kind): Promise<ProjRow | null> {
  const r = await searchYears(call, { fiscal_year: { min: year, max: year }, where: { project_id: { eq: [id] } }, page_size: 1 } as SearchBody)
  return rowsOf(r, kind)[0] ?? null
}

// ブラウザから読む口。web の /api（routes/api/projects.ts・routes/api/projects/[id].ts）がサーバーで上の read* を呼ぶ

async function webApi<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, init)
  if (!r.ok) throw new Error(`${path} ${r.status}`)
  return (await r.json()) as T
}

/** 評価シートの一覧の1頁 */
export const sheetPage = (q: SheetQuery, token?: string): Promise<SheetPage> =>
  webApi('/api/sheets', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: q, ...(token ? { token } : {}) }) })

/** 評価シートの方向性の区分ごとの数 */
export const sheetCounts = (q: SheetQuery): Promise<SheetCount[]> =>
  webApi('/api/sheets/counts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: q }) })

/** 一覧の1頁 */
export const listPage = (q: ListQuery, token?: string): Promise<ListPage> =>
  webApi('/api/projects', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: q, ...(token ? { token } : {}) }) })

/** 事業の詳細: 年度ごとの額と、開いた年度の中の事業 */
export const projectFull = (id: string, year: number, kind: Kind): Promise<ProjectFull> =>
  webApi(`/api/projects/${encodeURIComponent(id)}?${new URLSearchParams({ year: String(year), kind })}`)
/** 事業の頁の事業（事業の最新の年度で読む） */
export const projectLatest = (id: string): Promise<ProjectFull> => webApi(`/api/projects/${encodeURIComponent(id)}`)

/** その年度の分野ごとの末端の科目（やめた事業を分野で絞るとき、前の年度の分を読む） */
export const fieldSubjects = (code: string, year: number, kind: Kind): Promise<Record<string, string[]>> => webApi(`/api/jurisdictions/${code}/${year}/field-subjects?kind=${kind}`)

/** 評価シートをつないだ事業の、その年度の行 */
export const projectOfId = (project: string, year: number, kind: Kind): Promise<ProjRow | null> =>
  webApi(`/api/projects?${new URLSearchParams({ project, year: String(year), kind })}`)

