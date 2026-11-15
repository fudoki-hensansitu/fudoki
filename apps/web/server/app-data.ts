// 自治体の頁（アプリ型）のデータ。apps/api の歳出・事業・予算案・事業評価の検索から、1年度の款項目・施策・評価シートの区分ごとの数と事業の一覧の1頁目を組む。
// 頁の loader は最初の画面に要る分（loadYearSnapshot）だけを読み、残り（loadYearExtras）は頁を描いた後にブラウザが web の /api/jurisdictions/:code/:year/extras から読む。
// 事業の続き・詳細は画面が web の /api から読む（jurisdiction/app/api.ts）。紐付け（施策・評価シート → 事業）は api が持つ歳出の行の参照をたどるだけで、新しく判断しない
import { frameOf, OTHER_FRAME } from '../jurisdiction/domains'
import { listQuery, withExtras, type Kan, type YearData, type YearExtras, type Snapshot } from '../jurisdiction/app/data'
import { listKey, readListPage, readSheetCounts, toSheet } from '../jurisdiction/app/api'
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

type CodedSubject = { kan_code: string | null; kou_code: string | null; moku_code: string | null }
/** 款・項・目の番号を数として比べる（文字で比べると 10 が 2 より前に来る）。番号の無い目（廃目など）は同じ項の最後に置く */
const codeNumber = (c: string | null) => (c != null && c !== '' && Number.isFinite(Number(c)) ? Number(c) : Number.MAX_SAFE_INTEGER)
const bySubjectCode = (a: CodedSubject, b: CodedSubject) =>
  codeNumber(a.kan_code) - codeNumber(b.kan_code) || codeNumber(a.kou_code) - codeNumber(b.kou_code) || codeNumber(a.moku_code) - codeNumber(b.moku_code)

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

/** 1年度の評価シートを全部（ホームのまちの札だけが使う。自治体の頁は頁ごとに読む） */
const sheetsOf = (env: Env, code: string, year: number) =>
  all(
    (token) => apiCall(env)('search_evaluation_sheets', { fiscal_year: { min: year, max: year }, where: { jurisdiction_code: { eq: [code] }, account_name: { eq: [ACCOUNT] } }, page_size: 1000, ...(token ? { page_token: token } : {}) } as SheetBody),
    (r) => r.sheets.map((s) => toSheet(s, r.origins)),
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

type TreeSubject = CodedSubject & { subject_id: string; parent_subject_id: string | null; level: string; name: string; amount_yen: number | null; is_leaf: boolean; cofog_code?: string | null }
/** 1年度の款・項・目の木と、分野ごとの合計・末端の科目。親の項の行が無い目は looseMoku */
export function subjectTree(subjects: readonly TreeSubject[]) {
  const rows = [...subjects].sort(bySubjectCode)
  const kan: Kan[] = []
  const fields: Record<string, number> = {}
  const fieldSubjects: Record<string, string[]> = {}
  const looseMoku: YearData['looseMoku'] = []
  // 親は parent_subject_id で引く（並びの前後に頼らない）。款・項・目の順に段ごとに読むので、親は子より先に入る
  const kanById = new Map<string, Kan>()
  const kouById = new Map<string, Kan['kou'][number]>()
  for (const r of (['款', '項', '目'] as const).flatMap((level) => rows.filter((x) => x.level === level))) {
    const yen = r.amount_yen ?? 0
    if (r.is_leaf) (fieldSubjects[fieldOf(r.cofog_code)] ??= []).push(r.subject_id)
    if (r.level === '款') {
      const k: Kan = { name: r.name, yen, kou: [] }
      kan.push(k)
      kanById.set(r.subject_id, k)
    } else if (r.level === '項') {
      const o = { name: r.name, yen, moku: [] }
      kanById.get(r.parent_subject_id ?? '')?.kou.push(o)
      kouById.set(r.subject_id, o)
    } else if (r.level === '目') {
      const field = fieldOf(r.cofog_code)
      const kou = kouById.get(r.parent_subject_id ?? '')
      ;(kou?.moku ?? looseMoku).push({ id: r.subject_id, name: r.name, yen, field, cofog: r.cofog_code ?? null })
      fields[field] = (fields[field] ?? 0) + yen
    }
  }
  return { kan, fields, fieldSubjects, looseMoku }
}

/** 施策の内訳が載る科目と、その款・項・目の名前。内訳を ID で引く（D1 の bind の上限に合わせて区切る）。自治体でも絞らないと、D1 が年度の索引でその年度の内訳を全部読む */
async function subjectOfDetails(env: Env, code: string, year: number, ids: string[]): Promise<Map<string, { subject: string; path: string[] }>> {
  const chunks = Array.from({ length: Math.ceil(ids.length / ID_CHUNK) }, (_, i) => ids.slice(i * ID_CHUNK, (i + 1) * ID_CHUNK))
  const pages = await Promise.all(chunks.map((c) => apiCall(env)('search_expenditure_details', { document_kind: 'initial', fiscal_year: { min: year, max: year }, where: { jurisdiction_code: { eq: [code] }, detail_id: { eq: c } }, page_size: 1000 } as DetailBody)))
  return new Map(pages.flatMap((r) => r.details.map((d) => [d.detail_id, { subject: d.subject_id, path: [d.kan_name, d.kou_name ?? '', d.moku_name ?? ''] }] as const)))
}

/** 款項目の行から、款・項・目の木と分野の合計を組む */
function yearDataOf(rows0: { rows: SubjectRows; kind: Kind; origin: string | null; originTitle: string | null }): YearData {
  const { kan, fields, fieldSubjects, looseMoku } = subjectTree(rows0.rows)
  return { kind: rows0.kind, kan, total: kan.reduce((s, k) => s + k.yen, 0), fields, fieldSubjects, looseMoku, origin: rows0.origin, originTitle: rows0.originTitle }
}
type SubjectRows = Awaited<ReturnType<typeof subjectsOf>>['rows']

/** 頁の1年度の、最初の画面に要る分。開いた年度の款項目と、タブが要るもの（予算・決算は会計ごとの総額、事業は一覧の1頁目）だけを読む。
 * 施策・評価シート・お金のかかる事業は残り（loadYearExtras）として、loader が defer で後から流す（pending）。
 * tab を渡さない（ホームのまちの札）ときは残りもここで読んで足し、評価のある最新の年度の評価シートも持つ（evaluated） */
export async function loadYearSnapshot(env: Env, entry: CatalogEntry, year: number, opt: { evaluated?: boolean; tab?: PageTab } = {}): Promise<Snapshot> {
  const { tab } = opt
  const years = appYears(entry)
  const me = years.find((y) => y.year === year)
  if (!me) throw new Error(`頁に無い年度: ${year}`)
  const prev = years.find((y) => y.year === year - 1)
  // 款項目を読む資料。予算・決算のタブはその資料（収録のある年度だけ）、ほかは年度の資料（決算のある年度は決算）。
  // 事業のタブは、決算に事業の内訳が無く当初予算にはある年度（真岡のように決算書が事業を載せない自治体）なら当初予算の事業を並べる
  const has = (k: Kind) => (k === 'initial' ? entry.initialYears : entry.settlementYears).includes(year)
  const docKind: Kind = tab === 'money' && has('initial') ? 'initial' : tab === 'settled' && has('settlement') ? 'settlement' : me.kind
  const queryOf = (k: Kind) => listQuery({ code: entry.code, year, years: { [year]: { kind: k } as YearData }, prev: undefined }, 'all')
  const subjectsAs = (k: Kind) =>
    subjectsOf(env, entry.code, year, k).then((r) => {
      const origin = r.last?.origins?.find((o) => o.origin_id === r.rows[0]?.origin_id)
      return { kind: k, rows: r.rows, origin: origin?.url ?? null, originTitle: origin?.title ?? null }
    })
  // 事業のタブは一覧の1頁目（すべて）が最初の画面。年度と資料の種類だけで決まるので、款項目を待たずに読む
  const fallback: Kind | undefined = tab === 'projects' && me.kind === 'settlement' && has('initial') ? 'initial' : undefined
  const projectPage = tab === 'projects'
    ? Promise.all([readListPage(apiCall(env), queryOf(docKind)), fallback ? readListPage(apiCall(env), queryOf(fallback)).catch(() => undefined) : undefined]).then(([own, alt]) =>
        own.total === 0 && alt && alt.total > 0 ? { kind: fallback!, page: alt } : { kind: docKind, page: own },
      )
    : Promise.resolve(undefined)
  const ownSubjects = subjectsAs(docKind)
  // 事業を当初予算から並べると使わないので、読めなくても投げっぱなしにしない
  ownSubjects.catch(() => undefined)
  // ホームのまちの札は、評価のある最新の年度の評価シートを出す
  const evalYear = opt.evaluated ? Math.max(0, ...entry.evaluationYears.filter((y) => years.some((x) => x.year === y))) : 0
  // 会計の札（予算・決算のタブ）。一般会計のほかにも会計を収録した年度だけ、会計ごとの総額を読む（検索1回）。
  // まとめ・事業のタブの頁でも読んでおく（予算・決算のタブへ移ったとき、loader を待つあいだも札を出して流れの図がずれないように）
  const accounts = entry.accounts?.[docKind]?.[String(year)] ?? []
  const wantAccounts = accounts.length > 1
  // ホームのまちの札は「新しく始めた事業」「やめた事業」も出す
  const homeLists = !tab && prev ? (['new', 'ended'] as const).map((f) => listQuery({ code: entry.code, year, years: { [year]: { kind: me.kind } as YearData }, prev: { year: prev.year, kind: prev.kind } }, f)) : []
  const [projects, accountTotals, extras, evalSheets, homePages] = await Promise.all([
    projectPage,
    wantAccounts ? loadAccountTotals(env, entry.code, year, docKind, accounts) : Promise.resolve(undefined),
    tab ? Promise.resolve(undefined) : loadYearExtras(env, entry.code, year, me.kind),
    evalYear ? sheetsOf(env, entry.code, evalYear).then((r) => r.rows) : Promise.resolve(null),
    Promise.all(homeLists.map((q) => readListPage(apiCall(env), q).then((p) => [listKey(q), p] as const))),
  ])
  // 事業を当初予算から並べるときは、分野で絞れるよう款項目も当初予算のものにする
  const subjects = await (projects && projects.kind !== docKind ? subjectsAs(projects.kind) : ownSubjects)
  const allPage = projects?.page
  const allQuery = queryOf(subjects.kind)
  const snapshot: Snapshot = {
    code: entry.code,
    name: entry.name,
    pop: entry.population?.people ?? 0,
    year,
    // 開いた年度は、款項目を読んだ資料（予算のタブなら当初予算）
    kinds: { ...Object.fromEntries(years.map((y) => [String(y.year), y.kind])), [String(year)]: subjects.kind },
    years: { [year]: yearDataOf(subjects) },
    ...(prev ? { prev: { year: prev.year, kind: prev.kind } } : {}),
    // 会計の札は款項目と同じ資料のものだけ渡す（事業のタブで当初予算の事業を並べたときは、決算で読んだ札を捨てる）
    ...(accountTotals && subjects.kind === docKind ? { accounts: accountTotals } : {}),
    measures: [],
    sheetCounts: [],
    ...(allPage ? { hasProjects: allPage.total > 0, lists: { [listKey(allQuery)]: allPage } } : { lists: {} }),
    pending: true,
  }
  if (!extras) return snapshot
  const full = withExtras(snapshot, { ...extras, lists: { ...extras.lists, ...Object.fromEntries(homePages) } })
  return evalSheets ? { ...full, evaluated: { fy: evalYear, sheets: evalSheets } } : full
}

/** 頁の1年度の残り（最初の画面に要らない分）。その年度の施策・評価シートの区分ごとの数と、事業の一覧（すべて）の1頁目。
 * 款項目は読まない（分野は画面が開いた年度の款項目から引く。withExtras） */
export async function loadYearExtras(env: Env, code: string, year: number, kind: Kind): Promise<YearExtras> {
  const allQuery = listQuery({ code, year, years: { [year]: { kind } as YearData }, prev: undefined }, 'all')
  const [measures, sheetCounts, allPage] = await Promise.all([
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
    readSheetCounts(apiCall(env), { code, year }),
    readListPage(apiCall(env), allQuery),
  ])
  return { measures, sheetCounts, hasProjects: allPage.total > 0, lists: { [listKey(allQuery)]: allPage } }
}

/** 前の年度の分野ごとの末端の科目。やめた事業を分野で絞るときだけ、画面が読む */
export async function loadFieldSubjects(env: Env, code: string, year: number, kind: Kind): Promise<YearData['fieldSubjects']> {
  const r = await subjectsOf(env, code, year, kind)
  const out: YearData['fieldSubjects'] = {}
  for (const s of r.rows) if (s.is_leaf) (out[fieldOf(s.cofog_code)] ??= []).push(s.subject_id)
  return out
}
