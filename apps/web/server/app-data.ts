// 自治体の頁（アプリ型）のデータ。apps/api の歳出・事業・予算案・事業評価の検索から、1年度の款項目・施策・評価シートと事業の一覧の1頁目を組む。
// 事業の続き・詳細は画面が web の /api から読む（jurisdiction/app/api.ts）。紐付け（施策・評価シート → 事業）は api が持つ歳出の行の参照をたどるだけで、新しく判断しない
import { frameOf, OTHER_FRAME } from '../jurisdiction/domains'
import { listQuery, type Kan, type YearData, type Measure, type Sheet, type Snapshot } from '../jurisdiction/app/data'
import { listKey, readListPage } from '../jurisdiction/app/api'
import type { Env } from './env'
import { apiCall, type WebOpInput } from './fudoki-api'
import { loadAccountTotals, shownSettlementYears, type CatalogEntry } from './jurisdiction'
import { appPageYears, type PageTab } from '../jurisdiction/types'

const ACCOUNT = '一般会計'
/** 内訳を ID で引くときの1回の数（API の bind の上限 90 から資料区分・年度・自治体の3つを除く） */
const ID_CHUNK = 87

type SubjectBody = WebOpInput<'search_expenditure_subjects'>
type DetailBody = WebOpInput<'search_expenditure_details'>
type MeasureBody = WebOpInput<'search_budget_measures'>
type SheetBody = WebOpInput<'search_evaluation_sheets'>

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
    (token) => apiCall(env)('search_expenditure_subjects', { document_kind: kind, fiscal_year: { min: year, max: year }, where: { jurisdiction_code: { eq: [code] }, account_name: { eq: [ACCOUNT] } }, page_size: 1000, ...(token ? { page_token: token } : {}) } as SubjectBody),
    (r) => r.subjects,
  )

const measuresOf = (env: Env, code: string, min: number, max: number) =>
  all(
    (token) => apiCall(env)('search_budget_measures', { fiscal_year: { min, max }, where: { jurisdiction_code: { eq: [code] } }, page_size: 1000, ...(token ? { page_token: token } : {}) } as MeasureBody),
    (r) => r.measures.map((m) => ({ ...m, url: r.origins.find((o) => o.origin_id === m.origin_id)?.url ?? null })),
  )

const sheetsOf = (env: Env, code: string, min: number, max: number) =>
  all(
    (token) => apiCall(env)('search_evaluation_sheets', { fiscal_year: { min, max }, where: { jurisdiction_code: { eq: [code] }, account_name: { eq: [ACCOUNT] } }, page_size: 1000, ...(token ? { page_token: token } : {}) } as SheetBody),
    (r) => r.sheets.map((s) => ({ ...s, url: r.origins.find((o) => o.origin_id === s.origin_id)?.url ?? null })),
  )

const fieldOf = (cofog: string | null | undefined) => ((cofog ? frameOf(cofog) : undefined) ?? OTHER_FRAME).id
const short = (id: string) => id.slice(0, 12)

/** 頁の年度（自治体の頁で選べる年度と同じ。jurisdiction/types.ts の appPageYears）。決算のある年度は決算、決算より後の年度は当初予算を読む */
export function appYears(entry: Pick<CatalogEntry, 'initialYears' | 'settlementYears'>): { year: number; kind: Kind }[] {
  const settled = shownSettlementYears(entry.settlementYears)
  const last = Math.max(0, ...settled)
  const years = appPageYears({ settlementYears: settled, budgetYears: entry.initialYears.filter((y) => y > last) })
  return years.map((year) => ({ year, kind: year > last ? 'initial' : 'settlement' }))
}

/** 施策の内訳が載る科目。内訳を ID で引く（D1 の bind の上限に合わせて区切る）。自治体でも絞らないと、D1 が年度の索引でその年度の内訳を全部読む */
async function subjectOfDetails(env: Env, code: string, year: number, ids: string[]): Promise<Map<string, string>> {
  const chunks = Array.from({ length: Math.ceil(ids.length / ID_CHUNK) }, (_, i) => ids.slice(i * ID_CHUNK, (i + 1) * ID_CHUNK))
  const pages = await Promise.all(chunks.map((c) => apiCall(env)('search_expenditure_details', { document_kind: 'initial', fiscal_year: { min: year, max: year }, where: { jurisdiction_code: { eq: [code] }, detail_id: { eq: c } }, page_size: 1000 } as DetailBody)))
  return new Map(pages.flatMap((r) => r.details.map((d) => [d.detail_id, d.subject_id] as const)))
}

/** 頁の1年度のデータ。開いた年度の款項目、前の年度の分野ごとの科目、その年度の施策・評価シート・会計ごとの総額・事業の一覧の1頁目（すべて・新しく始める・やめた、分野の頁なら分野）。
 * 1つの年度で API を十回ほど並べて呼ぶだけで、全件は読まない。
 * tab を渡すと、事業のタブのほかは前の年度の科目と新しく始める・やめた事業の一覧を持たない。無ければ全部（ホームのまちの札）。
 * 施策・評価シートと事業の一覧の1頁目はどのタブでも持つ（予算・決算のタブで開く事業の詳細が施策・評価シートを出し、スマホは全部のタブの中身を並べて描くため） */
export async function loadYearSnapshot(env: Env, entry: CatalogEntry, year: number, opt: { field?: string; evaluated?: boolean; tab?: PageTab } = {}): Promise<Snapshot> {
  const { field, tab } = opt
  // 前の年度との比べ（やめた事業とその分野）は事業のタブだけが描く
  const compare = !tab || tab === 'projects'
  const years = appYears(entry)
  const me = years.find((y) => y.year === year)
  if (!me) throw new Error(`頁に無い年度: ${year}`)
  // ホームのまちの札は、評価のある最新の年度の評価シートを出す
  const evalYear = opt.evaluated ? Math.max(0, ...entry.evaluationYears.filter((y) => years.some((x) => x.year === y))) : 0
  // 施策は当初予算書の内訳に紐づくので、決算の年度でも同じ年度の当初予算の科目から分野を引く
  const measureYear = me.kind === 'settlement' && entry.initialYears.includes(year)
  // 款項目は開いた年度と前の年度だけ読む（前の年度は「やめた事業」を分野で絞るのと、その行の分野の名前に使う）。ほかの年度は資料の種類だけを coverage から持つ
  const prev = years.find((y) => y.year === year - 1)
  const prevRead = prev && compare ? prev : undefined
  // 会計の札（予算・決算のタブ）。一般会計のほかにも会計を収録した年度だけ、会計ごとの総額を読む
  const accounts = entry.accounts?.[me.kind]?.[String(year)] ?? []
  // 事業の一覧の1頁目（すべて）は年度と資料の種類だけで決まるので、款項目を待たずに読み始める
  const allQuery = listQuery({ code: entry.code, year, years: { [year]: { kind: me.kind } as YearData }, prev: undefined }, 'all')
  const allPage = readListPage(apiCall(env), allQuery).then((p) => [listKey(allQuery), p] as const)
  allPage.catch(() => {})
  const [subjects, measures, sheets, evalSheets, initialSubjects, accountTotals] = await Promise.all([
    Promise.all([me, ...(prevRead ? [prevRead] : [])].map(async (y) => {
      const r = await subjectsOf(env, entry.code, y.year, y.kind)
      const origin = r.last?.origins?.find((o) => o.origin_id === r.rows[0]?.origin_id)
      return { ...y, rows: r.rows, origin: origin?.url ?? null, originTitle: origin?.title ?? null }
    })),
    measuresOf(env, entry.code, year, year).then((r) => r.rows),
    sheetsOf(env, entry.code, year, year).then((r) => r.rows),
    evalYear && evalYear !== year ? sheetsOf(env, entry.code, evalYear, evalYear).then((r) => r.rows) : Promise.resolve(null),
    measureYear ? subjectsOf(env, entry.code, year, 'initial').then((r) => r.rows) : Promise.resolve([]),
    accounts.length > 1 ? loadAccountTotals(env, entry.code, year, me.kind, accounts) : Promise.resolve(undefined),
  ])
  const cofogByMoku = new Map(subjects.filter((y) => y.year === year).flatMap((y) => y.rows.filter((s) => s.level === '目').map((s) => [`${s.kan_name}/${s.kou_name}/${s.moku_name}`, s.cofog_code] as const)))
  const cofogBySubject = new Map([...subjects.flatMap((y) => y.rows), ...initialSubjects].map((s) => [s.subject_id, s.cofog_code] as const))

  // 年度ごとの款・項・目と分野の合計。前の年度は分野ごとの科目だけを渡す
  const yearsOut: Snapshot['years'] = {}
  let prevOut: Snapshot['prev']
  for (const y of subjects) {
    const rows = [...y.rows].sort((a, b) => `${a.kan_code}/${a.kou_code}/${a.moku_code}`.localeCompare(`${b.kan_code}/${b.kou_code}/${b.moku_code}`))
    const kan: Kan[] = []
    const fields: Record<string, number> = {}
    const fieldSubjects: Record<string, string[]> = {}
    const looseMoku: YearData['looseMoku'] = []
    let lastKou: string | undefined
    for (const r of rows) {
      const yen = r.amount_yen ?? 0
      if (r.is_leaf) (fieldSubjects[fieldOf(r.cofog_code)] ??= []).push(r.subject_id)
      if (r.level === '款') kan.push({ name: r.name, yen, kou: [] })
      else if (r.level === '項') {
        kan.at(-1)?.kou.push({ name: r.name, yen, moku: [] })
        lastKou = r.subject_id
      } else if (r.level === '目') {
        const field = fieldOf(r.cofog_code)
        const kou = r.parent_subject_id === lastKou ? kan.at(-1)?.kou.at(-1) : undefined
        ;(kou?.moku ?? looseMoku).push({ id: r.subject_id, name: r.name, yen, field, cofog: r.cofog_code ?? null })
        fields[field] = (fields[field] ?? 0) + yen
      }
    }
    if (y.year === year) yearsOut[y.year] = { kind: y.kind, kan, total: kan.reduce((s, k) => s + k.yen, 0), fields, fieldSubjects, looseMoku, origin: y.origin, originTitle: y.originTitle }
    else prevOut = { year: y.year, kind: y.kind, fieldSubjects }
  }
  if (prev && !prevOut) prevOut = { year: prev.year, kind: prev.kind }

  const base = { code: entry.code, year, years: yearsOut, prev: prevOut }
  const queries = [...(prevOut?.fieldSubjects ? [listQuery(base, 'new'), listQuery(base, 'ended')] : [])]
  if (field) queries.push(listQuery(base, 'all', { subjects: yearsOut[year]!.fieldSubjects[field] ?? [] }))
  const measureDetails = [...new Set(measures.flatMap((m) => (m.expenditure_detail_id ? [m.expenditure_detail_id] : [])))]
  const [pages, subjectOfDetail] = await Promise.all([
    Promise.all([allPage, ...queries.map((q) => readListPage(apiCall(env), q).then((p) => [listKey(q), p] as const))]),
    measureDetails.length ? subjectOfDetails(env, entry.code, year, measureDetails) : Promise.resolve(new Map<string, string>()),
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
    kinds: Object.fromEntries(years.map((y) => [String(y.year), y.kind])),
    years: yearsOut,
    ...(prevOut ? { prev: prevOut } : {}),
    ...(accountTotals ? { accounts: accountTotals } : {}),
    measures: measuresOut,
    sheets: sheetsOut,
    ...(evalYear ? { evaluated: { fy: evalYear, sheets: evalSheets ? evalSheets.map(toSheet) : sheetsOut } } : {}),
    hasProjects: (lists[listKey(allQuery)]?.total ?? 0) > 0,
    lists,
  }
}
