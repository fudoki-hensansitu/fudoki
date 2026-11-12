// 自治体の頁（アプリ型）のデータ。apps/api の歳出・事業・予算案・事業評価の検索から、1年度の款項目・施策・評価シートと事業の一覧の1頁目を組む。
// 事業の続き・詳細は画面が公開 API から読む（jurisdiction/app/api.ts）。紐付け（施策・評価シート → 事業）は api が持つ歳出の行の参照をたどるだけで、新しく判断しない
import type { AppType } from '@fudoki/api/rpc'
import { hc, parseResponse } from 'hono/client'
import { frameOf, OTHER_FRAME } from '../jurisdiction/domains'
import { listQuery, type Kan, type Measure, type Sheet, type Snapshot } from '../jurisdiction/app/data'
import { listKey, listPage } from '../jurisdiction/app/api'
import { apiFetch, type Env } from './env'
import { shownSettlementYears, type CatalogEntry } from './jurisdiction'
import { appPageYears } from '../jurisdiction/types'

const API_ORIGIN = 'https://api.fudoki.dev'
const ACCOUNT = '一般会計'
/** 内訳を ID で引くときの1回の数（API の bind の上限 90 から資料区分・年度の2つを除く） */
const ID_CHUNK = 88

const api = (env: Env) => hc<AppType>(API_ORIGIN, { fetch: apiFetch(env) })
type Api = ReturnType<typeof api>
type Body<F> = F extends (args: { json: infer J }) => unknown ? J : never
type SubjectBody = Body<Api['v1']['expenditures']['subjects:search']['$post']>
type MeasureBody = Body<Api['v1']['budget-proposals']['measures:search']['$post']>
type SheetBody = Body<Api['v1']['evaluations']['sheets:search']['$post']>

type Kind = 'initial' | 'settlement'

/** next_page_token が無くなるまで読む */
async function all<R extends { next_page_token?: string | null }, T>(page: (token?: string) => Promise<R>, rows: (r: R) => T[]): Promise<{ rows: T[]; last: R | undefined }> {
  const out: T[] = []
  let token: string | undefined
  let last: R | undefined
  do {
    last = await page(token)
    out.push(...rows(last))
    token = last.next_page_token ?? undefined
  } while (token)
  return { rows: out, last }
}

const subjectsOf = (env: Env, code: string, year: number, kind: Kind) =>
  all(
    (token) => parseResponse(api(env).v1.expenditures['subjects:search'].$post({ json: { document_kind: kind, fiscal_year: { min: year, max: year }, where: { jurisdiction_code: { eq: [code] }, account_name: { eq: [ACCOUNT] } }, page_size: 1000, ...(token ? { page_token: token } : {}) } as SubjectBody })),
    (r) => r.subjects,
  )

const measuresOf = (env: Env, code: string, min: number, max: number) =>
  all(
    (token) => parseResponse(api(env).v1['budget-proposals']['measures:search'].$post({ json: { fiscal_year: { min, max }, where: { jurisdiction_code: { eq: [code] } }, page_size: 1000, ...(token ? { page_token: token } : {}) } as MeasureBody })),
    (r) => r.measures.map((m) => ({ ...m, url: r.origins.find((o) => o.origin_id === m.origin_id)?.url ?? null })),
  )

const sheetsOf = (env: Env, code: string, min: number, max: number) =>
  all(
    (token) => parseResponse(api(env).v1.evaluations['sheets:search'].$post({ json: { fiscal_year: { min, max }, where: { jurisdiction_code: { eq: [code] }, account_name: { eq: [ACCOUNT] } }, page_size: 1000, ...(token ? { page_token: token } : {}) } as SheetBody })),
    (r) => r.sheets.map((s) => ({ ...s, url: r.origins.find((o) => o.origin_id === s.origin_id)?.url ?? null })),
  )

const fieldOf = (cofog: string | null | undefined) => ((cofog ? frameOf(cofog) : undefined) ?? OTHER_FRAME).id
const short = (id: string) => id.slice(0, 12)

/** 頁の年度（自治体の頁で選べる年度と同じ。jurisdiction/types.ts の appPageYears）。決算のある年度は決算、決算より後の年度は当初予算を読む */
export function appYears(entry: Pick<CatalogEntry, 'initialYears' | 'settlementYears'>): { year: number; kind: Kind }[] {
  const settled = shownSettlementYears(entry.settlementYears)
  const last = Math.max(0, ...settled)
  const years = appPageYears({ years: settled.map((year) => ({ year })), budgets: entry.initialYears.filter((y) => y > last).map((year) => ({ year })) })
  return years.map((year) => ({ year, kind: year > last ? 'initial' : 'settlement' }))
}

/** 施策の内訳が載る科目。内訳を ID で引く（D1 の bind の上限に合わせて区切る） */
async function subjectOfDetails(env: Env, year: number, ids: string[]): Promise<Map<string, string>> {
  const chunks = Array.from({ length: Math.ceil(ids.length / ID_CHUNK) }, (_, i) => ids.slice(i * ID_CHUNK, (i + 1) * ID_CHUNK))
  const pages = await Promise.all(chunks.map((c) => parseResponse(api(env).v1.expenditures['details:search'].$post({ json: { document_kind: 'initial', fiscal_year: { min: year, max: year }, where: { detail_id: { eq: c } }, page_size: 1000 } as SubjectBody }))))
  return new Map(pages.flatMap((r) => r.details.map((d) => [d.detail_id, d.subject_id] as const)))
}

/** 頁の1年度のデータ。全年度の款項目と、その年度の施策・評価シート・事業の一覧の1頁目（すべて・新しく始める・やめた、分野の頁なら分野）。
 * 1つの年度で API を十回ほど並べて呼ぶだけで、全件は読まない */
export async function loadYearSnapshot(env: Env, entry: CatalogEntry, year: number, opt: { field?: string; evaluated?: boolean } = {}): Promise<Snapshot> {
  const { field } = opt
  const years = appYears(entry)
  const me = years.find((y) => y.year === year)
  if (!me) throw new Error(`頁に無い年度: ${year}`)
  // ホームのまちの札は、評価のある最新の年度の評価シートを出す
  const evalYear = opt.evaluated ? Math.max(0, ...entry.evaluationYears.filter((y) => years.some((x) => x.year === y))) : 0
  // 施策は当初予算書の内訳に紐づくので、決算の年度でも同じ年度の当初予算の科目から分野を引く
  const measureYear = me.kind === 'settlement' && entry.initialYears.includes(year)
  const [subjects, measures, sheets, evalSheets, initialSubjects] = await Promise.all([
    Promise.all(years.map(async (y) => {
      const r = await subjectsOf(env, entry.code, y.year, y.kind)
      const origin = r.last?.origins?.find((o) => o.origin_id === r.rows[0]?.origin_id)
      return { ...y, rows: r.rows, origin: origin?.url ?? null, originTitle: origin?.title ?? null }
    })),
    measuresOf(env, entry.code, year, year).then((r) => r.rows),
    sheetsOf(env, entry.code, year, year).then((r) => r.rows),
    evalYear && evalYear !== year ? sheetsOf(env, entry.code, evalYear, evalYear).then((r) => r.rows) : Promise.resolve(null),
    measureYear ? subjectsOf(env, entry.code, year, 'initial').then((r) => r.rows) : Promise.resolve([]),
  ])
  const cofogByMoku = new Map(subjects.filter((y) => y.year === year).flatMap((y) => y.rows.filter((s) => s.level === '目').map((s) => [`${s.kan_name}/${s.kou_name}/${s.moku_name}`, s.cofog_code] as const)))
  const cofogBySubject = new Map([...subjects.flatMap((y) => y.rows), ...initialSubjects].map((s) => [s.subject_id, s.cofog_code] as const))

  // 年度ごとの款・項・目と分野の合計
  const yearsOut: Snapshot['years'] = {}
  for (const y of subjects) {
    const rows = [...y.rows].sort((a, b) => `${a.kan_code}/${a.kou_code}/${a.moku_code}`.localeCompare(`${b.kan_code}/${b.kou_code}/${b.moku_code}`))
    const kan: Kan[] = []
    const fields: Record<string, number> = {}
    const fieldSubjects: Record<string, string[]> = {}
    for (const r of rows) {
      const yen = r.amount_yen ?? 0
      if (r.is_leaf) (fieldSubjects[fieldOf(r.cofog_code)] ??= []).push(r.subject_id)
      if (r.level === '款') kan.push({ name: r.name, yen, kou: [] })
      else if (r.level === '項') kan.at(-1)?.kou.push({ name: r.name, yen, moku: [] })
      else if (r.level === '目') {
        const field = fieldOf(r.cofog_code)
        kan.at(-1)?.kou.at(-1)?.moku.push({ id: r.subject_id, name: r.name, yen, field })
        fields[field] = (fields[field] ?? 0) + yen
      }
    }
    yearsOut[y.year] = { kind: y.kind, kan, total: kan.reduce((s, k) => s + k.yen, 0), fields, fieldSubjects, origin: y.origin, originTitle: y.originTitle }
  }

  const base = { code: entry.code, year, years: yearsOut }
  const queries = [listQuery(base, 'all'), ...(yearsOut[year - 1] ? [listQuery(base, 'new'), listQuery(base, 'ended')] : [])]
  if (field) queries.push(listQuery(base, 'all', { subjects: yearsOut[year]!.fieldSubjects[field] ?? [] }))
  const measureDetails = [...new Set(measures.flatMap((m) => (m.expenditure_detail_id ? [m.expenditure_detail_id] : [])))]
  const [pages, subjectOfDetail] = await Promise.all([
    Promise.all(queries.map((q) => listPage(q, undefined, apiFetch(env)).then((p) => [listKey(q), p] as const))),
    measureDetails.length ? subjectOfDetails(env, year, measureDetails) : Promise.resolve(new Map<string, string>()),
  ])

  const measuresOut: Measure[] = measures.map((m) => ({
    id: short(m.measure_id),
    fy: m.fiscal_year,
    title: m.title ?? '',
    new: m.is_new,
    yen: m.budget_yen,
    desc: (m.description ?? '').split('\n').filter(Boolean),
    detail: m.expenditure_detail_id,
    field: fieldOf(m.expenditure_detail_id ? cofogBySubject.get(subjectOfDetail.get(m.expenditure_detail_id) ?? '') : undefined),
    url: m.url ?? '',
    origin: m.origin_id,
    page: m.page,
  }))
  const toSheet = (s: (typeof sheets)[number]): Sheet => ({
    id: short(s.sheet_id),
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
    detail: s.expenditure_detail_id,
    field: fieldOf(cofogByMoku.get(`${s.kan_name}/${s.kou_name}/${s.moku_name}`)),
    url: s.url ?? '',
    origin: s.origin_id,
    page: s.page,
  })
  const sheetsOut = sheets.map(toSheet)
  const lists = Object.fromEntries(pages)
  return {
    code: entry.code,
    name: entry.name,
    pop: entry.population?.people ?? 0,
    year,
    years: yearsOut,
    measures: measuresOut,
    sheets: sheetsOut,
    ...(evalYear ? { evaluated: { fy: evalYear, sheets: evalSheets ? evalSheets.map(toSheet) : sheetsOut } } : {}),
    hasProjects: (lists[listKey(queries[0]!)]?.total ?? 0) > 0,
    lists,
  }
}
