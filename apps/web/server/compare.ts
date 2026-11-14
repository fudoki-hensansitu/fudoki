// まち比べ（/compare）の似たまち。全部のまちを読まず、近い順の上位だけを api（分野の割合）と web の D1（人口）に聞く
import { frameOf, OTHER_FRAME } from '../jurisdiction/domains'
import type { DocumentKind } from './jurisdiction'
import type { Env } from './env'
import { apiCall, type WebOpOutput } from './fudoki-api'
import { logError } from './log'
import { loadPopulations } from './population'

export type TownRef = { code: string; name: string; pop: number }
/** 総額と、分野（DOMAIN_FRAMES の id。分類できないものは other）ごとの額 */
export type FieldTotals = { total: number; fields: Record<string, number> }
export type CompareVersion = { code: string; year: number; kind: DocumentKind }

type Totals = WebOpOutput<'list_expenditures'>['expenditures'][number]
const DIVISIONS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10'] as const
const ACCOUNT = '一般会計'
const keyOf = (v: CompareVersion) => `${v.code}:${v.year}:${v.kind}`

/** 歳出の根の額を分野ごとの額にする。総額の無い（科目の表の無い）根は undefined */
function fieldTotalsOf(t: Totals): FieldTotals | undefined {
  if (t.total_yen == null || !(t.total_yen > 0)) return undefined
  const fields: Record<string, number> = {}
  const add = (id: string, yen: number | null) => yen && (fields[id] = (fields[id] ?? 0) + yen)
  for (const d of DIVISIONS) add((frameOf(d) ?? OTHER_FRAME).id, t[`cofog_${d}_yen`])
  add(OTHER_FRAME.id, t.cofog_unclassified_yen)
  return { total: t.total_yen, fields }
}

/** 比べる資料ごとの一般会計の総額と分野の額（歳出の集約から1回で引く）。額の無い資料は入らない */
export async function loadFieldTotals(env: Env, versions: CompareVersion[]): Promise<(v: CompareVersion) => FieldTotals | undefined> {
  const { expenditures } = await apiCall(env)('list_expenditures', { versions: versions.map((v) => ({ jurisdiction_code: v.code, fiscal_year: v.year, document_kind: v.kind })) })
  const out = new Map<string, FieldTotals>()
  for (const e of expenditures) {
    const t = e.account_name === ACCOUNT ? fieldTotalsOf(e) : undefined
    if (t) out.set(keyOf({ code: e.jurisdiction_code, year: e.fiscal_year, kind: e.document_kind }), t)
  }
  return (v) => out.get(keyOf(v))
}

// 人口の近い順に、この数のまちを api に渡して収録のあるまちだけに絞る
const POPULATION_CANDIDATES = 100
const POPULATION_SQL =
  'WITH latest AS (SELECT jurisdiction_code, population FROM population p WHERE reference_date = (SELECT max(reference_date) FROM population q WHERE q.jurisdiction_code = p.jurisdiction_code)) ' +
  "SELECT jurisdiction_code FROM latest WHERE jurisdiction_code <> ?1 AND population > 0 AND (substr(jurisdiction_code, 3, 3) = '000') = (substr(?1, 3, 3) = '000') " +
  'ORDER BY max(population, ?2) * 1.0 / min(population, ?2), jurisdiction_code LIMIT ?3'

/** 人口の比（何倍か）で近い順 */
const byRatio = (pop: number) => (x: TownRef, y: TownRef) => Math.max(x.pop, pop) / Math.min(x.pop, pop) - Math.max(y.pop, pop) / Math.min(y.pop, pop)

/** a に似たまち。byUse は同じ年度・資料の一般会計で分野の割合が近い順、byPopulation は人口が近い順。どちらも同じ資料の収録があるまちだけ。読めなければ空 */
export async function similarTowns(env: Env, a: { code: string; pop: number }, year: number, kind: DocumentKind, n: number): Promise<{ byUse: TownRef[]; byPopulation: TownRef[] }> {
  const api = apiCall(env)
  const query = { jurisdiction_code: a.code, fiscal_year: year, document_kind: kind }
  const withPop = async (rows: { jurisdiction_code: string; name: string }[]): Promise<TownRef[]> => {
    const pops = await loadPopulations(env, rows.map((r) => r.jurisdiction_code))
    return rows.map((r) => ({ code: r.jurisdiction_code, name: r.name, pop: pops.get(r.jurisdiction_code)?.at(-1)?.people ?? 0 }))
  }
  const useOf = async () => withPop((await api('list_similar_expenditures', { ...query, limit: n })).expenditures)
  const populationOf = async () => {
    // D1 が無い（preview・手元の試験）ときは探さない
    const statement = env.DB?.prepare(POPULATION_SQL).bind(a.code, a.pop, POPULATION_CANDIDATES)
    if (!a.pop || !statement?.all) return []
    const { results } = await statement.all<{ jurisdiction_code: string }>()
    if (!results.length) return []
    const covered = await api('list_similar_expenditures', { ...query, among: results.map((r) => r.jurisdiction_code), limit: POPULATION_CANDIDATES })
    return (await withPop(covered.expenditures)).filter((t) => t.pop > 0).sort(byRatio(a.pop)).slice(0, n)
  }
  const safe = (p: Promise<TownRef[]>) => p.catch((e) => (logError(e), [] as TownRef[]))
  const [byUse, byPopulation] = await Promise.all([safe(useOf()), safe(populationOf())])
  return { byUse, byPopulation }
}
