// 自治体の頁（アプリ型）のデータ。apps/api の歳出・事業・予算案・事業評価の検索から、年度ごとの款項目・事業・施策・評価シートを組む。
// 事業の収録が無い自治体は、目を事業の代わりに並べる。紐付け（施策・評価シート → 事業）は api が持つ歳出の行の参照をたどるだけで、新しく判断しない
import type { AppType } from '@fudoki/api/rpc'
import { hc, parseResponse } from 'hono/client'
import { frameOf, OTHER_FRAME } from '../jurisdiction/domains'
import type { Kan, Measure, Proj, Sheet, Snapshot } from '../jurisdiction/app/data'
import { apiFetch, type Env } from './env'
import type { CatalogEntry } from './jurisdiction'

const API_ORIGIN = 'https://api.fudoki.dev'
const ACCOUNT = '一般会計'
/** 頁で切り替えられる年度の数（新しい順） */
const YEAR_COUNT = 3
/** 事業として並べる内訳の深さ。1 が目の直下の事業、2 がその中の事業。施策・評価シートの行から事業へたどるために 3 まで読む */
const DETAIL_DEPTH = 3

const api = (env: Env) => hc<AppType>(API_ORIGIN, { fetch: apiFetch(env) })
type Api = ReturnType<typeof api>
type Body<F> = F extends (args: { json: infer J }) => unknown ? J : never
type SubjectBody = Body<Api['v1']['expenditures']['subjects:search']['$post']>
type ProjectBody = Body<Api['v1']['projects:search']['$post']>
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

const detailsOf = (env: Env, code: string, year: number, kind: Kind) =>
  all(
    (token) => parseResponse(api(env).v1.expenditures['details:search'].$post({ json: { document_kind: kind, fiscal_year: { min: year, max: year }, where: { jurisdiction_code: { eq: [code] }, account_name: { eq: [ACCOUNT] }, depth: { min: 1, max: DETAIL_DEPTH } }, page_size: 1000, ...(token ? { page_token: token } : {}) } as SubjectBody })),
    (r) => r.details,
  )

const projectYearsOf = (env: Env, code: string, min: number, max: number) =>
  all(
    (token) => parseResponse(api(env).v1['projects:search'].$post({ json: { fiscal_year: { min, max }, where: { jurisdiction_code: { eq: [code] }, account_name: { eq: [ACCOUNT] } }, page_size: 1000, ...(token ? { page_token: token } : {}) } as ProjectBody })),
    (r) => r.project_years,
  )

const measuresOf = (env: Env, code: string, min: number, max: number) =>
  all(
    (token) => parseResponse(api(env).v1['budget-proposals']['measures:search'].$post({ json: { fiscal_year: { min, max }, where: { jurisdiction_code: { eq: [code] } }, page_size: 1000, ...(token ? { page_token: token } : {}) } as MeasureBody })),
    (r) => r.measures.map((m) => ({ ...m, url: r.origins.find((o) => o.origin_id === m.origin_id)?.url ?? null })),
  )

const sheetsOf = (env: Env, code: string, min: number, max: number) =>
  all(
    (token) => parseResponse(api(env).v1.evaluations['sheets:search'].$post({ json: { fiscal_year: { min, max }, where: { jurisdiction_code: { eq: [code] } }, page_size: 1000, ...(token ? { page_token: token } : {}) } as SheetBody })),
    (r) => r.sheets.map((s) => ({ ...s, url: r.origins.find((o) => o.origin_id === s.origin_id)?.url ?? null })),
  )

const fieldOf = (cofog: string | null | undefined) => ((cofog ? frameOf(cofog) : undefined) ?? OTHER_FRAME).id
/** 出典の事業名の末尾の【所管課】は所管課として別に持つので、名前からは外す */
const clean = (name: string) => name.replace(/【[^】]*】/g, '').trim()
const short = (id: string) => id.slice(0, 12)

/** 頁の年度。当初予算があれば当初予算、無ければ決算を読む（新しい順に YEAR_COUNT 年） */
export function appYears(entry: Pick<CatalogEntry, 'initialYears' | 'settlementYears'>): { year: number; kind: Kind }[] {
  const years = [...new Set([...entry.initialYears, ...entry.settlementYears])].sort((a, b) => b - a).slice(0, YEAR_COUNT)
  return years.map((year) => ({ year, kind: entry.initialYears.includes(year) ? 'initial' : 'settlement' }))
}

export async function loadAppData(env: Env, entry: CatalogEntry): Promise<Snapshot> {
  const years = appYears(entry)
  if (!years.length) return { code: entry.code, name: entry.name, pop: entry.population?.people ?? 0, years: {}, projects: [], measures: [], sheets: [] }
  const min = years.at(-1)!.year
  const max = years[0]!.year
  // 決算は事業の決算額と評価シートの付け先に使う。頁の年度の範囲で決算のある年度だけ
  const settled = entry.settlementYears.filter((y) => y >= min && y <= max)
  const docs: { year: number; kind: Kind }[] = [...years.filter((y) => y.kind === 'initial'), ...settled.map((year) => ({ year, kind: 'settlement' as const }))]
  const [subjects, projectYears, measures, sheets] = await Promise.all([
    Promise.all(years.map(async (y) => {
      const r = await subjectsOf(env, entry.code, y.year, y.kind)
      const origin = r.last?.origins?.find((o) => o.origin_id === r.rows[0]?.origin_id)
      return { ...y, rows: r.rows, origin: origin?.url ?? null, originTitle: origin?.title ?? null }
    })),
    projectYearsOf(env, entry.code, min, max).then((r) => r.rows),
    measuresOf(env, entry.code, min, max).then((r) => r.rows),
    sheetsOf(env, entry.code, min, max).then((r) => r.rows),
  ])
  const details = projectYears.length ? (await Promise.all(docs.map((d) => detailsOf(env, entry.code, d.year, d.kind)))).flatMap((r) => r.rows) : []

  const cofogBySubject = new Map(subjects.flatMap((y) => y.rows.map((s) => [s.subject_id, s.cofog_code] as const)))
  const cofogByMoku = new Map(subjects.flatMap((y) => y.rows.filter((s) => s.level === '目').map((s) => [`${s.kan_name}/${s.kou_name}/${s.moku_name}`, s.cofog_code] as const)))

  // 年度ごとの款・項・目と分野の合計
  const yearsOut: Snapshot['years'] = {}
  for (const y of subjects) {
    const rows = [...y.rows].sort((a, b) => `${a.kan_code}/${a.kou_code}/${a.moku_code}`.localeCompare(`${b.kan_code}/${b.kou_code}/${b.moku_code}`))
    const kan: Kan[] = []
    const fields: Record<string, number> = {}
    for (const r of rows) {
      const yen = r.amount_yen ?? 0
      if (r.level === '款') kan.push({ name: r.name, yen, kou: [] })
      else if (r.level === '項') kan.at(-1)?.kou.push({ name: r.name, yen, moku: [] })
      else if (r.level === '目') {
        const field = fieldOf(r.cofog_code)
        kan.at(-1)?.kou.at(-1)?.moku.push({ name: r.name, yen, field })
        fields[field] = (fields[field] ?? 0) + yen
      }
    }
    yearsOut[y.year] = { kind: y.kind, kan, total: kan.reduce((s, k) => s + k.yen, 0), fields, origin: y.origin, originTitle: y.originTitle }
  }

  // 事業。目の直下の内訳（深さ1）に付いた事業だけを並べ、その中の内訳（深さ2）を中の事業にする
  const detailById = new Map(details.map((d) => [d.detail_id, d]))
  const top = (id: string | null | undefined) => {
    let d = id ? detailById.get(id) : undefined
    while (d?.parent_detail_id) d = detailById.get(d.parent_detail_id)
    return d
  }
  const projectByDetail = new Map<string, string>()
  const projects = new Map<string, Proj & { latest: number }>()
  for (const py of projectYears) {
    for (const [kind, id] of [['initial', py.initial_expenditure_detail_id], ['settlement', py.settlement_expenditure_detail_id]] as const) {
      const d = id ? detailById.get(id) : undefined
      if (!d || d.depth !== 1) continue
      const pid = short(py.project_id)
      projectByDetail.set(d.detail_id, pid)
      const p = projects.get(pid) ?? { id: pid, name: clean(d.name), dept: d.department, path: [d.kan_name, d.kou_name, d.moku_name], field: 'other', y: {}, kids: {}, latest: 0 }
      const y = (p.y[py.fiscal_year] ??= {})
      if (kind === 'initial') y.b = d.amount_yen
      else y.s = d.amount_yen
      if (py.fiscal_year >= p.latest && (kind === 'initial' || !p.y[py.fiscal_year]?.b)) {
        Object.assign(p, { latest: py.fiscal_year, name: clean(d.name), dept: d.department, path: [d.kan_name, d.kou_name, d.moku_name], field: fieldOf(cofogBySubject.get(d.subject_id) ?? cofogByMoku.get(`${d.kan_name}/${d.kou_name}/${d.moku_name}`)) })
      }
      if (kind === 'initial') {
        const kids = details.filter((k) => k.parent_detail_id === d.detail_id).map((k) => [clean(k.name), k.amount_yen] as [string, number | null]).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
        if (kids.length) p.kids[py.fiscal_year] = kids
      }
      projects.set(pid, p)
    }
  }
  // 事業の収録が無い自治体は、目を事業の代わりにする（中の事業・所管課は持たない）
  if (!projects.size) {
    for (const y of subjects) {
      for (const r of y.rows) {
        if (r.level !== '目') continue
        const pid = short(r.node_key ?? `${r.kan_name}/${r.kou_name}/${r.moku_name}`)
        const p = projects.get(pid) ?? { id: pid, name: r.name, dept: null, path: [r.kan_name, r.kou_name, r.moku_name], field: fieldOf(r.cofog_code), y: {}, kids: {}, latest: y.year }
        const yy = (p.y[y.year] ??= {})
        if (y.kind === 'initial') yy.b = r.amount_yen
        else yy.s = r.amount_yen
        projects.set(pid, p)
      }
    }
  }
  const projectOf = (detailId: string | null | undefined) => {
    const t = top(detailId)
    return t ? (projectByDetail.get(t.detail_id) ?? null) : null
  }

  const measuresOut: Measure[] = measures.map((m) => {
    const d = m.expenditure_detail_id ? detailById.get(m.expenditure_detail_id) : undefined
    return {
      id: short(m.measure_id),
      fy: m.fiscal_year,
      title: m.title ?? '',
      new: m.is_new,
      yen: m.budget_yen,
      desc: (m.description ?? '').split('\n').filter(Boolean),
      project: projectOf(m.expenditure_detail_id),
      field: fieldOf(d ? cofogBySubject.get(d.subject_id) : undefined),
      url: m.url ?? '',
      page: m.page,
    }
  })
  const sheetsOut: Sheet[] = sheets.map((s) => {
    const project = projectOf(s.expenditure_detail_id)
    return {
      id: short(s.sheet_id),
      fy: s.fiscal_year,
      name: s.name,
      grade: s.grade_code as Sheet['grade'],
      dir: s.direction,
      div: s.division,
      acct: s.account_name ?? '',
      b: s.budget_yen,
      s: s.settled_yen,
      project,
      field: project ? (projects.get(project)?.field ?? 'other') : fieldOf(cofogByMoku.get(`${s.kan_name}/${s.kou_name}/${s.moku_name}`)),
      url: s.url ?? '',
      page: s.page,
    }
  })
  return {
    code: entry.code,
    name: entry.name,
    pop: entry.population?.people ?? 0,
    years: yearsOut,
    projects: [...projects.values()].map(({ latest: _, ...p }) => p),
    measures: measuresOut,
    sheets: sheetsOut,
  }
}
