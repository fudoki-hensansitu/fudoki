// 自治体の頁（アプリ型）のデータ。apps/api の歳出・事業・予算案・事業評価の検索から、1年度の款項目・施策・評価シートと事業の一覧の1頁目を組む。
// 頁の loader は最初の画面に要る分（loadYearSnapshot）だけを読み、残り（loadYearExtras）は頁を描いた後にブラウザが web の /api/jurisdictions/:code/:year/extras から読む。
// 事業の続き・詳細は画面が web の /api から読む（jurisdiction/app/api.ts）。紐付け（施策・評価シート → 事業）は api が持つ歳出の行の参照をたどるだけで、新しく判断しない
import { frameOf, OTHER_FRAME } from '../jurisdiction/domains'
import { listQuery, withExtras, type Kan, type YearData, type YearExtras, type Snapshot } from '../jurisdiction/app/data'
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

/** 施策の内訳が載る科目と、その款・項・目の名前。内訳を ID で引く（D1 の bind の上限に合わせて区切る）。自治体でも絞らないと、D1 が年度の索引でその年度の内訳を全部読む */
async function subjectOfDetails(env: Env, code: string, year: number, ids: string[]): Promise<Map<string, { subject: string; path: string[] }>> {
  const chunks = Array.from({ length: Math.ceil(ids.length / ID_CHUNK) }, (_, i) => ids.slice(i * ID_CHUNK, (i + 1) * ID_CHUNK))
  const pages = await Promise.all(chunks.map((c) => apiCall(env)('search_expenditure_details', { document_kind: 'initial', fiscal_year: { min: year, max: year }, where: { jurisdiction_code: { eq: [code] }, detail_id: { eq: c } }, page_size: 1000 } as DetailBody)))
  return new Map(pages.flatMap((r) => r.details.map((d) => [d.detail_id, { subject: d.subject_id, path: [d.kan_name, d.kou_name ?? '', d.moku_name ?? ''] }] as const)))
}

/** 款項目の行から、款・項・目の木と分野の合計を組む */
function yearDataOf(rows0: { rows: SubjectRows; kind: Kind; origin: string | null; originTitle: string | null }): YearData {
  // 款・項の行（項・目の番号が null）を子の目より前に並べる。null を文字列にすると "null" が数字より後ろになり、目が親の項を見失う
  const order = (r: SubjectRows[number]) => `${r.kan_code ?? ''}/${r.kou_code ?? ''}/${r.moku_code ?? ''}`
  const rows = [...rows0.rows].sort((a, b) => order(a).localeCompare(order(b)))
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
  return { kind: rows0.kind, kan, total: kan.reduce((s, k) => s + k.yen, 0), fields, fieldSubjects, looseMoku, origin: rows0.origin, originTitle: rows0.originTitle }
}
type SubjectRows = Awaited<ReturnType<typeof subjectsOf>>['rows']

/** 頁の1年度の、最初の画面に要る分。開いた年度の款項目と、タブが要るもの（予算・決算は会計ごとの総額、事業は一覧の1頁目）だけを読む。
 * 施策・評価シート・お金のかかる事業は残り（loadYearExtras）として、頁を描いた後にブラウザが読む（pending）。
 * tab を渡さない（ホームのまちの札）ときは残りもここで読んで足し、評価のある最新の年度の評価シートも持つ（evaluated） */
export async function loadYearSnapshot(env: Env, entry: CatalogEntry, year: number, opt: { evaluated?: boolean; tab?: PageTab } = {}): Promise<Snapshot> {
  const { tab } = opt
  const years = appYears(entry)
  const me = years.find((y) => y.year === year)
  if (!me) throw new Error(`頁に無い年度: ${year}`)
  const prev = years.find((y) => y.year === year - 1)
  // ホームのまちの札は、評価のある最新の年度の評価シートを出す
  const evalYear = opt.evaluated ? Math.max(0, ...entry.evaluationYears.filter((y) => years.some((x) => x.year === y))) : 0
  // 会計の札（予算・決算のタブ）。一般会計のほかにも会計を収録した年度だけ、会計ごとの総額を読む
  const accounts = entry.accounts?.[me.kind]?.[String(year)] ?? []
  const wantAccounts = (!tab || tab === 'money' || tab === 'settled') && accounts.length > 1
  // 事業のタブは一覧の1頁目（すべて）が最初の画面。年度と資料の種類だけで決まるので、款項目を待たずに読む
  const allQuery = listQuery({ code: entry.code, year, years: { [year]: { kind: me.kind } as YearData }, prev: undefined }, 'all')
  // ホームのまちの札は「新しく始めた事業」「やめた事業」も出す
  const homeLists = !tab && prev ? (['new', 'ended'] as const).map((f) => listQuery({ code: entry.code, year, years: { [year]: { kind: me.kind } as YearData }, prev: { year: prev.year, kind: prev.kind } }, f)) : []
  const [subjects, accountTotals, allPage, extras, evalSheets, homePages] = await Promise.all([
    subjectsOf(env, entry.code, year, me.kind).then((r) => {
      const origin = r.last?.origins?.find((o) => o.origin_id === r.rows[0]?.origin_id)
      return { kind: me.kind, rows: r.rows, origin: origin?.url ?? null, originTitle: origin?.title ?? null }
    }),
    wantAccounts ? loadAccountTotals(env, entry.code, year, me.kind, accounts) : Promise.resolve(undefined),
    tab === 'projects' ? readListPage(apiCall(env), allQuery) : Promise.resolve(undefined),
    tab ? Promise.resolve(undefined) : loadYearExtras(env, entry.code, year, me.kind),
    evalYear && evalYear !== year ? sheetsOf(env, entry.code, evalYear, evalYear).then((r) => r.rows.map(toSheet)) : Promise.resolve(null),
    Promise.all(homeLists.map((q) => readListPage(apiCall(env), q).then((p) => [listKey(q), p] as const))),
  ])
  const snapshot: Snapshot = {
    code: entry.code,
    name: entry.name,
    pop: entry.population?.people ?? 0,
    year,
    kinds: Object.fromEntries(years.map((y) => [String(y.year), y.kind])),
    years: { [year]: yearDataOf(subjects) },
    ...(prev ? { prev: { year: prev.year, kind: prev.kind } } : {}),
    ...(accountTotals ? { accounts: accountTotals } : {}),
    measures: [],
    sheets: [],
    ...(allPage ? { hasProjects: allPage.total > 0, lists: { [listKey(allQuery)]: allPage } } : { lists: {} }),
    pending: true,
  }
  if (!extras) return snapshot
  const full = withExtras(snapshot, { ...extras, lists: { ...extras.lists, ...Object.fromEntries(homePages) } })
  return evalYear ? { ...full, evaluated: { fy: evalYear, sheets: evalSheets ? withExtras(snapshot, { ...extras, measures: [], sheets: evalSheets }).sheets : full.sheets } } : full
}

type RawSheet = YearExtras['sheets'][number]
const toSheet = (s: Awaited<ReturnType<typeof sheetsOf>>['rows'][number]): RawSheet => ({
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
  path: [s.kan_name ?? '', s.kou_name ?? '', s.moku_name ?? ''],
  url: s.url ?? '',
  origin: s.origin_id,
  page: s.page,
})

/** 頁の1年度の残り（最初の画面に要らない分）。その年度の施策・評価シートと、事業の一覧（すべて）の1頁目。
 * 款項目は読まない（分野は画面が開いた年度の款項目から引く。withExtras） */
export async function loadYearExtras(env: Env, code: string, year: number, kind: Kind): Promise<YearExtras> {
  const allQuery = listQuery({ code, year, years: { [year]: { kind } as YearData }, prev: undefined }, 'all')
  const [measures, sheets, allPage] = await Promise.all([
    measuresOf(env, code, year, year).then(async (r) => {
      const ids = [...new Set(r.rows.flatMap((m) => (m.expenditure_detail_id ? [m.expenditure_detail_id] : [])))]
      const subjectOf = ids.length ? await subjectOfDetails(env, code, year, ids) : new Map<string, { subject: string; path: string[] }>()
      return r.rows.map((m) => {
        const at = m.expenditure_detail_id ? subjectOf.get(m.expenditure_detail_id) : undefined
        return {
          id: short(m.measure_id),
          fy: m.fiscal_year,
          title: m.title ?? '',
          new: m.is_new,
          yen: m.budget_yen,
          desc: (m.description ?? '').split('\n').filter(Boolean),
          detail: m.expenditure_detail_id,
          subject: at?.subject ?? null,
          path: at?.path ?? null,
          url: m.url ?? '',
          origin: m.origin_id,
          page: m.page,
        }
      })
    }),
    sheetsOf(env, code, year, year).then((r) => r.rows.map(toSheet)),
    readListPage(apiCall(env), allQuery),
  ])
  return { measures, sheets, hasProjects: allPage.total > 0, lists: { [listKey(allQuery)]: allPage } }
}

/** 前の年度の分野ごとの末端の科目。やめた事業を分野で絞るときだけ、画面が読む */
export async function loadFieldSubjects(env: Env, code: string, year: number, kind: Kind): Promise<YearData['fieldSubjects']> {
  const r = await subjectsOf(env, code, year, kind)
  const out: YearData['fieldSubjects'] = {}
  for (const s of r.rows) if (s.is_leaf) (out[fieldOf(s.cofog_code)] ??= []).push(s.subject_id)
  return out
}
