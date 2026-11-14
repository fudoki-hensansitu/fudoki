// 自治体の頁が事業を読む口。サーバーは api の内部の RPC（server/fudoki-api.ts の ApiCall）で事業の検索・事業を読み、ブラウザは web の /api（routes/api/projects）を通して同じものを読む。
// ブラウザは api.fudoki.dev を直接は呼ばない（ADR 0044）。一覧は頁ごとに読む（1頁目はサーバーが描き、続きは末尾が見えたときにブラウザが取る）。分野・目で絞るときは科目の ID で絞る
import type { ApiCall, WebOpInput, WebOpOutput } from '../../server/fudoki-api'
import type { YearExtras } from './data'
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
  /** 当初予算・決算の事業の行（施策・評価シートの紐付けを照らすのに使う） */
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
  /** 事業名（所管課を含む）で絞る */
  q?: string
}
export type ListPage = { rows: ProjRow[]; total: number; capped: boolean; next: string | null }

export const listKey = (q: ListQuery) => JSON.stringify([q.code, q.year, q.kind, q.filter, q.prevKind ?? null, q.subjects ?? null, q.q?.trim() || null])

/** API の GLOB は前後の * と escape（* ? [ は3バイト）を含めて50バイトまで。長い検索語は収まるところまでで探す */
const GLOB_BYTES = 50
function fitSearch(q: string): string {
  const bytes = (t: string) => new TextEncoder().encode(`*${t.replace(/[*?[]/g, '[$&]')}*`).length
  let t = q
  while (t && bytes(t) > GLOB_BYTES) t = Array.from(t).slice(0, -1).join('')
  return t
}

const clean = (name: string) => name.replace(/【[^】]*】/g, '').trim()
/** 出典の事業名の【】は所管課。名前からは外して別に持つ */
const deptOf = (name: string) => name.match(/【([^】]*)】/)?.[1] ?? null

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
  kids: { name: string; yen: number | null }[]
  /** 分野を引く科目（開いた年度、無ければ最新の年度の行） */
  subject: string | null
  /** この事業と中の事業の、当初予算・決算の事業の行 */
  initialDetails: string[]
  settlementDetails: string[]
}

/** 事業の詳細（サーバー） */
export async function readProjectFull(call: ApiCall, id: string, year: number, kind: Kind): Promise<ProjectFull> {
  const [p, kids] = await Promise.all([
    call('get_project', { project_id: id }),
    searchYears(call, { fiscal_year: { min: year, max: year }, where: { parent_project_id: { eq: [id] } }, order_by: [{ column: kind === 'initial' ? 'budget_yen' : 'settled_yen', desc: true }], page_size: 1000 } as SearchBody),
  ])
  const latest = p.years.at(-1)
  const here = p.years.find((y) => y.fiscal_year === year) ?? latest
  const pick = <K extends 'initial_expenditure_detail_id' | 'settlement_expenditure_detail_id'>(k: K) =>
    [...p.years.filter((y) => y.fiscal_year === year), ...kids.project_years].map((y) => y[k]).filter((x): x is string => !!x)
  return {
    id,
    name: clean(p.project.name),
    dept: deptOf(latest?.name ?? p.project.name),
    path: latest ? [latest.kan_name, latest.kou_name, latest.moku_name] : [],
    started: p.project.first_year_kind === 'confirmed' ? p.project.first_year : null,
    ended: p.project.last_year_kind === 'confirmed' ? p.project.last_year : null,
    y: Object.fromEntries(p.years.map((y) => [String(y.fiscal_year), { b: y.budget_yen, s: y.settled_yen }])),
    kids: kids.project_years.map((k) => ({ name: clean(k.name), yen: kind === 'initial' ? k.budget_yen : k.settled_yen })),
    subject: here ? (kind === 'initial' ? here.initial_expenditure_subject_id : here.settlement_expenditure_subject_id) ?? here.initial_expenditure_subject_id ?? here.settlement_expenditure_subject_id : null,
    initialDetails: pick('initial_expenditure_detail_id'),
    settlementDetails: pick('settlement_expenditure_detail_id'),
  }
}

/** 施策（当初予算）・評価シート（決算）を紐付けた内訳が載る事業（サーバー） */
export async function readProjectOfDetail(call: ApiCall, detail: string, year: number, kind: Kind): Promise<ProjRow | null> {
  const r = await searchYears(call, { fiscal_year: { min: year, max: year }, where: { [`${kind}_expenditure_detail_id`]: { eq: [detail] } }, page_size: 1 } as SearchBody)
  return rowsOf(r, kind)[0] ?? null
}

// ブラウザから読む口。web の /api（routes/api/projects.ts・routes/api/projects/[id].ts）がサーバーで上の read* を呼ぶ

async function webApi<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, init)
  if (!r.ok) throw new Error(`${path} ${r.status}`)
  return (await r.json()) as T
}

/** 一覧の1頁 */
export const listPage = (q: ListQuery, token?: string): Promise<ListPage> =>
  webApi('/api/projects', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: q, ...(token ? { token } : {}) }) })

/** 事業の詳細: 年度ごとの額と、開いた年度の中の事業 */
export const projectFull = (id: string, year: number, kind: Kind): Promise<ProjectFull> =>
  webApi(`/api/projects/${encodeURIComponent(id)}?${new URLSearchParams({ year: String(year), kind })}`)

/** 頁の1年度の、最初の画面に要らない分（施策・評価シート・事業の1頁目）。CDN に置いた /jurisdiction-years/:code/:year/extras を読む */
export const yearExtras = (code: string, year: number): Promise<YearExtras> => webApi(`/jurisdiction-years/${code}/${year}/extras`)

/** その年度の分野ごとの末端の科目（やめた事業を分野で絞るとき、前の年度の分を読む） */
export const fieldSubjects = (code: string, year: number): Promise<Record<string, string[]>> => webApi(`/jurisdiction-years/${code}/${year}/field-subjects`)

/** 予算・決算のタブの流れの図の、目ごとの節（無ければ事業）。CDN に置いた /jurisdiction-years/:code/:year/setsu/:phase を読む */
export const setsuOf = (code: string, year: number, phase: Kind, account: string): Promise<Record<string, Setsu[]>> =>
  webApi(`/jurisdiction-years/${code}/${year}/setsu/${phase}${account === ACCOUNT ? '' : `/${encodeURIComponent(account)}`}`)

/** 施策・評価シートを紐付けた内訳が載る事業 */
export const projectOfDetail = (detail: string, year: number, kind: Kind): Promise<ProjRow | null> =>
  webApi(`/api/projects?${new URLSearchParams({ detail, year: String(year), kind })}`)
